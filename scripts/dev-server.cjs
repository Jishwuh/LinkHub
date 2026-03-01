process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.ENV_FILE = process.env.ENV_FILE || '.env.development';

const { startServer } = require('../server.cjs');
const { spawnSync } = require('child_process');

startServer().catch(err => {
  const dbHost = process.env.DB_HOST || '127.0.0.1';
  const dbPort = process.env.DB_PORT || '3306';
  const isDbConnectError =
    err?.code === 'ECONNREFUSED' ||
    err?.code === 'ETIMEDOUT' ||
    err?.code === 'EHOSTUNREACH' ||
    err?.code === 'ENOTFOUND';

  if (isDbConnectError) {
    const dockerInfo = spawnSync('docker', ['info'], { stdio: 'ignore', shell: true });
    const dockerDaemonReady = dockerInfo.status === 0;

    console.error('');
    console.error(`Dev server could not connect to MySQL at ${dbHost}:${dbPort} (${err.code}).`);
    console.error('');
    console.error('Quick fixes:');
    console.error('1) If you use Docker for dev DB:');
    if (!dockerDaemonReady) {
      console.error('   - Start Docker Desktop first (daemon is currently not reachable).');
    }
    console.error('   - Run: npm run dev:db:up');
    console.error('   - Then run: npm run dev');
    console.error('');
    console.error('2) If you use a local MySQL install:');
    console.error('   - Ensure MySQL is running');
    console.error(`   - Ensure .env.development points to the right host/port (current: ${dbHost}:${dbPort})`);
    console.error('');
    console.error('Tip: check the port quickly in PowerShell:');
    console.error(`   Test-NetConnection -ComputerName ${dbHost} -Port ${dbPort}`);
    console.error('');
  } else {
    console.error('Failed to start dev server:', err);
  }

  process.exit(1);
});
