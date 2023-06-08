import { Vector2, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';

import config from '../config';
import { random } from '../../core/utils';
import type { SerializedPlanet } from '../../core';
import type { HardpointProjectileHandlerOptions } from '../entities/Hardpoint';
import { CelestialBodyRenderer } from './CelestialBody';
import type { biomes as biomeIDs } from '../../core/generic/planets';

export interface GenericPlanetRendererMaterial {
	clouds: boolean;
	upperColor: Color3;
	lowerColor: Color3;
	haloColor: Color3;
	seed: number;
	cloudSeed: number;
	lowerClamp: Vector2;
	groundAlbedo: number;
	cloudAlbedo: number;
	directNoise: boolean;
	lowerClip: Vector2;
	range: Vector2;
	maxResolution?: number;
}

export class PlanetRendererMaterial extends ShaderMaterial {
	generationOptions: GenericPlanetRendererMaterial;
	rotationFactor = Math.random();
	matrixAngle = 0;
	noiseTexture: ProceduralTexture;
	cloudTexture: ProceduralTexture;
	constructor(options: GenericPlanetRendererMaterial, scene: Scene) {
		const id = random.hex(8);
		super('PlanetMaterial.' + id, scene, './shaders/planet', {
			attributes: ['position', 'normal', 'uv'],
			uniforms: ['world', 'worldView', 'worldViewProjection', 'view', 'projection'],
			needAlphaBlending: true,
		});
		scene.onActiveCameraChanged.add(() => {
			this.setVector3('cameraPosition', scene.activeCamera.position);
		});
		this.generationOptions = options;

		this.setVector3('cameraPosition', scene.activeCamera?.position || Vector3.Zero());
		this.setVector3('lightPosition', Vector3.Zero());

		this.noiseTexture = this.generateTexture(
			id,
			'./shaders/noise',
			{ ...options, options: new Vector3(options.directNoise ? 1.0 : 0, options.lowerClip.x, options.lowerClip.y) },
			scene
		);
		this.setTexture('textureSampler', this.noiseTexture);

		this.cloudTexture = this.generateTexture(id, './shaders/cloud', { ...options, options: new Vector3(1.0, 0, 0) }, scene);
		this.setTexture('cloudSampler', this.cloudTexture);

		this.setColor3('haloColor', options.haloColor);
	}

	generateTexture(id: string, path: string, options, scene: Scene) {
		const sampler = new DynamicTexture('CelestialBodyMaterial.sampler.' + id, 512, scene, false, Texture.NEAREST_SAMPLINGMODE);
		this.updateRandom(sampler);
		const texture = new ProceduralTexture('CelestialBodyMaterial.texture.' + id, config.planet_material_map_size, path, scene, null, true, true);
		texture.setColor3('upperColor', options.upperColor);
		texture.setColor3('lowerColor', options.lowerColor);
		texture.setFloat('mapSize', config.planet_material_map_size);
		texture.setFloat('maxResolution', options.maxResolution || config.planet_material_max_resolution);
		texture.setFloat('seed', options.seed);
		texture.setVector2('lowerClamp', options.lowerClamp);
		texture.setTexture('randomSampler', sampler);
		texture.setVector2('range', options.range);
		texture.setVector3('options', options.options);
		texture.refreshRate = 0;
		return texture;
	}

	updateRandom(texture: DynamicTexture) {
		if (!(texture instanceof DynamicTexture)) throw new TypeError(`Can't update texture: not a dynamic texture`);
		const context = texture.getContext(),
			imageData = context.getImageData(0, 0, 512, 512);
		for (let i = 0; i < 1048576; i++) {
			imageData.data[i] = (Math.random() * 256) | 0;
		}
		context.putImageData(imageData, 0, 0);
		texture.update();
	}
}

const biomes: Record<typeof biomeIDs[number], GenericPlanetRendererMaterial> = {
	earthlike: {
		clouds: false, //true,
		upperColor: new Color3(0.2, 2.0, 0.2),
		lowerColor: new Color3(0, 0.2, 1.0),
		haloColor: new Color3(0, 0.2, 1.0),
		seed: 0.3,
		cloudSeed: 0.6,
		lowerClamp: new Vector2(0.6, 1),
		groundAlbedo: 1.25,
		cloudAlbedo: 0,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.3, 0.35),
	},
	volcanic: {
		upperColor: new Color3(0.9, 0.45, 0.45),
		lowerColor: new Color3(1.0, 0, 0),
		haloColor: new Color3(1.0, 0, 0.3),
		seed: 0.3,
		cloudSeed: 0.6,
		clouds: false,
		lowerClamp: new Vector2(0, 1),
		maxResolution: 256,
		cloudAlbedo: 0,
		groundAlbedo: 1.0,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.3, 0.4),
	},
	jungle: {
		upperColor: new Color3(0.1, 0.3, 0.7),
		lowerColor: new Color3(0, 1.0, 0.1),
		haloColor: new Color3(0.5, 1.0, 0.5),
		seed: 0.4,
		cloudSeed: 0.7,
		clouds: false, //true,
		lowerClamp: new Vector2(0, 1),
		maxResolution: 512,
		cloudAlbedo: 1.0,
		groundAlbedo: 1.1,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.2, 0.4),
	},
	ice: {
		upperColor: new Color3(1.0, 1.0, 1.0),
		lowerColor: new Color3(0.7, 0.7, 0.9),
		haloColor: new Color3(1.0, 1.0, 1.0),
		seed: 0.8,
		cloudSeed: 0.4,
		clouds: false, //true,
		lowerClamp: new Vector2(0, 1),
		maxResolution: 256,
		cloudAlbedo: 1.0,
		groundAlbedo: 1.1,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.3, 0.4),
	},
	desert: {
		upperColor: new Color3(0.9, 0.3, 0),
		lowerColor: new Color3(1.0, 0.5, 0.1),
		haloColor: new Color3(1.0, 0.5, 0.1),
		seed: 0.18,
		cloudSeed: 0.6,
		clouds: false,
		lowerClamp: new Vector2(0.3, 1),
		maxResolution: 512,
		cloudAlbedo: 1.0,
		groundAlbedo: 1.0,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.3, 0.4),
	},
	islands: {
		upperColor: new Color3(0.4, 2.0, 0.4),
		lowerColor: new Color3(0, 0.2, 2.0),
		haloColor: new Color3(0, 0.2, 2.0),
		seed: 0.15,
		cloudSeed: 0.6,
		clouds: false, //true,
		lowerClamp: new Vector2(0.6, 1),
		maxResolution: 512,
		cloudAlbedo: 1.0,
		groundAlbedo: 1.2,
		directNoise: false,
		lowerClip: new Vector2(0, 0),
		range: new Vector2(0.2, 0.3),
	},
	moon: {
		upperColor: new Color3(2.0, 1.0, 0),
		lowerColor: new Color3(0, 0.2, 1.0),
		cloudSeed: 0.6,
		lowerClamp: new Vector2(0.6, 1),
		cloudAlbedo: 0.9,
		range: new Vector2(0.3, 0.35),
		haloColor: new Color3(0, 0, 0),
		seed: 0.5,
		clouds: false,
		groundAlbedo: 0.7,
		directNoise: true,
		lowerClip: new Vector2(0.5, 0.9),
	},
};

export class PlanetRenderer extends CelestialBodyRenderer {
	biome = '';
	customHardpointProjectileMaterials: HardpointProjectileHandlerOptions['materials'];
	constructor(id: string, scene: Scene) {
		super(id, scene);
		this.customHardpointProjectileMaterials = [
			{
				applies_to: ['laser'],
				material: Object.assign(new StandardMaterial('player-laser-projectile-material'), { emissiveColor: Color3.Red() }),
			},
		];
	}

	async update(data: SerializedPlanet) {
		await super.update(data);
		if (this.biome != data.biome) {
			if (Object.keys(PlanetRenderer.biomes).includes(data.biome)) {
				this.biome = data.biome;
				this.material = new PlanetRendererMaterial(PlanetRenderer.biomes[data.biome], this.getScene());
			} else {
				throw new ReferenceError(`Biome "${data.biome}" does not exist`);
			}
		}
	}

	static async FromData(data: SerializedPlanet, scene: Scene) {
		const planet = new this(data.id, scene);
		await planet.update(data);
		return planet;
	}

	static biomes = biomes;
}
