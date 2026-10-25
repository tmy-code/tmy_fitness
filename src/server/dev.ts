// Local development only: the API listens where the Vite proxy expects it, whatever PORT the shell exports.
process.env.PORT = process.env.API_PORT ?? '3000';
await import('./main.ts');
export {};
