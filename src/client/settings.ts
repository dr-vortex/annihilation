import $ from 'jquery';
import * as fs from 'node:fs';
import { isJSON } from 'utilium';
import type { JSONObject } from 'utilium/fs.js';
import { JSONFileMap } from 'utilium/fs.js';
import { config } from '../core';
import { path } from './config';
import { logger } from './utils';

export class SettingsError<T extends keyof _Values = keyof _Values> extends Error {
	constructor(
		message: string,
		public target?: Item<T>
	) {
		super(message);
	}
}

export class SettingsEvent<T extends keyof _Values = keyof _Values> extends Event {
	constructor(
		type: string,
		public item: Item<T>
	) {
		super(type);
	}
}

export interface Keybind extends JSONObject<string> {
	alt: boolean;
	ctrl: boolean;
	key: string;
}

interface _Values {
	boolean: boolean;
	string: string;
	number: number;
	color: string;
	select: string | string[];
	keybind: Keybind;
}

export type Type = keyof _Values;
export type Value<T extends Type = Type> = _Values[T];

export type Kind<T extends Type = Type> = {
	boolean: undefined;
	string: undefined;
	number: 'number' | 'range';
	color: undefined;
	select: undefined;
	keybind: undefined;
}[T];

export type Label<T extends Type = Type> = string | ((value?: Value<T>) => string);

export const settingTypes: Type[] = ['boolean', 'string', 'number', 'color', 'select', 'keybind'];

export interface ItemOptions<T extends Type = Type> {
	id: string;
	section: Section | string;
	label: Label<T>;
	type: T;
	kind?: Kind<T>;
	options?: {
		name: string;
		label: string;
	}[];
	value?: Partial<Value<T>>;
	onTrigger?(evt: Event | JQuery.KeyDownEvent): unknown;
	min?: number;
	max?: number;
	step?: number;
}

export class Item<T extends Type = Type> extends HTMLDivElement {
	public readonly id: string;
	public readonly type: T;
	public readonly section: Section;

	public label: Label<T>;

	#ui_label = $('<label></label>').addClass('settings-label').css('text-align', 'right').appendTo(this);
	#ui_input: JQuery<HTMLInputElement>;

	//Used by select
	#options: JQuery<HTMLOptionElement>[] = [];
	#value: Keybind = {
		alt: false,
		ctrl: false,
		key: '',
	};

	//Used by keybind
	constructor(options: ItemOptions<T>) {
		super();
		this.id = options.id;
		this.type = options.type;
		this.label = options.label;

		if (options.section instanceof Section) {
			this.section = options.section;
		} else if (sections.has(options.section)) {
			this.section = sections.get(options.section)!;
		} else if (options.section) {
			throw new SettingsError(`Settings section "${options.section}" does not exist`);
		}

		switch (options.type) {
			case 'boolean':
				this.#ui_input = $('<input></input>');
				this.#ui_input.attr('type', 'checkbox');
				break;
			case 'string':
				this.#ui_input = $('<input></input>');
				this.#ui_input.attr('type', 'text');
				break;
			case 'number':
			case 'color':
				this.#ui_input = $('<input></input>');
				this.#ui_input.attr('type', options.kind!);
				options.type = <T>(options.type == 'color' ? 'color' : 'number');
				break;
			case 'select':
				this.#ui_input = $('<select></select>');
				this.#ui_input.text(options.value + '');
				for (const option of options.options || []) {
					this.addOption(option.name, option.label);
				}
				break;
			case 'keybind':
				this.#ui_input = $('<button></button>');
				this.#ui_input
					.on('click', e => {
						e.preventDefault();
						e.target.focus();
					})
					.on('keydown', e => {
						e.preventDefault();
						this.value = <Value<T>>{
							alt: e.altKey,
							ctrl: e.ctrlKey,
							key: e.key,
						};
					});
				break;
			default:
				throw new SettingsError(`Invalid type: ${options.type}`, this);
		}

		this.#ui_input.attr('name', this.id).addClass('setting-input');
		$('<div></div>').append(this.#ui_input).appendTo(this);
		$(this).addClass('settings-item');
		if (this.section) {
			$(this).appendTo(this.section);
		}

		this.update(options);
		this.#ui_input.on('change', e => {
			this.value = <Value<T>>(this.type == 'boolean' ? e.target.checked : e.target.value);
			set(this.id, this.value);
		});

		if (options.value === null || options.value === undefined) {
			return;
		}

		this.value = <Value<T>>options.value;
	}

	get value(): Value<Type> {
		if (this.type == 'keybind') {
			return this.#value;
		}
		switch (this.type) {
			case 'keybind':
				return this.#value;
			case 'boolean':
				return this.#ui_input.is(':checked');
			case 'number':
				return +this.#ui_input.val()!;
			default:
				return this.#ui_input.val()!;
		}
	}

	set value(val: Value<T>) {
		switch (this.type) {
			case 'keybind':
				this.#value = <Value<T> & Keybind>val;
				this.#ui_input.text((this.#value.ctrl ? 'Ctrl + ' : '') + (this.#value.alt ? 'Alt + ' : '') + this.#value.key);
				break;
			case 'boolean':
				this.#ui_input[0].checked = val as boolean;
				break;
			case 'number':
				this.#ui_input.val(+val);
				break;
			default:
				this.#ui_input.val(val as string);
		}

		let label = '';
		if (typeof this.label == 'function') {
			label = this.label(val);
		} else {
			label = this.label;
		}
		this.#ui_label.text(label);
		this.emit('update');
	}

	get ui() {
		return $(this);
	}

	get metadata() {
		const data = {
			id: this.id,
			type: this.type,
			value: this.value,
		};

		for (const attr of ['step', 'min', 'max']) {
			const val = this.#ui_input.attr(attr);
			if (val) {
				data[attr] = isFinite(+val) ? +val : val;
			}
		}

		return data;
	}

	//for selects
	hasOption(name: string) {
		return this.#options.findIndex(el => el.val() == name) != -1;
	}

	addOption(name: string, label: string) {
		const option = $<HTMLOptionElement>('<option></option>');
		option.val(name);
		option.text(label);
		this.#options.push(option);
		this.#ui_input.append(option);
	}

	removeOption(name: string): boolean {
		const option = this.#options.find(el => el.val() == name);
		if (!option) {
			return false;
		}
		const id = Math.random.toString().slice(2);
		option.attr('id', id);
		this.#ui_input.remove('#' + id);
		this.#options.splice(this.#options.indexOf(option), 1);
		return true;
	}

	emit(type: string): boolean {
		return this.dispatchEvent(new SettingsEvent(type, this));
	}

	update(options: { min?: number; max?: number; step?: number }) {
		if (isFinite(options?.min || NaN)) {
			this.#ui_input.attr('min', +options.min!);
		}

		if (isFinite(options?.max || NaN)) {
			this.#ui_input.attr('max', +options.max!);
		}

		if (isFinite(options?.step || NaN)) {
			this.#ui_input.attr('step', +options.step!);
		}
	}

	dispose() {
		this.#ui_input.detach();
		items.delete(this.id);
	}
}
customElements.define('settings-item', Item, { extends: 'div' });

export interface SettingsSectionOptions {
	id: string;
	label: Label;
	parent: JQuery;
}

export class Section extends HTMLFormElement {
	public readonly parent: JQuery;
	#label: Label;

	public readonly id: string;

	constructor({ id, label, parent }: SettingsSectionOptions) {
		super();
		this.id = id;
		this.parent = parent;
		$(this).addClass('settings-section center-flex').append('<h2 class="settings-name"></h2>');
		this.#label = label;

		if (parent) {
			$(parent).append(this);
		}

		sections.set(id, this);
	}

	get label(): string {
		return typeof this.#label == 'function' ? this.#label() : this.#label;
	}

	set label(value: Label) {
		this.#label = value;
		$(this).find('h2.settings-name').text(`Settings - ${this.label}`);
	}

	dispose(disposeItems?: boolean) {
		if (disposeItems) {
			for (const item of items.values()) {
				if (item.section == this) {
					item.dispose();
				}
			}
		}

		$(this).detach();
		sections.delete(this.id);
	}
}
customElements.define('settings-section', Section, { extends: 'form' });

export const sections: Map<string, Section> = new Map();
export const items: Map<string, Item> = new Map();

let file: JSONFileMap;

export let initialized: boolean = false;

export function init(): void {
	if (initialized) {
		logger.warn('Already initialized settings');
	}
	const filePath = path + '/settings.json',
		exists = fs.existsSync(filePath);
	if (!exists) {
		logger.warn('Settings file does not exist, will be created');
	}
	if (exists && !isJSON(fs.readFileSync(filePath, 'utf8'))) {
		logger.warn('Invalid settings file (overwriting)');
		fs.rmSync(filePath);
	}
	file = new JSONFileMap(filePath, config);
	initialized = true;
}

export function load({ sections: _sections = [], items: _items = [] }: { sections: SettingsSectionOptions[]; items: ItemOptions[] }): void {
	if (!initialized) {
		throw new Error('Can not load settings before initialization');
	}
	for (const _section of _sections) {
		logger.debug(`Loading settings section: "${_section.id}"`);
		const section = new Section(_section);
		sections.set(section.id, section);
	}

	for (const _item of _items) {
		logger.debug(`Loading setting: "${_item.id}"`);
		const item = new Item(_item);
		items.set(item.id, item);
		const value: Value = <Value>(file.has(item.id) ? file.get(item.id) : _item.value);
		item.value = value;
		file.set(item.id, value);
	}
}

export const get: (typeof file)['get'] = key => file.get(key);
export const has: (typeof file)['has'] = key => file.has(key);
export const set: (typeof file)['set'] = (key, val) => file.set(key, val);
export const ids: (typeof file)['keys'] = () => file.keys();
export const entries: (typeof file)['entries'] = () => file.entries();
export const servers: (typeof file)['values'] = () => file.values();
