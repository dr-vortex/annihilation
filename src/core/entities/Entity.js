import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import Path from '../Path.js';
import Node from '../Node.js';
import { random } from '../utils.js';

export default class Entity extends Node {
	_generic = { speed: 1 };

	selected = false;
	isTargetable = false;

	constructor({ id = random.hex(32), name, position = Vector3.Zero(), rotation = Vector3.Zero(), parent, owner, level }) {
		super({ id, name, position, rotation, owner, parent, level });

		level.entities.set(this.id, this);
	}

	remove() {
		this.level.entities.delete(this.id);
	}

	toString() {
		return `Entity #${this.id}`;
	}

	async moveTo(location, isRelative) {
		if (!(location instanceof Vector3)) throw new TypeError('location must be a Vector3');
		this.currentPath = new Path(this.position, location.add(isRelative ? this.position : Vector3.Zero()), this.level);
	}

	serialize() {
		return Object.assign(super.serialize(), {
			isTargetable: this.isTargetable,
			selected: this.selected,
		});
	}

	static FromData(data, level) {
		return new this({
			id: data.id,
			name: data.name,
			owner: level.get(data.owner),
			position: Vector3.FromArray(data.position),
			rotation: Vector3.FromArray(data.rotation),
			level,
		});
	}
}
