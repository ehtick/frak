import Renderer from "../renderers/Renderer";
import Material, { RendererType as Type, TransparencyType as Transparency } from "../materials/Material";
import RenderingContext from "../RenderingContext";
import Shader from "../shaders/Shader";

class View {
	private batches: number[][][] = [];
	public count = 0;

	constructor(private filter: (renderer: Renderer) => boolean) {}

	batch(allRenderers: Renderer[], list: number[][][]) {
		this.batches = [];

		for (const shaderGroup of list) {
			const filteredShaderGroup: number[][] = [];
			for (const materialGroup of shaderGroup) {
				const filteredMaterialGroup: number[] = [];
				for (const i of materialGroup) {
					if (this.filter(allRenderers[i])) {
						filteredMaterialGroup.push(i);
						this.count++;
					}
				}

				if (filteredMaterialGroup.length > 0) {
					filteredShaderGroup.push(filteredMaterialGroup);
				}
			}

			if (filteredShaderGroup.length > 0) {
				this.batches.push(filteredShaderGroup);
			}
		}
	}

	run(
		context: RenderingContext,
		baseShader: Shader,
		filteredRenderers: Renderer[],
		shaderSelectAndBind = (renderer: Renderer): Shader => {
			const s = context.selectShader(baseShader, renderer.material.definitions);
			s.use();
			return s;
		},
		materialBind = (m: Material, s: Shader) => {
			s.bindUniforms(m.uniforms);
			s.bindSamplers(m.samplers);
		},
		render = (r: Renderer, s: Shader) => {
			r.renderGeometry(context, s);
		}
	) {
		for (const shaderGroup of this.batches) {
			let shader = null;
			for (const materialGroup of shaderGroup) {
				let material = null;
				for (const i of materialGroup) {
					const renderer = filteredRenderers[i];
					if (renderer) {
						if (!shader) {
							shader = shaderSelectAndBind(renderer);
						}

						if (!material) {
							material = renderer.material;
							materialBind(material, shader);
						}

						render(renderer, shader);
					}
				}
			}
		}
	}
}

// Shorthand to get the material properties of a renderer
const g = (r: Renderer) => r.material.properties;

class RendererOrganizer {
	private views: View[] = [];

	public opaqueRenderers = this.addView(new View(r => g(r).type === Type.PBR));	// Include transparent renderers for the opaque parts
	public transparentRenderers = this.addView(
		new View(r => g(r).transparency === Transparency.Transparent && g(r).type !== Type.Custom)	// Include all but custom renderers for the transparent parts
	);
	public unlitRenderers = this.addView(new View(r => g(r).type === Type.Unlit));	// Include transparent renderers for the opaque parts
	public customRenderers = this.addView(new View(r => g(r).type === Type.Custom));

	addView(view: View): View {
		this.views.push(view);
		return view;
	}

	private updateViews(allRenderers: Renderer[], list: number[][][]) {
		for (const view of this.views) {
			view.batch(allRenderers, list);
		}
	}

	/** Updates Views to group renderers by shader and material.
	 *  Call this when order or structure of allRenderers changes */
	batch(allRenderers: Renderer[]) {
		// TODO: Material hash instead of id
		const shaderIndices = new Map<number, number>();	// Definitions hash -> materials
		const materialIndices = new Map<number, number>();	// Material id -> index

		const list: number[][][] = [];	// list[Shader][Material][Renderer index]

		for (let i = 0; i < allRenderers.length; i++) {
			const material = allRenderers[i].material;

			if (!shaderIndices.has(material.definitions.hash)) {
				shaderIndices.set(material.definitions.hash, list.length);
				list.push([]);
			}
			const shaderIndex = shaderIndices.get(material.definitions.hash);

			if (!materialIndices.has(material.id)) {
				materialIndices.set(material.id, list[shaderIndex].length);
				list[shaderIndex].push([]);
			}
			const materialIndex = materialIndices.get(material.id);

			list[shaderIndex][materialIndex].push(i);
		}

		this.updateViews(allRenderers, list);
	}
}

globalThis.RendererOrganizer = RendererOrganizer;
export {RendererOrganizer as default, View};
