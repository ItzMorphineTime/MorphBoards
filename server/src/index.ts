import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { getCookieSecret, isLoopback } from './auth';
import { assetsDir, clientDist, dataDir, ensureDataDirs, thumbsDir } from './paths';
import { flushAllRooms, registerRealtime } from './realtime';
import { registerRoutes } from './routes';

ensureDataDirs();

const app = Fastify({
  logger: false,
  bodyLimit: 64 * 1024 * 1024, // board docs + thumbnail dataURLs
  trustProxy: process.env.MORPH_TRUST_PROXY === '1',
});

await app.register(cookie, { secret: getCookieSecret() });

await app.register(rateLimit, {
  global: true,
  max: 600,
  timeWindow: '1 minute',
  allowList: (req) => isLoopback(req),
});

await app.register(websocket, {
  options: { maxPayload: 4 * 1024 * 1024 },
});

await app.register(multipart, {
  limits: { fileSize: 512 * 1024 * 1024, files: 1 },
});

// Uploaded assets: filenames are unique ids, safe to cache forever.
await app.register(fastifyStatic, {
  root: assetsDir,
  prefix: '/files/',
  maxAge: '365d',
  immutable: true,
});

await app.register(fastifyStatic, {
  root: thumbsDir,
  prefix: '/thumbnails/',
  decorateReply: false,
  maxAge: 0,
});

// Production: serve the built client from the same port.
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    decorateReply: false,
  });
}

registerRealtime(app);
registerRoutes(app);

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  console.error(err);
  reply.code(err.statusCode ?? 500).send({ error: err.message ?? 'Internal error' });
});

// never lose in-memory room state on shutdown
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    flushAllRooms();
    process.exit(0);
  });
}
process.on('beforeExit', flushAllRooms);

// crashes must be diagnosable (crash.log) and must not lose room state
function logCrash(kind: string, err: unknown): void {
  const line = `[${new Date().toISOString()}] ${kind}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`;
  console.error(line);
  try {
    fs.appendFileSync(path.join(dataDir, 'crash.log'), line);
  } catch {
    // nothing more we can do
  }
  try {
    flushAllRooms();
  } catch {
    // nothing more we can do
  }
}
process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logCrash('unhandledRejection', err);
  process.exit(1);
});

const port = Number(process.env.MORPH_PORT ?? 3001);
// 127.0.0.1 = private to this machine; set MORPH_HOST=0.0.0.0 to let
// share links work for other devices (LAN) or a hosted deployment.
const host = process.env.MORPH_HOST ?? '127.0.0.1';
try {
  await app.listen({ port, host });
  console.log(`MorphBoards server running at http://${host}:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
