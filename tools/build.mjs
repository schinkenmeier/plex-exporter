import { build, context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');
const distDir = path.join(siteDir, 'dist');

const watch = process.argv.includes('--watch');

await mkdir(distDir, { recursive: true });

const jsOptions = {
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [path.join(siteDir, 'js', 'main.js')],
  format: 'esm',
  target: ['es2019'],
  outfile: path.join(distDir, 'main.js')
};

const cssOptions = {
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [path.join(siteDir, 'css', 'app.css')],
  outfile: path.join(distDir, 'app.css')
};

if(watch){
  const [jsCtx, cssCtx] = await Promise.all([
    context(jsOptions),
    context(cssOptions)
  ]);
  await Promise.all([jsCtx.watch(), cssCtx.watch()]);
  console.log('Watching for changes...');
}else{
  await Promise.all([
    build(jsOptions),
    build(cssOptions)
  ]);
  console.log('Build completed.');
}
