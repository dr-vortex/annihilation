import { Vector3 } from '@babylonjs/core/Maths/math.vector';

import { Path } from '../Path';
import { Node } from './Node';
import type { SerializedNode } from './Node';
import type { System } from '../System';

export interface SerializedEntity extends SerializedNode {
	selected: boolean;
	isTargetable: boolean;
}

export class Entity extends Node {
	selected = false;
	isTargetable = false;

	constructor(id: string, system: System) {
		super(id, system);
		setTimeout(() => system.emit('entity.created', this.toJSON()));
	}

	remove() {
		this.system.emit('entity.removed', this.toJSON());
		super.remove();
	}

	toString() {
		return `Entity #${this.id}`;
	}

	async moveTo(location, isRelative) {
		if (!(location instanceof Vector3)) throw new TypeError('location must be a Vector3');
		const path = Path.Find(this.absolutePosition, location.add(isRelative ? this.absolutePosition : Vector3.Zero()), this.system);
		if (path.path.length > 0) {
			this.system.emit('entity.follow_path.start', this.toJSON(), { path: path.toJSON() });
			this.position = path.path.at(-1).position.subtract(this.parent.absolutePosition);
			const rotation = Vector3.PitchYawRollToMoveBetweenPoints(path.path.at(-2).position, path.path.at(-1).position);
			rotation.x -= Math.PI / 2;
			this.rotation = rotation;
		}
	}

	toJSON(): SerializedEntity {
		return Object.assign(super.toJSON(), {
			isTargetable: this.isTargetable,
			selected: this.selected,
		});
	}

	static FromJSON(data: SerializedEntity, system: System, constructorOptions: object) {
		return super.FromJSON(data, system, constructorOptions);
	}
}
