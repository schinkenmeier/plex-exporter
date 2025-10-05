import { build, context } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');
const distDir = path.join(siteDir, 'dist');

const watch = process.argv.includes('--watch');

const getLimit = (envKey, defaultValue) => {
  const raw = process.env[envKey];
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
};

const maxJsKb = getLimit('MAX_JS_KB', 250);
const maxCssKb = getLimit('MAX_CSS_KB', 150);

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
  entryPoints: [
    path.join(siteDir, 'css', 'app.css'),
    path.join(siteDir, 'css', 'hero.css')
  ],
  outdir: distDir,
  entryNames: '[name]',
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

  let limitExceeded = false;

  if(jsResult.metafile){
    const jsSize = Object.entries(jsResult.metafile.outputs)
      .filter(([file]) => file.endsWith('.js'))
      .reduce((total, [, output]) => total + (output.bytes || 0), 0);
    const jsSizeKb = jsSize / 1024;
    console.log(`JS Bundle: ${jsSizeKb.toFixed(2)} KB`);
    if(jsSizeKb > maxJsKb){
      console.error(`JS Bundle überschreitet Limit (${jsSizeKb.toFixed(2)} KB > ${maxJsKb} KB). Passe MAX_JS_KB an, um das Limit zu ändern.`);
      limitExceeded = true;
    }
  }

  if(cssResult.metafile){
    const cssSize = Object.entries(cssResult.metafile.outputs)
      .filter(([file]) => file.endsWith('.css'))
      .reduce((total, [, output]) => total + (output.bytes || 0), 0);
    const cssSizeKb = cssSize / 1024;
    console.log(`CSS Bundle: ${cssSizeKb.toFixed(2)} KB`);
    if(cssSizeKb > maxCssKb){
      console.error(`CSS Bundle überschreitet Limit (${cssSizeKb.toFixed(2)} KB > ${maxCssKb} KB). Passe MAX_CSS_KB an, um das Limit zu ändern.`);
      limitExceeded = true;
    }
  }

  if(limitExceeded){
    console.error('Abbruch, da mindestens ein Bundle-Limit überschritten wurde.');
    process.exit(1);
  }

  console.log('Build completed.');
}
