import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Scene } from '@babylonjs/core/scene.js';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder.js';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer.js';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer.js';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';

import config from './config.js';
import PlayerRenderer from './entities/PlayerRenderer.js';
import { default as PlanetRenderer, PlanetRendererMaterial } from './bodies/PlanetRenderer.js';
import StarRenderer from './bodies/StarRenderer.js';
import ModelRenderer from './ModelRenderer.js';
import ShipRenderer from './entities/ShipRenderer.js';

let skybox, xzPlane;
export let hl, gl, probe, engine, scene;

const cache = {},
	bodies = new Map(),
	entities = new Map();

const handleCanvasClick = (e, owner) => {
	owner ??= [...this.playerData][0];
	if (!e.shiftKey) {
		for (let entity of this.entities.values()) {
			entity.unselect();
		}
	}
	let pickInfo = this.pick(this.pointerX, this.pointerY, mesh => {
		let node = mesh;
		while (node.parent) {
			node = node.parent;
			if (node instanceof ShipRenderer) {
				return true;
			}
		}
		return false;
	});
	if (pickInfo.pickedMesh) {
		let node = pickInfo.pickedMesh;
		while (node.parent) {
			node = node.parent;
		}
		if (node instanceof ShipRenderer && node.owner == owner) {
			if (node.selected) {
				node.unselect();
			} else {
				node.select();
			}
		}
	}
};
const handleCanvasRightClick = (e, owner) => {
	for (let entity of this.entities.values()) {
		if (entity.selected && entity.owner == owner) {
			let newPosition = this.screenToWorldPlane(e.clientX, e.clientY, entity.position.y);
			entity.moveTo(newPosition, false);
		}
	}
};

export async function init(canvas, messageHandler = () => {}) {
	messageHandler('engine');
	engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

	messageHandler('scene');
	scene = new Scene(engine);

	scene.registerBeforeRender(() => {
		let ratio = scene.getAnimationRatio();
		for (let body of bodies.values()) {
			if (body instanceof PlanetRenderer && body.material instanceof PlanetRendererMaterial) {
				body.rotation.y += 0.0001 * ratio * body.material.rotationFactor;
				body.material.setMatrix('rotation', Matrix.RotationY(body.matrixAngle));
				body.matrixAngle -= 0.0004 * ratio;
				body.material.setVector3(
					'options',
					new Vector3(body.material.generationOptions.clouds, body.material.generationOptions.groundAlbedo, body.material.generationOptions.cloudAlbedo)
				);
			}
		}
	});

	messageHandler('skybox');
	skybox = MeshBuilder.CreateBox('skybox', { size: config.skybox_size }, scene);
	skybox.material = Object.assign(new StandardMaterial('skybox.mat', scene), {
		backFaceCulling: false,
		disableLighting: true,
		reflectionTexture: CubeTexture.CreateFromImages(Array(6).fill('images/skybox.jpg'), scene),
	});
	skybox.material.reflectionTexture.coordinatesMode = 5;
	skybox.infiniteDistance = true;
	skybox.isPickable = false;

	messageHandler('glow layer');
	gl = new GlowLayer('glowLayer', scene);
	gl.intensity = 0.9;

	messageHandler('highlight layer');
	hl = new HighlightLayer('highlight', scene);

	xzPlane = MeshBuilder.CreatePlane('xzPlane', { size: config.plane_size }, scene);
	xzPlane.rotation.x = Math.PI / 2;
	xzPlane.setEnabled(false);

	messageHandler('reflection probe');
	probe = new ReflectionProbe('probe', 256, scene);

	messageHandler('assets');
	const modelKeys = [...ModelRenderer.modelPaths.keys()];
	// using forEach so we can get the index
	modelKeys.forEach(async (id, i) => {
		messageHandler(`model "${id}" (${i + 1}/${modelKeys.length})`);
		await ModelRenderer.InitModel(id, scene);
	});
}

export async function dispose() {
	if (!scene) {
		throw new ReferenceError(`Renderer not initalized`);
	}
	scene.dispose();
}

export async function clear() {
	if (!scene) {
		throw new ReferenceError(`Renderer not initalized`);
	}

	for (let [id, body] of bodies) {
		body.dispose();
		bodies.delete(id);
	}

	for (let [id, entity] of entities) {
		entity.dispose();
		entities.delete(id);
	}
}

export async function load(levelData) {
	if (!scene) {
		throw new ReferenceError(`Renderer not initalized`);
	}

	for (let [id, data] of Object.entries(levelData.bodies)) {
		let body;
		switch (data.type) {
			case 'star':
				body = StarRenderer.FromData(data, scene);
				break;
			case 'planet':
				body = PlanetRenderer.FromData(data, scene);
				break;
			default:
				throw new ReferenceError(`rendering for CelestialBody type "${data.type}" is not supported`);
		}

		bodies.set(id, body);
	}

	for (let [id, data] of Object.entries(levelData.entities)) {
		let entity;
		switch (data.type) {
			case 'player':
				entity = PlayerRenderer.FromData(data, scene);
				break;
			case 'ship':
				entity = ShipRenderer.FromData(data, scene);
				break;
			default:
				throw new ReferenceError(`rendering for Entity type "${data.type}" is not supported`);
		}
		entities.set(id, entity);
	}
}

export async function update(levelData) {
	if (!scene) {
		throw new ReferenceError(`Renderer not initalized`);
	}
}

export async function serialize() {
	if (!scene) {
		throw new ReferenceError(`Renderer not initalized`);
	}
}
