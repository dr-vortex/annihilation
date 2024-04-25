/* eslint-env node */
import type { Input } from 'electron';
import { app, shell, nativeTheme, ipcMain, BrowserWindow } from 'electron';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { type IOMessage, LogLevel, Logger } from 'logzen';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import type { ClientInit } from './client';
import { version, versions } from '../core/metadata';

const __dirname: string = resolve(fileURLToPath(import.meta.url), '..');

const options = parseArgs({
	options: {
		dev: { type: 'boolean', default: false },
		logLevel: { type: 'string' },
		quiet: { type: 'boolean', default: false },
		initalScale: { type: 'string', default: '100' },
		path: { type: 'string', default: __dirname },
	},
	allowPositionals: true,
}).values;

// Initial window scale
let initialScale: number = parseInt(options.initalScale);
initialScale = isNaN(initialScale) ? 100 : initialScale;

// Set up logging
const logger = new Logger({ prefix: 'main' });
const logDir: string = join(options.path, 'logs/');
if (!existsSync(logDir)) {
	// This also creates the data directory if it doesn't exist
	mkdirSync(logDir, { recursive: true });
}
const logFile = join(logDir, new Date().toISOString().replaceAll(':', '.') + '.log');
logger.on('entry', entry => appendFileSync(logFile, entry + '\n'));

if (options.quiet || !options.dev) {
	logger.detach(console, [LogLevel.DEBUG, LogLevel.LOG, LogLevel.INFO]);
}

logger.debug('Options: ' + JSON.stringify(options));

if (options.logLevel) {
	logger.warn('CLI flag for log level ignored (unsupported)');
}

logger.log('Initializing...');

ipcMain.handle('options', (): ClientInit => ({ ...options, debug: options.dev }));
ipcMain.handle('log', (ev, msg: IOMessage) => logger.send({ ...msg, computed: null }));

nativeTheme.themeSource = 'dark';

function init(): void {
	const window: BrowserWindow = new BrowserWindow({
		width: 16 * initialScale,
		height: 9 * initialScale,
		center: true,
		darkTheme: true,
		webPreferences: {
			preload: join(__dirname, 'preload.mjs'),
			nodeIntegration: true,
		},
	});

	window.removeMenu();
	window.loadFile(join(__dirname, 'index.html'));

	window.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: 'deny' };
	});
	window.setFullScreenable(true);
	window.center();
	window.title = 'Blankstorm Client ' + versions.get(version).text;

	const inputHandler = (ev, input: Input) => {
		if (input.type == 'keyUp') {
			return;
		}
		switch (input.key) {
			case 'F5':
				window.reload();
				break;
			case 'F11':
				window.fullScreen = !window.fullScreen;
				break;
			case 'F12':
				if (options.dev) {
					window.webContents.toggleDevTools();
				}
				break;
		}
	};

	window.webContents.on('before-input-event', inputHandler);
	window.webContents.on('devtools-opened', () => {
		window.webContents.devToolsWebContents.on('before-input-event', inputHandler);
	});
}

app.whenReady().then(init);

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
