import RenderStage from 'rendering/camera/stages/RenderStage';
import TargetTextureFloat from 'rendering/camera/TargetTextureFloat';
import Material from 'rendering/materials/Material';
import UniformVec2 from 'rendering/shaders/UniformVec2';
import UniformFloat from 'rendering/shaders/UniformFloat';
import Sampler from 'rendering/shaders/Sampler';
import TrianglesRenderBufferVAO from 'rendering/buffers/TrianglesRenderBufferVAO';
import MainRenderStage from "./stages/MainRenderStage";

class SSAOBufferRenderStage extends RenderStage {
	size: any;
	quad: any;
	target: any;
	material: any;

	constructor() {
		super();

		this.size = false;
		this.quad = false;

		this.target = false;
	}

	setSize(width, height): any {
		if (this.size === false)
			this.size = vec2.create();
		this.size[0]=width;
		this.size[1]=height;
	}

	onStart(context, engine): any {
		if (!this.size) {
			this.size = vec2.clone(engine.scene.camera.target.size);
		}

		this.target = new TargetTextureFloat([engine.scene.camera.target.size[0], engine.scene.camera.target.size[1]], context, false);

		this.material = new Material(
			// engine.assetsManager.addShaderSource("shaders/default/ssao"),
			engine.assetsManager.addShaderSource(engine.assetsManager.shadersManager.bundle('ssao')),
			{
				"ViewportSize": new UniformVec2(vec2.clone(engine.scene.camera.target.size)),
				"ssaoGDisplace": new UniformFloat((engine.options.ssaoGDisplace) ? engine.options.ssaoGDisplace : 6.0),
				"ssaoRadius": new UniformFloat((engine.options.ssaoRadius) ? engine.options.ssaoRadius : 8.0),
				"ssaoDivider": new UniformFloat((engine.options.ssaoDivider) ? engine.options.ssaoDivider : 0.5)
			},
			[ new Sampler( "position0", this.parent.positionBufferStage.target.texture )]);
		this.material.name = "SSAO";

		var vertices = [-1,-1,0, -1,1,0, 1,1,0, 1,-1,0];
		var uvs = [0,1, 0,0, 1,0, 1,1];
		var faces = [0, 1, 2, 0, 2, 3];
		this.quad=new TrianglesRenderBufferVAO(context, faces);
		this.quad.add('position', vertices, 3);
		this.quad.add('texcoord2d0', uvs, 2);

		engine.assetsManager.load();
	}

	onPreRender(context, scene, camera): any {
		var cameraTarget = camera.target;

		if (cameraTarget.size[0] != this.target.size[0] || cameraTarget.size[1] != this.target.size[1]) {
			vec2.set(this.material.uniforms.ViewportSize.value, camera.target.size[0], camera.target.size[1]);
			this.setSize(cameraTarget.size[0], cameraTarget.size[1]);
			this.target.setSize(cameraTarget.size[0], cameraTarget.size[1]);
		}
	}

	onPostRender(context, scene, camera) {
		if (!this.parent || !(this.parent instanceof MainRenderStage))
			return;

		if (!this.target || !this.material)
			return;

		this.target.bind(context);

		var gl = context.gl;
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.clearColor(0.0, 0.0, 0.0, 0.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		this.material.bind();

		if (this.material.shader.linked) {
		var locations=[];
		for (var bufferName in this.quad.buffers) {
			gl.bindBuffer(gl.ARRAY_BUFFER, this.quad.buffers[bufferName]);
			var bufferLocation=gl.getAttribLocation(this.material.shader.program, bufferName);
			if(bufferLocation==-1) continue;
			gl.enableVertexAttribArray(bufferLocation);
			locations.push(bufferLocation);
			gl.vertexAttribPointer(bufferLocation, this.quad.buffers[bufferName].itemSize, gl.FLOAT, false, 0, 0);
		}
		this.quad.drawElements();
		for (var i in locations)
			gl.disableVertexAttribArray(locations[i]);

		}

		/*for (var i in this.parent.solidRenderers) {
			if (this.parent.solidRenderers[i].layer &&
				this.parent.solidRenderers[i].visible) {

				context.modelview.push();
				context.modelview.multiply(this.parent.solidRenderers[i].matrix);

				this.parent.solidRenderers[i].renderGeometry(context, this.material.shader);

				context.modelview.pop();
			}
		}*/

		this.material.unbind();

		this.target.unbind(context);
	}
}

globalThis.SSAOBufferRenderStage = SSAOBufferRenderStage;
export default SSAOBufferRenderStage;
