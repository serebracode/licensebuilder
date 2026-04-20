import fs from 'node:fs';

const source = fs.readFileSync('electron/main.ts', 'utf-8');

const hasWriteFile = source.includes('writeFile(');
const hasFrameSeed = source.includes('frame.json');
const hasWebSeed = source.includes("'web.json'") || source.includes('"web.json"');
const hasFolders =
  source.includes("path.join(basePath, 'blocks')") &&
  source.includes("path.join(basePath, 'templates')") &&
  source.includes("path.join(basePath, 'exports')");

if (!hasFolders) {
  console.error('❌ Workspace init does not define required folders blocks/templates/exports.');
  process.exit(1);
}

if (hasWriteFile || hasFrameSeed || hasWebSeed) {
  console.error('❌ Regression: auto-seeding detected (writeFile/frame.json/web.json).');
  process.exit(1);
}

console.log('✅ Workspace init regression check passed: only folder structure is created.');
