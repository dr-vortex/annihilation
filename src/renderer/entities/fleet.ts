import type { FleetJSON } from '../../core/components/fleet.js';
import { EntityRenderer, renderers } from './entity.js';

export class FleetRenderer extends EntityRenderer {
	public update(data: FleetJSON): void {
		super.update(data);
		for (const id of data?.ships || []) {
			const ship = this.getScene().getNodeById(id);
			if (!ship) {
				continue;
			}
			ship.parent = this;
		}
	}
}
renderers.set('Fleet', FleetRenderer);
