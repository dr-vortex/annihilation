import type { IVector3Like } from '@babylonjs/core/Maths/math.like';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Vector2 } from '@babylonjs/core/Maths/math.vector';
import { PerformanceMonitor } from '@babylonjs/core/Misc/performanceMonitor';
import { EventEmitter } from 'eventemitter3';
import { assignWithDefaults, pick, randomHex } from 'utilium';
import type { Component } from './components/component';
import type { CelestialBodyJSON } from './entities/body';
import type { Entity, EntityJSON } from './entities/entity';
import { Planet, type PlanetData } from './entities/planet';
import { Player, type PlayerJSON } from './entities/player';
import { Ship, type ShipJSON } from './entities/ship';
import { Star, type StarJSON } from './entities/star';
import type { FleetJSON } from './components/fleet';
import type { GenericProjectile } from './generic/hardpoints';
import type { Item, ItemID } from './generic/items';
import { isResearchLocked, priceOfResearch, type Research, type ResearchID } from './generic/research';
import type { GenericShip, ShipType } from './generic/ships';
import type { SystemGenerationOptions } from './generic/system';
import type { VersionID } from './metadata';
import { config, version, versions } from './metadata';
import type { Berth } from './stations/berth';
import type { SystemJSON } from './system';
import { System } from './system';

export interface MoveInfo<T> {
	id: string;
	target: T;
}

export interface ActionData {
	create_item: Item;
	create_ship: {
		ship: GenericShip;
		berth?: Berth;
	};
	do_research: Research;
	warp: MoveInfo<System>[];
	move: MoveInfo<Vector3>[];
}

export type ActionArgs = {
	[A in keyof ActionData]: [action: A, data: ActionData[A]];
}[keyof ActionData];

export interface LevelJSON {
	date: string;
	systems: SystemJSON[];
	difficulty: number;
	version: VersionID;
	name: string;
	id: string;
	entities: EntityJSON[];
}

const copy = ['difficulty', 'version', 'name', 'id'] as const satisfies ReadonlyArray<keyof Level>;

export interface LevelEvents {
	body_created: [CelestialBodyJSON];
	body_removed: [CelestialBodyJSON];
	entity_added: [EntityJSON];
	entity_removed: [EntityJSON];
	entity_death: [EntityJSON];
	entity_path_start: [string, IVector3Like[]];
	entity_created: [EntityJSON];
	fleet_items_change: [FleetJSON, Record<ItemID, number>];
	player_created: [PlayerJSON];
	player_levelup: [PlayerJSON];
	player_removed: [PlayerJSON];
	player_reset: [PlayerJSON];
	projectile_fire: [string, string, GenericProjectile];
	ship_created: [ShipJSON];
	update: [];
}

export class Level extends EventEmitter<LevelEvents> implements Component<LevelJSON> {
	public id: string = randomHex(16);
	public name: string = '';
	public version = version;
	public date = new Date();
	public difficulty = 1;
	public entities: Set<Entity> = new Set();
	public systems: Map<string, System> = new Map();
	public rootSystem: System;
	protected _performanceMonitor = new PerformanceMonitor(60);

	public async ready(): Promise<this> {
		return this;
	}

	public constructor() {
		super();
	}

	public getEntityByID<N extends Entity = Entity>(id: string): N {
		for (const entity of this.entities) {
			if (entity.id == id) return <N>entity;
		}

		return null;
	}

	protected _selectEntities(selector: string): Entity[] {
		if (typeof selector != 'string') throw new TypeError('selector must be of type string');
		switch (selector[0]) {
			case '*':
				return [...this.entities];
			case '@':
				return [...this.entities].filter(entity => entity.name == selector.substring(1));
			case '#':
				return [...this.entities].filter(entity => entity.id == selector.substring(1));
			case '.':
				return [...this.entities].filter(entity => {
					for (const type of entity.entityTypes) {
						if (type.toLowerCase().includes(selector.substring(1).toLowerCase())) {
							return true;
						}
					}
					return false;
				});
			default:
				throw 'Invalid selector';
		}
	}

	public selectEntities(...selectors: string[]): Entity[] {
		return selectors.flatMap(selector => this._selectEntities(selector));
	}

	public selectEntity<T extends Entity = Entity>(selector: string): T {
		return <T>this._selectEntities(selector)[0];
	}

	public async tryAction(
		id: string,
		...args: ActionArgs //see https://stackoverflow.com/a/76335220/21961918
	): Promise<boolean> {
		const [action, data] = args;
		const player = this.getEntityByID(id);

		if (!(player instanceof Player)) {
			return false;
		}

		switch (action) {
			case 'create_item':
				if (!data.recipe || !player.storage.hasItems(data.recipe)) {
					return false;
				}

				player.storage.removeItems(data.recipe);
				player.storage.addItems({ [data.id]: player.storage.items[data.id] + 1 });
				break;
			case 'create_ship':
				if (!player.storage.hasItems(data.ship.recipe)) {
					return false;
				}

				player.storage.removeItems(data.ship.recipe);
				const ship = new Ship(null, player.level, <ShipType>data.ship.id);
				ship.parent = ship.owner = player;
				player.fleet.add(ship);
				break;
			case 'do_research':
				if (player.research[id] >= data.max || isResearchLocked(<ResearchID>data.id, player)) {
					return false;
				}
				const neededItems = priceOfResearch(<ResearchID>data.id, player.research[data.id]);
				if (!player.storage.hasItems(neededItems)) {
					return false;
				}

				player.storage.removeItems(neededItems);
				player.research[data.id]++;
				break;
			case 'warp':
				for (const { id, target } of data) {
					this.getEntityByID<Ship>(id).jumpTo(target);
				}
				break;
			case 'move':
				for (const { id, target } of data) {
					this.getEntityByID<Entity>(id).moveTo(target);
				}
				break;
			default: //action does not exist
				return false;
		}
		return true;
	}

	public async generateSystem(name: string, position: Vector2, options: SystemGenerationOptions = config.system_generation, system?: System) {
		const difficulty = Math.max(Math.log10(Vector2.Distance(Vector2.Zero(), position)) - 1, 0.25);
		system = await System.Generate(name, { ...options, difficulty }, this, system);
		system.position = position;
		return system;
	}

	//events and ticking
	public get tps(): number {
		return this._performanceMonitor.averageFPS;
	}

	public sampleTick() {
		this._performanceMonitor.sampleFrame();
	}

	public update() {
		this.sampleTick();
		this.emit('update');

		for (const entity of this.entities) {
			entity.update();
		}
	}

	public toJSON(): LevelJSON {
		return {
			...pick(this, copy),
			date: new Date().toJSON(),
			systems: [...this.systems.values()].map(system => system.toJSON()),
			entities: [...this.entities].map(entity => entity.toJSON()),
		};
	}

	public fromJSON(json: LevelJSON): void {
		assignWithDefaults(this, pick(json, copy));
		this.date = new Date(json.date);

		for (const systemData of json.systems) {
			System.FromJSON(systemData, this);
		}

		/**
		 * Note: nodes is sorted to make sure celestialbodies are loaded before ships before players
		 * This prevents `level.getNodeByID(shipData) as Ship` in the Player constructor from returning null
		 * Which in turn prevents `ship.owner = ship.parent = this` from throwing an error
		 */
		const entities = json.entities;
		entities.sort((node1, node2) => {
			const priority = ['Star', 'Planet', 'Ship', 'Player'];
			return priority.findIndex(t => t == node1.entityType) < priority.findIndex(t => t == node2.entityType) ? -1 : 1;
		});
		for (const data of entities) {
			switch (data.entityType) {
				case 'Player':
					Player.FromJSON(<PlayerJSON>data, this);
					break;
				case 'Ship':
					Ship.FromJSON(<ShipJSON>data, this);
					break;
				case 'Star':
					Star.FromJSON(<StarJSON>data, this);
					break;
				case 'Planet':
					Planet.FromJSON(<PlanetData>data, this);
					break;
				default:
			}
		}
	}

	public static FromJSON(json: LevelJSON): Level {
		if (json.version != version) {
			throw new Error(`Can't load level data: wrong version`);
		}

		const level = new Level();
		level.fromJSON(json);
		return level;
	}
}

export function upgradeLevel(data: LevelJSON): LevelJSON {
	switch (data.version) {
		default:
			throw `Upgrading from ${versions.get(data.version).text} is not supported`;
	}
}
