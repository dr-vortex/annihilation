import { CelestialBody } from './CelestialBody';
import { SerializedStationComponent, StationComponent } from './StationComponent';
import type { SerializedCelestialBody } from './CelestialBody';
import type { Level } from '../Level';

export interface SerializedStation extends SerializedCelestialBody {
	type: string;
	components: SerializedStationComponent;
}

export class Station extends CelestialBody {
	components: StationComponent[] = [];
	#core: StationComponent;

	isTargetable = true;

	constructor(id: string, level: Level, options: ConstructorParameters<typeof CelestialBody>[2]) {
		super(id, level, options);

		this.#core = new StationComponent(null, level, { type: 'core', station: this });
		this.#core.parent = this;
	}

	get core() {
		return this.#core;
	}

	serialize() {
		return Object.assign(super.serialize(), {
			id: this.id,
			components: this.#core.serialize(),
		});
	}

	/**
	 * @todo actually implement
	 */
	static FromData(data: SerializedStation, level: Level): Station {
		return super.FromData(data, level, {}) as Station;
	}
}
