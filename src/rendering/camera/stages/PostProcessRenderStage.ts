import RenderStage from './RenderStage';
import Sampler from 'rendering/shaders/Sampler';
import Material from 'rendering/materials/Material';
import ScreenQuad from '../ScreenQuad';
import TargetTextureFloat from '../TargetTextureFloat';
import RenderingContext from 'rendering/RenderingContext';
import Scene from 'scene/Scene';
import Camera from '../Camera';

/**
 * Render-stage used to render MaterialRenderStage to a texture,
 * then apply sub-stages to it and then render the resulting texture
 * to a screen-aligned quad that covers the entire viewport.
 */
abstract class PostProcessRenderStage extends RenderStage {
	size: any;
	src: TargetTextureFloat;
	dst: TargetTextureFloat;
	srcSampler: Sampler;
	dstSampler: Sampler;
	screenQuad: ScreenQuad;
	material: Material;
	generator: RenderStage;

	protected constructor() {
		super();
		this.size = false;

		this.generator = this.getGeneratorStage();
		this.generator.parent = this;
	}

	setSize(width, height): any {
		if (this.size === false)
			this.size = vec2.create();
		this.size[0]=width;
		this.size[1]=height;
	}

	abstract getGeneratorStage(): RenderStage;

	onStart(context, engine, camera): any {
		if (!this.size) {
			this.size = vec2.clone(camera.target.size);
		}

		this.src = new TargetTextureFloat(this.size, context, false, false);
		this.srcSampler = new Sampler('src', this.src.texture);

		this.dst = new TargetTextureFloat(this.size, context, false, false);
		this.dstSampler = new Sampler('src', this.dst.texture);

		this.material = new Material(
			// engine.assetsManager.addShaderSource("shaders/default/ScreenQuad"),
			engine.assetsManager.addShader('shaders/uv.vert', 'shaders/quad.frag'),
			{},
			[]
		);
		this.material.name = 'To Screen';

		this.screenQuad = new ScreenQuad(context);

		engine.assetsManager.load(() => {
			if (!this.material.shader.linked) {
				this.material.shader.link();
			}

			// Cameras need the shader to be linked so they can init their uniform block
			engine.initCameras(this.material.shader.program);
		});

		this.generator.start(context, engine, camera);
	}

	onPreRender(context: RenderingContext, scene: Scene, camera: Camera) {
		var cameraTarget = camera.target;

		if (cameraTarget.size[0] != this.src.size[0] || cameraTarget.size[1] != this.src.size[1]) {
			this.setSize(cameraTarget.size[0], cameraTarget.size[1]);
			this.src.setSize(cameraTarget.size[0], cameraTarget.size[1]);
			this.dst.setSize(cameraTarget.size[0], cameraTarget.size[1]);

			this.src.resetViewport();
			this.dst.resetViewport();
		}

		camera.target = this.src;
		this.generator.render(context, scene, camera);
		camera.target = cameraTarget;
	}

	onPostRender(context: RenderingContext, scene: Scene, camera: Camera) {
		camera.target.bind(context);
		this.renderEffect(context, this.material, this.srcSampler);
		camera.target.unbind(context);

		this.swapBuffers();
	}

	swapBuffers(): any {
		var tmpTexture = this.src;
		var tmpSampler = this.srcSampler;
		this.src = this.dst;
		this.srcSampler = this.dstSampler;
		this.dst = tmpTexture;
		this.dstSampler = tmpSampler;
	}

	renderEffect(context, material, sampler, uniforms = {}) {
		var gl = context.gl;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.clearColor(0.0, 0.0, 0.0, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		this.screenQuad.render(context, material, sampler, uniforms);
	}
}

globalThis.PostProcessRenderStage = PostProcessRenderStage;
export default PostProcessRenderStage;
