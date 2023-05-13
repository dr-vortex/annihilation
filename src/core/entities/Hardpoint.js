import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { wait, xpToLevel } from '../utils.js';
import Node from '../Node.js';
import { LevelEvent } from '../events.js';

export default class Hardpoint extends Node {
	info = {};
	constructor(id, level, { type, reload }) {
		level;
		super(id, level);

		this.type = type;
		this.reload = reload ?? this.generic.reload;

		this.rotation.addInPlaceFromFloats(0, Math.PI, 0);
	}

	get generic() {
		return Hardpoint.generic.get(this.type);
	}

	remove() {
		super.remove();
		if (this.owner) {
			this.owner.hardpoints.splice(this.owner.hardpoints.indexOf(this), 1);
		}
	}

	serialize() {
		return Object.assign(super.serialize(), {
			type: this.type,
			info: {
				scale: this.info?.scale || 1,
				position: this.info?.position?.asArray() || [0, 0, 0],
				rotation: this.info?.rotation?.asArray() || [0, 0, 0],
			},
			reload: this.reload,
		});
	}

	/**
	 * @todo implement projectile logic on the core
	 */
	async fire(target) {

		// this is so we don't have a circular dependency by importing Ship
		const targetConstructors = [];
		let targetConstructor = target;
		while(targetConstructor) {
			targetConstructor = Object.getPrototypeOf(targetConstructor);
			targetConstructors.push(targetConstructor.name);
		}

		let evt = new LevelEvent('projectile.fire', this.serialize(), { target: target.serialize(), projectile: this.generic.projectile });
		this.level.dispatchEvent(evt);
		const time = Vector3.Distance(this.absolutePosition, target.absolutePosition) / this.generic.projectile.speed;
		this.reload = this.generic.reload;
		await wait(time);
		const targetShip = targetConstructors.includes('Ship') ? target : target.owner;
		targetShip.hp -= this.generic.damage * (Math.random() < this.generic.critChance ? this.generic.critFactor : 1);
		if (targetShip.hp <= 0) {
			const evt = new LevelEvent('entity.death', targetShip.serialize());
			this.level.dispatchEvent(evt);
			const owner = this.owner.owner;
			switch (owner.constructor.name) {
				case 'Player':
					owner.addItems(targetShip.generic.recipe);
					if (Math.floor(xpToLevel(owner.xp + targetShip.generic.xp)) > Math.floor(xpToLevel(owner.xp))) {
						const evt = new LevelEvent('player.levelup', owner.serialize());
						this.level.dispatchEvent(evt);
						owner.xpPoints++;
					}
					owner.xp += targetShip.generic.xp;
					break;
				case 'CelestialBody':
					owner.rewards.addItems(targetShip.generic.recipe);
					break;
				default:
			}
			targetShip.remove();
		}
	}

	static FromData(data, level) {
		return super.FromData(data, level, data);
	}

	static generic = new Map(
		Object.entries({
			laser: {
				damage: 1,
				reload: 10,
				range: 200,
				critChance: 0.05,
				critFactor: 1.5,
				projectile: {
					id: 'laser_projectile',
					count: 1,
					interval: 0,
					speed: 5,
				},
			},
		})
	);
}
