import { createApiApp } from '../src/serverApp';

// Serverless entrypoint compiled to api/index.js for Vercel
const app = createApiApp();

export default app;
