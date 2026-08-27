import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';

const vitestPath = path.resolve('node_modules/vitest/vitest.mjs');
const args = [vitestPath, ...process.argv.slice(2)];

const proc = spawn(electron, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
});

proc.on('close', (code) => {
  process.exit(code || 0);
});
