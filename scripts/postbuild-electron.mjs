import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve(process.cwd(), 'dist-electron');

await mkdir(outDir, { recursive: true });
await writeFile(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);
