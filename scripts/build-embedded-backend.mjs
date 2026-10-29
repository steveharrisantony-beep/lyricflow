import {build} from 'esbuild';
import {mkdir, copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = new URL('../dist/nodejs/', import.meta.url);
await mkdir(out, {recursive: true});
await build({
  absWorkingDir: root,
  entryPoints: ['server.ts'],
  outfile: fileURLToPath(new URL('server.mjs', out)),
  bundle: true,
  platform: 'node',
  target: 'node18.20',
  format: 'esm',
  external: ['vite'],
  define: {'process.env.NODE_ENV': '"production"'},
  banner: {js: "import {createRequire as makeRequire} from 'node:module'; const require = makeRequire(import.meta.url);"},
});
await copyFile(new URL('../node-runtime/index.cjs', import.meta.url), new URL('index.cjs', out));
await writeFile(new URL('package.json', out), JSON.stringify({name: 'lyricflow-device-backend', private: true, main: 'index.cjs'}));
console.log('Bundled the existing Express backend for the on-device Node.js runtime.');
