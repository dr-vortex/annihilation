import $ from 'jquery';
import { LogLevel } from 'logzen';
import { logger as coreLogger } from '../core';
import * as client from './client';
import { logger } from './utils';

addEventListener('error', ev => {
	$app.log({
		contents: ev.error.stack,
		level: LogLevel.ERROR,
		prefix: 'client',
	});
});

$.event.special.wheel = {
	setup: function (_, ns, handle) {
		this.addEventListener('wheel', handle as unknown as EventListener, { passive: true });
	},
};

const options = await $app.options();
if (options.debug) {
	logger.info('Debug mode enabled');
	Object.assign(globalThis, {
		client,
		core: await import('../core'),
		renderer: await import('../renderer'),
		ui: await import('./ui/ui'),
		map: await import('./ui/map'),
		user: await import('./user'),
		$,
	});
}
coreLogger.on('send', entry => $app.log({ ...entry, prefix: 'core' }));
$('body').on('contextmenu', () => options.debug);
await client.init(options);
