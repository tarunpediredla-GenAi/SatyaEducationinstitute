import path from 'node:path';
import express from 'express';
import { createApiApp } from './src/serverApp';

export { createApiApp };

export async function createAppServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return app;
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  createAppServer().then((app) => {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, '0.0.0.0', () => {
      console.log(`Satya's Education full-stack server listening on http://0.0.0.0:${port}`);
    });
  });
}
