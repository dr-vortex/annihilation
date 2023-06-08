import type { Research } from '../../core/generic/research';
import { locales } from '../locales';
import $ from 'jquery';
import type { UIContext } from './context';

export class ResearchUI extends HTMLDivElement {
	constructor(research: Research, context: UIContext) {
		super();

		$(`<span class="locked locked-icon"><svg style=font-size:1.5em><use href=images/icons.svg#lock /></svg></span>
						<span class=name style=text-align:center;>${locales.text(`tech.${research.id}.name`)}</span>
						<span class="upgrade add-or-upgrade-icon"><tool-tip></tool-tip><svg style=font-size:1.5em><use href=images/icons.svg#circle-up /></svg></span>
					`).appendTo(this);

		$(this)
			.find('.upgrade')
			.on('click', () => {
				context.level.tryPlayerAction(context.playerID, 'do_research', research);
			})
			.parent()
			.attr('bg', 'none')
			.appendTo('div.lab');
	}
}
customElements.define('ui-research', ResearchUI, { extends: 'div' });
