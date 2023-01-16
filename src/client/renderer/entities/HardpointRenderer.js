import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Animation } from '@babylonjs/core/Animations/animation.js';

import { random, wait } from 'core/utils.js';
import { config } from 'core/meta.js';
import ModelRenderer from '../ModelRenderer.js';

export default class HardpointRenderer extends ModelRenderer {
	projectiles = [];
	constructor({ id, position, rotation, ship: parent, scene, type, }) {
		super({ id, position, rotation, scene, parent });

		this.type = type;
		this.rotation.addInPlaceFromFloats(0, Math.PI, 0);
	}

	fireProjectile(target, options) {
		this._generic.fire.call(this, target, options);
	}

	static generic = new Map(Object.entries({
		async laser(target, { projectileMaterials = [] }) {
			await wait(random.int(4, 40));
			const laser = await this.createProjectileInstante(),
				bounding = this.getHierarchyBoundingVectors(),
				targetOffset = random.float(0, bounding.max.subtract(bounding.min).length()),
				startPos = this.getAbsolutePosition(),
				endPos = target.getAbsolutePosition().add(random.cords(targetOffset)),
				frameFactor = Vector3.Distance(startPos, endPos) / this._generic.projectileSpeed,
				material = projectileMaterials.find(({ applies_to = [], material }) => {
					if (applies_to.includes(this.type) && material) {
						return material;
					}
				}, this);
			this.projectiles.push(laser);
			laser.material = material.material;
			for (let child of laser.getChildMeshes()) {
				child.material = material.material;
			}
			laser.scaling = this.scaling;
			laser.position = startPos;
			this.lookAt(endPos);
			laser.lookAt(endPos);
			const animation = new Animation('projectileAnimation', 'position', 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
			animation.setKeys([
				{ frame: 0, value: startPos },
				{ frame: 60 * frameFactor, value: endPos },
			]);
			laser.animations.push(animation);
			let result = this.level.beginAnimation(laser, 0, 60 * frameFactor);
			result.disposeOnEnd = true;
			result.onAnimationEnd = () => {
				this.projectiles.splice(this.projectiles.indexOf(laser), 1);
				laser.dispose();
				target.entity.hp -= (this._generic.damage / config.tickRate) * (Math.random() < this._generic.critChance ? this._generic.critFactor : 1);
			};
		},
	}));
}
