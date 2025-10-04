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
  outfile: path.join(distDir, 'main.js'),
  treeShaking: true,
  splitting: false, // Enable for code splitting if needed
  metafile: true, // Generate bundle analysis
  legalComments: 'none',
  drop: watch ? [] : ['console', 'debugger'],
  pure: ['console.log', 'console.debug']
};

const cssOptions = {
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [path.join(siteDir, 'css', 'app.css')],
  outfile: path.join(distDir, 'app.css'),
  metafile: true
};

if(watch){
  const [jsCtx, cssCtx] = await Promise.all([
    context(jsOptions),
    context(cssOptions)
  ]);
  await Promise.all([jsCtx.watch(), cssCtx.watch()]);
  console.log('Watching for changes...');
}else{
  const [jsResult, cssResult] = await Promise.all([
    build(jsOptions),
    build(cssOptions)
  ]);

  // Log bundle sizes
  if(jsResult.metafile){
    const jsSize = Object.values(jsResult.metafile.outputs)[0]?.bytes || 0;
    console.log(`JS Bundle: ${(jsSize / 1024).toFixed(2)} KB`);
  }
  if(cssResult.metafile){
    const cssSize = Object.values(cssResult.metafile.outputs)[0]?.bytes || 0;
    console.log(`CSS Bundle: ${(cssSize / 1024).toFixed(2)} KB`);
  }

  console.log('Build completed.');
}
