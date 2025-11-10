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
  const sampleSource = path.join(repoRoot, 'config', 'frontend', 'frontend.json.sample');
  const realSource = path.join(repoRoot, 'config', 'frontend', 'frontend.json');

  const [sampleAvailable, realAvailable] = await Promise.all([
    pathIsFile(sampleSource),
    pathIsFile(realSource)
  ]);

  if(!sampleAvailable && !realAvailable){
    return;
  }

  const targetDir = path.join(publicDir, 'config');
  await mkdir(targetDir, { recursive: true });

  if(sampleAvailable){
    const sampleTarget = path.join(targetDir, 'frontend.json.sample');
    await cp(sampleSource, sampleTarget, { force: true });
  }

  const target = path.join(targetDir, 'frontend.json');
  const sourceForTarget = realAvailable ? realSource : sampleSource;
  if(sourceForTarget){
    await cp(sourceForTarget, target, { force: true });
  }
}

async function pathIsFile(filePath){
  try{
    const stats = await stat(filePath);
    return stats.isFile();
  }catch{
    return false;
  }
}

async function copyFallbackScript(){
  const source = path.join(frontendDir, 'src', 'js', 'fallback.js');
  const target = path.join(distDir, 'fallback.js');

  try{
    await cp(source, target, { force: true });
  }catch(err){
    console.warn('[build] Konnte fallback.js nicht kopieren:', err?.message || err);
  }
}

async function prepareStaticArtifacts(){
  await Promise.all([
    ensureConfigSample().catch(err => {
      console.warn('[build] Konnte config/frontend.json.sample nicht kopieren:', err?.message || err);
    }),
    copyFallbackScript()
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

const maxJsKb = getLimit('MAX_JS_KB', 255);
const maxCssKb = getLimit('MAX_CSS_KB', 150);

await mkdir(distDir, { recursive: true });
await prepareStaticArtifacts();

const makeJsOptions = (entryFile, outfile) => ({
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [entryFile],
  format: 'esm',
  target: ['es2019'],
  outfile,
  treeShaking: true,
  splitting: false, // Enable for code splitting if needed
  metafile: true, // Generate bundle analysis
  legalComments: 'none',
  drop: watch ? [] : ['console', 'debugger'],
  pure: ['console.log', 'console.debug']
});

const jsTargets = [
  {
    name: 'main',
    options: makeJsOptions(path.join(frontendDir, 'src', 'main.js'), path.join(distDir, 'main.js'))
  },
  {
    name: 'admin',
    options: makeJsOptions(path.join(frontendDir, 'src', 'admin', 'main.ts'), path.join(distDir, 'admin.js'))
  }
];

const cssOptions = {
  bundle: true,
  minify: true,
  sourcemap: !watch,
  logLevel: 'info',
  entryPoints: [
    path.join(frontendDir, 'styles', 'app.css'),
    path.join(frontendDir, 'styles', 'hero.css'),
    path.join(frontendDir, 'styles', 'email-features.css'),
    path.join(frontendDir, 'styles', 'admin.css')
  ],
  outdir: distDir,
  entryNames: '[name]',
  metafile: true
};

if(watch){
  const jsContexts = await Promise.all(jsTargets.map(target => context(target.options)));
  const cssCtx = await context(cssOptions);
  await Promise.all([
    ...jsContexts.map(ctx => ctx.watch()),
    cssCtx.watch()
  ]);
  console.log('Watching for changes...');
}else{
  const [jsResults, cssResult] = await Promise.all([
    Promise.all(jsTargets.map(target => build(target.options))),
    build(cssOptions)
  ]);

  let limitExceeded = false;

  jsResults.forEach((result, index) => {
    if(!result.metafile) return;
    const jsSize = Object.entries(result.metafile.outputs)
      .filter(([file]) => file.endsWith('.js'))
      .reduce((total, [, output]) => total + (output.bytes || 0), 0);
    const jsSizeKb = jsSize / 1024;
    const label = jsTargets[index]?.name ?? `bundle-${index}`;
    console.log(`JS Bundle (${label}): ${jsSizeKb.toFixed(2)} KB`);
    if(jsSizeKb > maxJsKb){
      console.error(`JS Bundle (${label}) überschreitet Limit (${jsSizeKb.toFixed(2)} KB > ${maxJsKb} KB). Passe MAX_JS_KB an, um das Limit zu ändern.`);
      limitExceeded = true;
    }
  });

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
