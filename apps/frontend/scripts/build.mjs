import { build, context } from 'esbuild';
import { mkdir, cp, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'public', 'dist');
const publicDir = path.join(frontendDir, 'public');
const repoRoot = path.resolve(frontendDir, '..', '..');

async function ensureConfigSample(){
  const source = path.join(repoRoot, 'config', 'frontend.json.sample');
  try{
    const stats = await stat(source);
    if(!stats.isFile()) return;
  }catch{
    return;
  }

  const targetDir = path.join(publicDir, 'config');
  await mkdir(targetDir, { recursive: true });
  const sampleTarget = path.join(targetDir, 'frontend.json.sample');
  await cp(source, sampleTarget, { force: true });

  const target = path.join(targetDir, 'frontend.json');
  try{
    await stat(target);
  }catch{
    await cp(source, target, { force: true });
  }
}

async function copySampleExports(){
  const exportsDir = path.join(repoRoot, 'data', 'exports');
  try{
    const stats = await stat(exportsDir);
    if(!stats.isDirectory()) return;
  }catch{
    return;
  }

  const targetDir = path.join(publicDir, 'data', 'exports');
  await mkdir(path.dirname(targetDir), { recursive: true });
  await cp(exportsDir, targetDir, { recursive: true, force: true });
}

async function prepareStaticArtifacts(){
  await Promise.all([
    ensureConfigSample().catch(err => {
      console.warn('[build] Konnte config/frontend.json.sample nicht kopieren:', err?.message || err);
    }),
    copySampleExports().catch(err => {
      console.warn('[build] Konnte Beispieldaten nicht kopieren:', err?.message || err);
    })
  ]);
}

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
await prepareStaticArtifacts();

const jsOptions = {
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [path.join(frontendDir, 'src', 'js', 'main.js')],
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
    path.join(frontendDir, 'styles', 'app.css'),
    path.join(frontendDir, 'styles', 'hero.css')
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
