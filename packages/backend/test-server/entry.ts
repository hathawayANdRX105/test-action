import { portToPid } from 'pid-port';
import fkill from 'fkill';
import Fastify from 'fastify';
import { NestFactory } from '@nestjs/core';
import { MainModule } from '@/MainModule.js';
import { QueueProcessorModule } from '@/queue/QueueProcessorModule.js';
import { QueueProcessorService } from '@/queue/QueueProcessorService.js';
import { ServerService } from '@/server/ServerService.js';
import type { Config } from '@/config.js';
import { NestLogger } from '@/NestLogger.js';
import { DI } from '@/di-symbols.js';
import type { INestApplicationContext } from '@nestjs/common';

const originEnv = JSON.stringify(process.env);
process.env.NODE_ENV = 'test';

let app: INestApplicationContext;
let queueApp: INestApplicationContext | null = null;
let serverService: ServerService;

async function startQueue(): Promise<void> {
	// post-note background tasks (LTL fanout, repliesCount++) need workers.
	queueApp = await NestFactory.createApplicationContext(QueueProcessorModule, {
		logger: new NestLogger(),
	});
	await queueApp.init();
	queueApp.enableShutdownHooks();
	queueApp.get(QueueProcessorService).start();
}

async function stopQueue(): Promise<void> {
	if (!queueApp) return;
	try { await queueApp.close(); } catch { /* */ }
	queueApp = null;
}

async function bootServer(): Promise<Config> {
	app = await NestFactory.createApplicationContext(MainModule, {
		logger: new NestLogger(),
	});
	app.enableShutdownHooks();
	const config = app.get<Config>(DI.config);
	await killTestServer(config);
	serverService = app.get(ServerService);
	await serverService.launch();
	await startQueue();
	return config;
}

async function stopServer(): Promise<void> {
	await stopQueue();
	try { await serverService.dispose(); } catch { /* */ }
	try { await app.close(); } catch { /* */ }
}

async function launch() {
	const config = await bootServer();
	await startControllerEndpoints(config);
	console.log('application initialized.');
}

async function killTestServer(config: Config) {
	try {
		const pid = await portToPid(config.port);
		if (pid) await fkill(pid, { force: true });
	} catch { /* NOP */ }
}

async function startControllerEndpoints(config: Config) {
	const port = config.port + 1000;
	const fastify = Fastify();

	fastify.post<{ Body: { key?: string, value?: string } }>('/env', async (req, res) => {
		console.log(req.body);
		const key = req.body['key'];
		if (!key) {
			res.code(400).send({ success: false });
			return;
		}
		process.env[key] = req.body['value'];
		res.code(200).send({ success: true });
	});

	fastify.post('/env-reset', async (_req, res) => {
		// Server process must full-drop on relaunch (never KEEP).
		const restored = JSON.parse(originEnv) as Record<string, string | undefined>;
		process.env = { ...restored, NODE_ENV: 'test' };
		delete process.env.MK_TEST_KEEP_SCHEMA;

		await stopServer();
		await killTestServer(config);

		console.log('starting application...');
		await bootServer();
		console.log('application re-initialized.');
		res.code(200).send({ success: true });
	});

	await fastify.listen({ port: port, host: 'localhost' });
}

export default launch;
