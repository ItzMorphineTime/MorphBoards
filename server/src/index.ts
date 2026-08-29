import fs from 'node:fs';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { assetsDir, clientDist, ensureDataDirs, thumbsDir } from './paths';
import { registerRoutes } from './routes';

ensureDataDirs();

const app = Fastify({
  logger: false,
  bodyLimit: 64 * 1024 * 1024, // board docs + thumbnail dataURLs
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

registerRoutes(app);

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  console.error(err);
  reply.code(err.statusCode ?? 500).send({ error: err.message ?? 'Internal error' });
});

const port = Number(process.env.MORPH_PORT ?? 3001);
try {
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`MorphBoards server running at http://127.0.0.1:${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
