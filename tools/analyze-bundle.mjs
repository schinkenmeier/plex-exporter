#!/usr/bin/env node
/**
 * Bundle size analyzer
 * Analyzes the bundle and shows size breakdown
 */

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const siteDir = path.join(rootDir, 'site');
const distDir = path.join(siteDir, 'dist');

await mkdir(distDir, { recursive: true });

const jsOptions = {
  bundle: true,
  minify: true,
  logLevel: 'info',
  entryPoints: [path.join(siteDir, 'js', 'main.js')],
  format: 'esm',
  target: ['es2019'],
  outfile: path.join(distDir, 'main.js'),
  treeShaking: true,
  metafile: true,
  legalComments: 'none',
  drop: ['console', 'debugger'],
  pure: ['console.log', 'console.debug']
};

console.log('🔍 Analyzing bundle...\n');

const result = await build(jsOptions);

if (result.metafile) {
  const outputs = result.metafile.outputs;
  const inputs = result.metafile.inputs;

  // Calculate total size
  let totalBytes = 0;
  for (const output of Object.values(outputs)) {
    totalBytes += output.bytes || 0;
  }

  console.log('📦 Bundle Size Analysis\n');
  console.log(`Total Bundle Size: ${(totalBytes / 1024).toFixed(2)} KB (${(totalBytes / 1024 / 1024).toFixed(2)} MB)\n`);

  // Show input files sorted by size
  const inputSizes = Object.entries(inputs)
    .map(([file, info]) => ({
      file: file.replace(siteDir, ''),
      bytes: info.bytes || 0
    }))
    .sort((a, b) => b.bytes - a.bytes);

  console.log('📄 Input Files (largest first):\n');
  inputSizes.slice(0, 20).forEach(({ file, bytes }) => {
    const kb = (bytes / 1024).toFixed(2);
    const percent = ((bytes / totalBytes) * 100).toFixed(1);
    console.log(`  ${kb.padStart(8)} KB  ${percent.padStart(5)}%  ${file}`);
  });

  if (inputSizes.length > 20) {
    console.log(`\n  ... and ${inputSizes.length - 20} more files\n`);
  }

  // Recommendations
  console.log('\n💡 Optimization Recommendations:\n');

  const largeFiles = inputSizes.filter(f => f.bytes > 10 * 1024);
  if (largeFiles.length > 0) {
    console.log('  • Consider code-splitting for large modules');
  }

  if (totalBytes > 200 * 1024) {
    console.log('  • Bundle is over 200KB - consider lazy loading some features');
  }

  if (totalBytes > 500 * 1024) {
    console.log('  • Bundle is over 500KB - strongly recommend code splitting');
  }

  if (totalBytes < 100 * 1024) {
    console.log('  ✓ Bundle size is excellent!');
  } else if (totalBytes < 200 * 1024) {
    console.log('  ✓ Bundle size is good');
  }

  console.log('\n');
}
