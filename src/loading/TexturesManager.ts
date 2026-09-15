import Manager from 'loading/Manager';
import TextureDescriptor from 'scene/descriptors/TextureDescriptor';
import CubeTexture from 'rendering/materials/CubeTexture';
import CubeTextureDescriptor from 'scene/descriptors/CubeTextureDescriptor';
import Texture from 'rendering/materials/Texture';
import type AssetServer from 'loading/AssetServer';

type Descriptors = TextureDescriptor | CubeTextureDescriptor;
type Resources = Texture | CubeTexture;
type TextureParameters = [TextureDescriptor, Texture];
type CubeTextureParameters = [CubeTextureDescriptor, CubeTexture];
type LoadResourceParameters = TextureParameters | CubeTextureParameters;

type ResourceType<T extends  Descriptors> =
	T extends TextureDescriptor ? Texture :
	(T extends CubeTextureDescriptor ? CubeTexture : never);

/** External texture instance. */
class TexturesManager extends Manager<Descriptors, Resources> {
	context: any;
	/** Decoded images, keyed by the path they were loaded from, so an image shared by
		several textures is only read and decoded once */
	imageCache: Map<string, Promise<HTMLImageElement>> = new Map();

	/**
	 * Constructor
	 * @param renderingContext Instance of RenderingContext
	 * @param assetsPath Default search path for any assets requested
	 * @param assetServer Server used to read asset data
	 */
	constructor(context, assetsPath?, assetServer?: AssetServer) {
		super(assetsPath, assetServer);
		this.context = context;
	}

	/** Reads and decodes the image at the given path, reusing an in-flight or finished decode
		@param path Full path of the image
		@return Decoded image */
	protected async loadImage(path: string): Promise<HTMLImageElement> {
		let image = this.imageCache.get(path);

		if (image === undefined) {
			image = (async () => {
				const asset = await this.assetServer.load(path);

				try {
					return await asset.image();
				} finally {
					// The image keeps its own decoded copy, so the bytes are no longer needed
					asset.dispose();
					this.assetServer.unpublish(path);
				}
			})();

			this.imageCache.set(path, image);
		}

		return image;
	}

	/** Adds new texture descriptor to loading queue. This is a helper
		function to load textures simply by providing path */
	add(source): any {
		source = this.sourceCallback(source);
		var d = new TextureDescriptor(source);
		return this.addDescriptor(d);
	}

	/** Adds a new cube texture
		* @param sources Array of 6 image URIs
		* @return CubeTexture
		*/
	addCube(sources): any {
		if (sources.length != 6)
			throw "TexturesManager.addCube: Cube textures require 6 image URIs";
		var descriptors = [];
		var cube = new CubeTextureDescriptor();
		for (var i=0; i<sources.length; i++) {
			cube.sources.push(this.sourceCallback(sources[i]));
		}
		return this.addDescriptor(cube);
	}

	createResource<T extends Descriptors>(descriptor: T): ResourceType<T> {
		let texture: CubeTexture | Texture;
		if (descriptor instanceof CubeTextureDescriptor) {
			texture = new CubeTexture(this.context);
			texture.name = descriptor.sources[0];
			return texture as ResourceType<T>;
		} else {
			texture = new Texture(this.context);
			texture.name = descriptor.source;
			return texture as ResourceType<T>;
		}
	}

	addDescriptor<T extends Descriptors>(descriptor: T): ResourceType<T> {
		return super.addDescriptor(descriptor) as ResourceType<T>;
	}

	async loadResource(...[textureDescriptor, textureResource]: LoadResourceParameters) {
		const descriptor = this.descriptorCallback(textureDescriptor);

		try {
			if (!(textureDescriptor instanceof CubeTextureDescriptor)) {
				const image = await this.loadImage(descriptor.getFullPath());
				(textureResource as Texture).setImage(this.context, image);

				return [descriptor, textureResource] as TextureParameters;
			} else {
				const faces = [
					CubeTexture.FRONT,
					CubeTexture.BACK,
					CubeTexture.LEFT,
					CubeTexture.RIGHT,
					CubeTexture.BOTTOM,
					CubeTexture.TOP
				];

				const loading = [];
				for (const face of faces) {
					loading.push((async () => {
						const image = await this.loadImage((descriptor as CubeTextureDescriptor).sources[face]);
						(textureResource as CubeTexture).setFace(this.context, face, image);
					})());
				}

				await Promise.all(loading);

				return [descriptor, textureResource] as CubeTextureParameters;
			}
		} catch (e) {
			throw descriptor;
		}
	}
}

globalThis.TexturesManager = TexturesManager;
export default TexturesManager;
