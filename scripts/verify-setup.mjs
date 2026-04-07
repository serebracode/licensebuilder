import fs from 'node:fs';
import path from 'node:path';

const requiredFiles = [
  'package.json',
  'electron/main.ts',
  'electron/preload.ts',
  'src/main.tsx',
  'src/App.tsx',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.electron.json'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.resolve(file)));

const [major] = process.versions.node.split('.').map(Number);

if (major < 20) {
  console.error(`❌ Node.js ${process.versions.node} detected. Please use Node.js 20+.`);
  process.exit(1);
}

if (missing.length > 0) {
  console.error('❌ Missing required files:');
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

console.log('✅ Setup check passed. Required files are present and Node.js version is supported.');
