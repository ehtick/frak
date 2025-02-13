import RenderingContext from "rendering/RenderingContext";
import Camera from "../Camera";
import RenderStage from "./RenderStage";
import TargetTextureMulti from "../TargetTextureMulti";
import BuffersRenderStage from "./BuffersRenderStage";
import PBRLightsRenderStage from "./PBRLightsRenderStage";
import PBRPipeline from "./PBRPipeline";
import TonemapRenderStage from "./TonemapRenderStage";
import Sampler from "rendering/shaders/Sampler";
import EmissiveRenderStage from "./EmissiveRenderStage";
import BackgroundRenderStage from "./BackgroundRenderStage";
import TransparentRenderStage from "./TransparentRenderStage";
import Scene from "scene/Scene";
import Renderer from "rendering/renderers/Renderer";
import TargetTextureFloat from "../TargetTextureFloat";
import Engine from "engine/Engine";
import TargetTexture from "../TargetTexture";
import ShadowMapsRenderStage from "./ShadowMapsRenderStage";
import UnlitRenderStage from "./UnlitRenderStage";
import CustomRenderStage from "./CustomRenderStage";
import PostProcessRenderStage from './PostProcessRenderStage';

class BindDstTarget extends RenderStage {
	render(context: RenderingContext, _: any, camera: Camera) {
		camera.renderStage.dst.bind(context);
	}
}

class UnbindDstTarget extends RenderStage {
	render(context: RenderingContext, _: any, camera: Camera) {
		camera.renderStage.dst.unbind(context);
		camera.renderStage.swapBuffers();
	}
}

class MainRenderStage extends RenderStage {
	gbuffer: TargetTextureMulti;
	declare parent: PostProcessRenderStage;
	oitAccum: TargetTextureFloat;
	oitReveal: TargetTexture;
	size = vec2.create();
	sharedSamplers: Sampler[] = [];
	oitSamplers: Sampler[] = [];
	filteredRenderers: Renderer[] = [];
	emissiveStage: EmissiveRenderStage;
	backgroundRenderStage: BackgroundRenderStage;

	constructor() {
		super();

		this.addStage(new ShadowMapsRenderStage());
		this.addStage(new BuffersRenderStage());

		this.addStage(new BindDstTarget());
		this.addStage(new PBRLightsRenderStage());
		this.addStage(new UnbindDstTarget());

		this.addStage(new BindDstTarget());
		this.backgroundRenderStage = this.addStage(new BackgroundRenderStage());
		this.addStage(new TonemapRenderStage());
		this.emissiveStage = this.addStage(new EmissiveRenderStage()).disable();
		this.addStage(new UnlitRenderStage());
		this.addStage(new CustomRenderStage());
		this.addStage(new TransparentRenderStage());
		this.addStage(new UnbindDstTarget());
	}

	onStart(context: RenderingContext, engine: Engine, camera: Camera) {
		const gl = context.gl;

		vec2.copy(this.size, this.parent.size);
		let numTargets = 3;
		if (engine.options.emissiveEnabled) {
			numTargets++;
		}
		if (engine.options.legacyAmbient) {
			numTargets++;
		}

		this.gbuffer = new TargetTextureMulti(context, this.size, {numTargets, stencil: true});

		this.sharedSamplers.push(new Sampler('colorMetallic', this.gbuffer.targets[0]));
		this.sharedSamplers.push(new Sampler('normalRoughness', this.gbuffer.targets[1]));
		this.sharedSamplers.push(new Sampler('positionOcclusion', this.gbuffer.targets[2]));

		if (engine.options.emissiveEnabled) {
			this.sharedSamplers.push(new Sampler('emissive', this.gbuffer.targets[3]));
			this.emissiveStage.enable();
		}

		if (engine.options.legacyAmbient) {
			this.sharedSamplers.push(new Sampler('ambientBuffer', this.gbuffer.targets[numTargets - 1]));
		}

		// OIT
		this.oitAccum = new TargetTextureFloat(this.size, context, false);
		this.oitAccum.bind(context);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.gbuffer.depth);
		this.oitReveal = new TargetTexture(this.size, context, false);
		this.oitReveal.bind(context);
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, this.gbuffer.depth);
		this.oitReveal.unbind(context);

		this.oitSamplers.push(new Sampler('oitAccum', this.oitAccum.texture));
		this.oitSamplers.push(new Sampler('oitReveal', this.oitReveal.texture));
	}

	onPreRender(context: any, scene: Scene, camera: any) {
		scene.dynamicSpace.frustumCast(camera.frustum, camera.layerMask, this.filteredRenderers);
		if (this.size[0] !== this.parent.size[0] || this.size[1] !== this.parent.size[1]) {
			vec2.copy(this.size, this.parent.size);

			this.gbuffer.setSize(this.size[0], this.size[1]);
			this.gbuffer.resetViewport();

			this.oitAccum.setSize(this.size[0], this.size[1]);
			this.oitAccum.resetViewport();

			this.oitReveal.setSize(this.size[0], this.size[1]);
			this.oitReveal.resetViewport();
		}
	}

	setImmersive(immersive: boolean) {
		this.backgroundRenderStage.isImmersive = immersive;
	}
}

globalThis.MainRenderStage = MainRenderStage;
export default MainRenderStage;
