process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.ENV_FILE = process.env.ENV_FILE || '.env.development';

const { startServer } = require('../server.cjs');

startServer().catch(err => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
