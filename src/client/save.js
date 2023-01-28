import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';

import 'jquery'; /* global $ */

import { version, versions, random, generate, Ship, Player, Planet, Level } from 'core';
import { modal, download, confirm, alert } from './utils.js';
import Waypoint from './waypoint.js';
import db from './db.js';
import { Playable } from './playable.js';
import { canvas, setPaused, mp, saves } from './index.js';
import { update as updateUI } from './ui.js';
import PlanetRenderer from './renderer/bodies/PlanetRenderer.js';
import { scene } from './renderer/index.js';

export default class Save extends Playable {
	static GUI(save) {
		const gui = $(`<li ofn bg bw style=align-items:center;height:3em;></li>`);
		gui.delete = $(`<p style=position:absolute;left:10%><svg><use href=images/icons.svg#trash /></svg></p>`).appendTo(gui);
		gui.download = $(`<p style=position:absolute;left:15%><svg><use href=images/icons.svg#download /></svg></p>`).appendTo(gui);
		gui.play = $(`<p style=position:absolute;left:20%><svg><use href=images/icons.svg#play /></svg></p>`).appendTo(gui);
		gui.edit = $(`<p style=position:absolute;left:25%><svg><use href=images/icons.svg#pencil /></svg></p>`).appendTo(gui);
		gui.name = $(`<p style=position:absolute;left:30%>${save.data.name}</p>`).appendTo(gui);
		gui.version = $(`<p style=position:absolute;left:55%>${versions.get(save.data.version) ? versions.get(save.data.version).text : save.data.version}</p>`).appendTo(gui);
		gui.date = $(`<p style=position:absolute;left:65%>${new Date(save.data.date).toLocaleString()}</p>`).appendTo(gui);
		$('<p> </p>').appendTo(gui);

		let loadAndPlay = async () => {
			$('#loading_cover').show();
			let live = save.load();
			await live.ready();
			save.getStore().current = live;
			live.play();
			$('#loading_cover').hide();
		};

		gui.attr('clickable', '')
			.click(() => {
				$('.selected').removeClass('selected');
				save.getStore().selected = save.data.id;
				gui.addClass('selected');
			})
			.dblclick(loadAndPlay);
		if (!mp) gui.prependTo('#load');
		gui.delete.click(async e => {
			let remove = async () => {
				gui.remove();
				const tx = await db.tx('saves', 'readwrite');
				tx.objectStore('saves').delete(save.data.id);
				save.delete();
			};
			e.shiftKey ? remove() : confirm().then(remove);
		});
		gui.download.click(() => download(JSON.stringify(save.data), (save.data.name || 'save') + '.json'));
		gui.play.click(loadAndPlay);
		gui.edit.click(async () => {
			const result = await modal([{ name: 'name', placeholder: 'New name', value: save.data.name }], { Cancel: false, Save: true });
			if (result.result) {
				save.data.name = result.name;
				updateUI();
			}
		});
		return gui;
	}
	static Live = class extends Level {
		waypoints = [];
		constructor(name, doNotGenerate) {
			super(name, doNotGenerate);
		}
		play() {
			if (this.version == version) {
				$('#load').hide();
				canvas.show().focus();
				$('#hud').show();
				saves.selected = this.id;
				setPaused(false);
			} else {
				alert('That save is in compatible with the current game version');
			}
		}
		static Load(saveData, engine) {
			let save = new Save.Live(saveData.name, true);
			Level.Load(saveData, engine, save);
			return save;
		}
		static async CreateDefault(name, playerID, playerName) {
			const save = new Save.Live(name);

			await save.ready();

			for (let body of save.bodies.values()) {
				body.waypoint = new Waypoint(
					{
						name: body.name,
						position: body.position,
						color: Color3.FromHexString('#88ddff'),
						icon: PlanetRenderer.biomes.has(body.biome) && body instanceof Planet ? PlanetRenderer.biomes.get(body.biome).icon : 'planet-ringed',
						readonly: true,
					},
					save
				);
			}

			const playerData = new Player({ id: playerID, name: playerName, position: new Vector3(0, 0, -1000).add(random.cords(50, true)), level: save });
			playerData._customHardpointProjectileMaterials = [
				{
					applies_to: ['laser'],
					material: Object.assign(new StandardMaterial('player-laser-projectile-material', scene), {
						emissiveColor: Color3.Teal(),
						albedoColor: Color3.Teal(),
					}),
				},
			];
			save.entities.set(playerID, playerData);

			new Ship({ className: 'mosquito', owner: playerData, level: save });
			new Ship({ className: 'cillus', owner: playerData, level: save });
			playerData.addItems(generate.items(5000));

			return save;
		}
	};
	constructor(data) {
		super(data.id, saves);
		try {
			this.data = data;
			this.gui = Save.GUI(this);
			saves.set(this.data.id, this);
		} catch (err) {
			console.error(err.stack);
		}
	}
	load() {
		let save = Save.Live.Load(this.data);
		for (let waypoint of save.waypoints) {
			new Waypoint({
				id: waypoint.id,
				name: waypoint.name,
				color: Color3.FromArray(waypoint.color),
				position: Vector3.FromArray(waypoint.position),
			});
		}
		return save;
	}
	async saveToDB() {
		let tx = await db.tx('saves', 'readwrite');
		tx.objectStore('saves').put(this.data, this.data.id);
		return tx.result;
	}
}
