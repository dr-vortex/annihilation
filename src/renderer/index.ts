import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import '@babylonjs/core/Animations/animatable';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { ReflectionProbe } from '@babylonjs/core/Probes/reflectionProbe';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture';
import { Engine } from '@babylonjs/core/Engines/engine';

import Path from '../core/Path';

import config from './config';
import { PlayerRenderer } from './entities/Player';
import { PlanetRenderer, PlanetRendererMaterial } from './bodies/Planet';
import { StarRenderer } from './bodies/Star';
import { ModelRenderer } from './Model';
import { ShipRenderer } from './entities/Ship';
import { EntityRenderer } from './entities/Entity';
import { Camera } from './Camera';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { FireProjectileOptions, HardpointRenderer } from './entities/Hardpoint';
import type { SerializedLevel } from '../core/Level';
import type { CelestialBodyRenderer } from './bodies/CelestialBody';
import type { SerializedStar } from '../core/bodies/Star';
import type { SerializedPlanet } from '../core/bodies/Planet';
import type { SerializedPlayer } from '../core/entities/Player';
import type { SerializedShip } from '../core/entities/Ship';
import type { SerializedEntity } from '../core/entities/Entity';
import type { SerializedCelestialBody } from '../core/bodies/CelestialBody';

function createEmptyCache(): SerializedLevel {
	return {
		id: null,
		date: null,
		difficulty: null,
		version: null,
		name: null,
		bodies: [],
		entities: [],
	};
}

let skybox: Mesh,
	xzPlane: Mesh,
	camera: Camera,
	cache: SerializedLevel = createEmptyCache(),
	hitboxes = false,
	gl: GlowLayer;
export let engine: Engine, scene: Scene, hl: HighlightLayer, probe: ReflectionProbe;

export function setHitboxes(value: boolean) {
	hitboxes = !!value;
}

const bodies: Map<string, CelestialBodyRenderer> = new Map(),
	entities: Map<string, EntityRenderer> = new Map();

export async function init(
	canvas: HTMLCanvasElement,
	messageHandler: (msg: string) => unknown = (msg: string) => {
		console.debug('init renderer: ' + msg);
	}
) {
	await messageHandler('engine');
	engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
	engine.resize();

	await messageHandler('scene');
	scene = new Scene(engine);

	await messageHandler('camera');
	camera = new Camera(scene);

	scene.registerBeforeRender(() => {
		const ratio = scene.getAnimationRatio();
		for (const body of bodies.values()) {
			if (body instanceof PlanetRenderer && body.material instanceof PlanetRendererMaterial) {
				body.rotation.y += 0.0001 * ratio * body.material.rotationFactor;
				body.material.setMatrix('rotation', Matrix.RotationY(body.material.matrixAngle));
				body.material.matrixAngle -= 0.0004 * ratio;
				const options = body.material.generationOptions;
				body.material.setVector3('options', new Vector3(+options.clouds, options.groundAlbedo, options.cloudAlbedo));
			}
		}
	});

	await messageHandler('skybox');
	skybox = MeshBuilder.CreateBox('skybox', { size: config.skybox_size }, scene);
	const skyboxMaterial = new StandardMaterial('skybox.mat', scene);
	skyboxMaterial.backFaceCulling = false;
	skyboxMaterial.disableLighting = true;
	skyboxMaterial.reflectionTexture = CubeTexture.CreateFromImages(Array(6).fill('images/skybox.jpg'), scene);
	skyboxMaterial.reflectionTexture.coordinatesMode = 5;
	skybox.material = skyboxMaterial;
	skybox.infiniteDistance = true;
	skybox.isPickable = false;

	await messageHandler('glow layer');
	gl = new GlowLayer('glowLayer', scene);
	gl.intensity = 0.9;

	await messageHandler('highlight layer');
	hl = new HighlightLayer('highlight', scene);

	xzPlane = MeshBuilder.CreatePlane('xzPlane', { size: config.plane_size }, scene);
	xzPlane.rotation.x = Math.PI / 2;
	xzPlane.setEnabled(false);

	await messageHandler('reflection probe');
	probe = new ReflectionProbe('probe', 256, scene);

	await messageHandler('assets');
	const modelKeys = [...ModelRenderer.modelPaths.keys()];
	// using forEach so we can get the index
	for (const id of modelKeys) {
		const i = modelKeys.indexOf(id);
		await messageHandler(`model "${id}" (${i + 1}/${modelKeys.length})`);
		await ModelRenderer.InitModel(id, scene);
	}
}

export async function dispose() {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}
	scene.dispose();
}

export async function render() {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}

	scene.meshes.forEach(mesh => {
		if (mesh instanceof PlanetRenderer || mesh instanceof StarRenderer) mesh.showBoundingBox = hitboxes;
		if (mesh.parent instanceof EntityRenderer) mesh.getChildMeshes().forEach(child => (child.showBoundingBox = hitboxes));
		//if (mesh != skybox && isHex(mesh.id)) mesh.showBoundingBox = hitboxes;
	});

	scene.render();
}

/**
 * Clears out loaded data and flushs the cache.
 */
export async function clear() {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}

	for (const [id, body] of bodies) {
		body.dispose();
		bodies.delete(id);
	}

	for (const [id, entity] of entities) {
		entity.dispose();
		entities.delete(id);
	}

	engine.resize();
	cache = createEmptyCache();
}

export async function load(levelData: { entities: SerializedEntity[]; bodies: SerializedCelestialBody[] }) {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}

	for (const data of levelData.bodies) {
		let body;
		switch (data.nodeType) {
			case 'star':
				body = await StarRenderer.FromData(data as SerializedStar, scene);
				break;
			case 'planet':
				body = await PlanetRenderer.FromData(data as SerializedPlanet, scene);
				break;
			default:
				throw new ReferenceError(`rendering for CelestialBody type "${data.nodeType}" is not supported`);
		}

		bodies.set(data.id, body);
	}

	for (const data of levelData.entities) {
		let entity;
		switch (data.nodeType) {
			case 'player':
			case 'client':
				entity = await PlayerRenderer.FromData(data as SerializedPlayer, scene);
				/**
				 * @todo change this
				 */
				camera.target = entity.position;
				break;
			case 'ship':
				entity = await ShipRenderer.FromData(data as SerializedShip, scene);
				break;
			default:
				throw new ReferenceError(`rendering for Entity type "${data.nodeType}" is not supported`);
		}
		entities.set(data.id, entity);
	}
}

export async function update(levelData: SerializedLevel) {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}

	const renderersToAdd = { bodies: [], entities: [] };

	if (levelData.id != cache.id && cache.id) {
		console.warn(`Updating the renderer with a different level (${cache.id} -> ${levelData.id}). The renderer should be cleared first.`);
	}

	for (const body of [...cache.bodies, ...levelData.bodies]) {
		const data = levelData.bodies.find(_body => _body.id == body.id),
			cached = cache.bodies.find(_body => _body.id == body.id);
		if (!cached) {
			renderersToAdd.bodies.push(body);
			continue;
		}

		if (!data) {
			bodies.get(body.id).dispose();
			bodies.delete(body.id);
			continue;
		}

		bodies.get(body.id).update(data);
	}

	for (const entity of [...cache.entities, ...levelData.entities]) {
		const data = levelData.entities.find(_entity => _entity.id == entity.id),
			cached = cache.entities.find(_entity => _entity.id == entity.id);
		if (!cached) {
			renderersToAdd.entities.push(entity);
			continue;
		}

		if (!data) {
			entities.get(entity.id).dispose();
			entities.delete(entity.id);
			continue;
		}

		entities.get(entity.id).update(data);
	}

	const result = await load(renderersToAdd);
	cache = levelData;
	return result;
}

export function getCamera() {
	if (!scene) {
		throw new ReferenceError('Renderer not initalized');
	}

	if (!camera) {
		throw new ReferenceError('Camera not initalized');
	}

	return camera;
}

export function handleCanvasClick(ev, owner) {
	owner ??= [...entities.values()].filter(e => e instanceof PlayerRenderer)[0];
	if (!ev.shiftKey) {
		for (const entity of entities.values()) {
			if (entity instanceof ShipRenderer) {
				entity.unselect();
			}
		}
	}
	const pickInfo = scene.pick(ev.clientX, ev.clientY, mesh => {
		let node: TransformNode = mesh;
		while (node.parent) {
			node = node.parent as TransformNode;
			if (node instanceof ShipRenderer) {
				return true;
			}
		}
		return false;
	});
	if (pickInfo.pickedMesh) {
		let node: TransformNode = pickInfo.pickedMesh;
		while (node.parent && !(node instanceof ShipRenderer)) {
			node = node.parent as TransformNode;
		}
		if (node instanceof ShipRenderer && node.parent == owner) {
			if (node.selected) {
				node.unselect();
			} else {
				node.select();
			}
		}
	}
}

/**
 * @todo simplify returned data?
 */
export function handleCanvasRightClick(evt, owner) {
	const returnData = [];
	for (const entityRenderer of entities.values()) {
		if (entityRenderer.selected && entityRenderer.parent == owner) {
			xzPlane.position = entityRenderer.absolutePosition.clone();
			const pickInfo = scene.pick(evt.clientX, evt.clientY, mesh => mesh == xzPlane);
			if (pickInfo.pickedPoint) {
				returnData.push({ entityRenderer, point: pickInfo.pickedPoint });
			}
		}
	}

	return returnData;
}

export async function startFollowingPath(entityID: string, path: number[][]) {
	const renderer = entities.get(entityID);
	await renderer.followPath(Path.FromData(path));
}

export function fireProjectile(hardpointID: string, target: TransformNode, options: FireProjectileOptions) {
	const hardpointRenderer = scene.getTransformNodeById(hardpointID) as HardpointRenderer,
		parent = hardpointRenderer?.parent?.parent as PlayerRenderer | PlanetRenderer,
		targetRenderer = scene.getTransformNodeById(target.id);
	hardpointRenderer.fireProjectile(targetRenderer, { ...options, materials: parent.customHardpointProjectileMaterials });
}
