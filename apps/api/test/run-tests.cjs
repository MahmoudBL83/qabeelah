const { spawnSync } = require('node:child_process');
const { readdirSync, statSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '..');

const collectTests = (dir) => {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectTests(fullPath));
    } else if (entry.endsWith('.test.cjs')) {
      files.push(fullPath);
    }
  }

  return files;
};

const testFiles = collectTests(join(root, 'test'));

if (testFiles.length === 0) {
  console.log('No tests found.');
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'test-secret',
  },
});

process.exit(result.status || 0);
