import CameraComponent from './CameraComponent';
import type RenderingContext from '../../rendering/RenderingContext';
import type Scene from '../Scene';
import OrbitController from './OrbitController';
import type { RenderCallback } from '../../rendering/camera/Camera';
import type Engine from '../../engine/Engine';

/**
 *
 */
class XRCamera extends CameraComponent {
	private readonly position = vec3.create();
	private readonly rotation = quat.create();
	private readonly up = vec3.fromValues(0, 1, 0);
	yOffset = 0.0;

	/**
	 *
	 */
	onAddScene(node) {
		if (node.scene.xrCamera === this) {
			return;
		}

		super.onAddScene(node);
	}

	/**
	 *
	 */
	onRemoveScene(node) {
		if (node.scene.xrCamera === this) {
			return;
		}

		super.onRemoveScene(node);
	}

	/**
	 *
	 */
	onStart(context: RenderingContext, engine: Engine) {
		const canvas = context.canvas;

		this.camera.target.setSize(canvas.width, canvas.height);

		super.onStart(context, engine);
	}

	/**
	 *
	 */
	override onUpdateTransform(absolute) {}

	/**
	 *
	 */
	render(
		context: RenderingContext,
		scene: Scene,
		preRenderCallback: RenderCallback,
		postRenderCallback: RenderCallback,
	) {
		if (!this.enabled) {
			return;
		}

		let space = scene.engine.immersiveRefSpace;
		const controller = this.node.getComponent(OrbitController);
		if (controller) {
			const p = controller.targetPosition;
			const yRotation = controller.rotation[1];

			quat.setAxisAngle(this.rotation, this.up, -yRotation);
			vec3.transformQuat(this.position, p, this.rotation);
			space = space.getOffsetReferenceSpace(new XRRigidTransform({
				x: -this.position[0],
				y: -this.position[1] - this.yOffset,
				z: -this.position[2],
				w: 1,
			}, {
				x: this.rotation[0],
				y: this.rotation[1],
				z: this.rotation[2],
				w: this.rotation[3],
			}));
		}

		const pose = scene.xrFrame.getViewerPose(space);
		if (pose) { // Pose might be null if tracking hasn't been found yet
			for (const view of pose.views) {
				if (this.updateFromXR(context, scene.xrFrame, view)) {
					super.render(context, scene, preRenderCallback, postRenderCallback);
				}
			}
		}
	}

	/**
	 *
	 */
	updateFromXR(context: RenderingContext, frame: XRFrame, view: XRView): boolean {
		if (!context.engine.immersiveSession) {
			return false;
		}

		const layer = frame.session.renderState.baseLayer;
		const viewport = layer.getViewport(view);
		if (viewport.width === 0 || viewport.height === 0) {
			return false; // Needed when rendering only one eye of a stereo view to not spam console with errors
		}

		this.camera.blockValues.projection = view.projectionMatrix;
		this.camera.blockValues.view = view.transform.inverse.matrix;
		this.camera.target.frameBuffer = layer.framebuffer;
		this.camera.target.set(viewport.x, viewport.y, viewport.width, viewport.height);
		this.camera.target.resetViewport();

		mat4.invert(this.camera.blockValues.projectionInverse, this.camera.blockValues.projection);
		mat4.invert(this.camera.blockValues.viewInverse, this.camera.blockValues.view);

		this.camera.blockValues.zNear[0] = this.camera.near;
		this.camera.blockValues.zFar[0] = this.camera.far;
		this.camera.getPosition(this.camera.blockValues.cameraPosition);

		this.camera.block.update(context);

		return true;
	}
}

globalThis.XRCamera = XRCamera;
export default XRCamera;
