import { createApiApp } from '../src/serverApp';

// Vercel Serverless Function entrypoint for all /api/* routes
const app = createApiApp();

export default app;
