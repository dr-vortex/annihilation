import { ItemID, items } from './generic/items';
import type { ItemCollection, SerializedItemCollection } from './generic/items';

export class Storage extends Map {
	#max = 1;
	constructor(max = 1, initalItems?: ItemCollection) {
		super();
		for (const id of Object.keys(items)) {
			this.set(id, typeof initalItems?.[id] == 'number' ? initalItems[id] : 0);
		}
		this.#max = max;
	}

	get max(): number {
		return this.#max;
	}

	get total(): number {
		return [...this.entries()].reduce((total, [name, amount]) => total + amount * items[name].weight, 0);
	}

	empty(filter: ItemID | ItemID[]) {
		for (const name of this.keys()) {
			if ((filter instanceof Array ? filter.includes(name) : filter == name) || !filter) this.set(name, 0);
		}
	}

	toJSON(): SerializedItemCollection {
		return { items: Object.fromEntries([...this]), max: this.#max };
	}

	add(item: ItemID, amount: number) {
		this.set(item, this.get(item) + amount);
	}

	addItems(items: Partial<ItemCollection>) {
		for (const [id, amount] of Object.entries(items)) {
			this.add(id as ItemID, amount);
		}
	}

	remove(item: ItemID, amount: number) {
		this.set(item, this.get(item) - amount);
	}

	static FromJSON(data) {
		return new this(data.max, data.items);
	}
}
