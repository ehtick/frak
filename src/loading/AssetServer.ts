/* eslint-disable max-classes-per-file */
/** Bytes an in-memory asset can be created from. */
type AssetBytes = ArrayBuffer | ArrayBufferView<ArrayBuffer> | Blob | string;

/**
 * A single loaded asset.
 *
 * An asset is backed either by bytes that are already in memory or by a URL that the browser can
 * read on its own. Managers do not care which: they ask for the representation they need
 * (`arrayBuffer`, `text`, `image`, ...) and the asset produces it, fetching lazily and only once.
 */
class Asset {
	private bytes?: Promise<ArrayBuffer>;
	private objectUrl?: string;

	/**
	 * @param path Path the asset was requested with, for diagnostics
	 * @param url URL the browser can read the bytes from, if the source has one
	 * @param source Bytes, if they are already in memory
	 * @param mimeType Media type, when the source knows it
	 */
	protected constructor(
		public readonly path: string,
		public readonly url?: string,
		private readonly source?: AssetBytes,
		public readonly mimeType = "",
	) {}

	/** Asset whose bytes the browser can read itself (http(s):, data:, blob:, ...) */
	static fromUrl(path: string, url = path, mimeType?: string) {
		return new Asset(path, url, undefined, mimeType);
	}

	/** Asset over bytes that are already loaded */
	static fromBytes(path: string, source: AssetBytes, mimeType?: string) {
		return new Asset(path, undefined, source, mimeType);
	}

	/** @return The asset as an ArrayBuffer, fetching it if it is URL-backed */
	async arrayBuffer(): Promise<ArrayBuffer> {
		this.bytes ??= (async () => {
			if (this.source !== undefined) {
				if (this.source instanceof ArrayBuffer) {
					return this.source;
				}

				if (typeof this.source === "string") {
					return new TextEncoder().encode(this.source).buffer;
				}

				if (this.source instanceof Blob) {
					return this.source.arrayBuffer();
				}

				// ArrayBufferView: copy out just the view's window
				return this.source.buffer.slice(
					this.source.byteOffset,
					this.source.byteOffset + this.source.byteLength,
				);
			}

			const response = await fetch(this.url);
			if (!response.ok) {
				throw new Error(`Failed to load ${this.path}: ${response.status} ${response.statusText}`);
			}

			return response.arrayBuffer();
		})();

		return this.bytes;
	}

	/** @return The asset decoded as UTF-8 text */
	async text(): Promise<string> {
		if (typeof this.source === "string") {
			return this.source;
		}

		if (this.source instanceof Blob) {
			return this.source.text();
		}

		// Decode in-memory bytes where they are, rather than slicing them out first
		return new TextDecoder().decode(this.source ?? await this.arrayBuffer());
	}

	/** @return The asset parsed as JSON */
	async json(): Promise<any> {
		return JSON.parse(await this.text());
	}

	/** @return The asset as a Blob, tagged with its media type if known */
	async blob(): Promise<Blob> {
		if (this.source instanceof Blob) {
			return this.source;
		}

		// Blob construction copies, so hand it the source directly instead of a sliced copy of it
		return new Blob(
			[this.source ?? await this.arrayBuffer()],
			this.mimeType ? { type: this.mimeType } : undefined,
		);
	}

	/**
	 * Decodes the asset as an image.
	 *
	 * Returns an HTMLImageElement rather than an ImageBitmap on purpose: WebGL ignores
	 * UNPACK_FLIP_Y_WEBGL, UNPACK_PREMULTIPLY_ALPHA_WEBGL and UNPACK_COLORSPACE_CONVERSION_WEBGL
	 * for ImageBitmap sources, so a bitmap would silently drop the flipY and colour space handling
	 * in BaseTexture.applyOptions. Decoding to a bitmap instead requires baking the orientation in
	 * here via createImageBitmap's `imageOrientation`, which means the texture's options have to be
	 * final before the decode.
	 *
	 * @return Decoded image; call dispose() once it has been uploaded
	 */
	async image(): Promise<HTMLImageElement> {
		const src = this.url ?? await this.blobUrl();

		return new Promise((resolve, reject) => {
			const image = new Image();

			image.crossOrigin = "anonymous";
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error(`Failed to decode image ${this.path}`));
			image.src = src;
		});
	}

	/** @return A URL for the asset, creating an object URL for in-memory bytes */
	async blobUrl(): Promise<string> {
		this.objectUrl ??= URL.createObjectURL(await this.blob());

		return this.objectUrl;
	}

	/** Releases the object URL created by blobUrl(), if any. The asset stays usable. */
	dispose() {
		if (this.objectUrl) {
			URL.revokeObjectURL(this.objectUrl);
			this.objectUrl = undefined;
		}
	}
}

/** Reads one asset. Registered per URI scheme on an AssetServer. */
type AssetReader = (path: string, server: AssetServer) => Promise<Asset>;

const schemePattern = /^([a-z][a-z0-9+.-]*):/i;

/** Reads anything the browser can fetch: http(s):, data:, blob: and scheme-relative paths. */
const fetchReader: AssetReader = async path => Asset.fromUrl(path);

/**
 * Resolves asset paths to bytes.
 *
 * Every manager loads through `load`, so adding a way to read assets - from disk, from an archive,
 * from a virtual file system - is a matter of registering a reader for its URI scheme:
 *
 *     assets.register("disk", async path => Asset.fromBytes(path, await readFile(strip(path))));
 *
 * Paths without a scheme fall through to `defaultReader` (fetch), which is what every existing
 * relative asset path uses.
 *
 * Data that is already in memory - a texture embedded in a .glb, say - is published with
 * `publish`, which returns a path that can be handed to a descriptor like any other source.
 */
class AssetServer {
	/** Scheme used by publish() for already-loaded data */
	static readonly memoryScheme = "mem";

	private readonly readers: Map<string, AssetReader> = new Map();
	private readonly published: Map<string, Asset> = new Map();
	private nextId = 0;

	/** Reader used for paths with no scheme, or with a scheme no reader is registered for */
	defaultReader: AssetReader = fetchReader;

	constructor() {
		this.register(AssetServer.memoryScheme, async path => {
			const asset = this.published.get(path);
			if (!asset) {
				throw new Error(`No published asset at ${path}`);
			}

			return asset;
		});
	}

	/** Registers a reader for a URI scheme, without the trailing colon */
	register(scheme: string, reader: AssetReader) {
		this.readers.set(scheme.toLowerCase(), reader);
	}

	/** @return Whether a reader is registered for the scheme of the given path */
	handles(path: string): boolean {
		const scheme = schemePattern.exec(path);

		return !!scheme && this.readers.has(scheme[1].toLowerCase());
	}

	/**
	 * Publishes data that is already loaded, so it can be requested like any other asset.
	 * @param data Bytes to publish
	 * @param mimeType Media type of the data, if known
	 * @param name Name to include in the path, for diagnostics
	 * @return Path the data can be loaded from, until unpublish() is called
	 */
	publish(data: AssetBytes, mimeType?: string, name = "asset"): string {
		const path = `${AssetServer.memoryScheme}:${this.nextId++}/${name}`;

		this.published.set(path, Asset.fromBytes(path, data, mimeType));

		return path;
	}

	/** Drops a published asset and releases any object URL it created */
	unpublish(path: string) {
		this.published.get(path)?.dispose();
		this.published.delete(path);
	}

	/**
	 * Loads the asset at the given path.
	 * @param path Full path or URI of the asset
	 * @return The loaded asset
	 */
	async load(path: string): Promise<Asset> {
		const scheme = schemePattern.exec(path);
		const reader = scheme ? this.readers.get(scheme[1].toLowerCase()) : undefined;

		return (reader ?? this.defaultReader)(path, this);
	}
}

globalThis.Asset = Asset;
globalThis.AssetServer = AssetServer;
export { Asset, type AssetBytes, type AssetReader };
export default AssetServer;
