#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, '..');

const allowedExtensions = new Set([
  '.md',
  '.txt',
  '.html',
  '.json',
  '.yml',
  '.yaml',
  '.js',
  '.ts',
  '.mjs',
  '.cjs',
  '.css',
  '.example',
  '.sample',
]);

const checks = [
  ['\\bUeberblick\\b', 'Überblick'],
  ['\\bueber\\b', 'über'],
  ['\\bUeber\\b', 'Über'],
  ['\\bfuer\\b', 'für'],
  ['\\bFuer\\b', 'Für'],
  ['\\bOberflaeche\\b', 'Oberfläche'],
  ['\\bOberflaechen\\b', 'Oberflächen'],
  ['\\bovenflaeche\\b', 'Oberfläche'],
  ['\\boeffentlich\\b', 'öffentlich'],
  ['\\boeffentliche\\b', 'öffentliche'],
  ['\\boeffentlichen\\b', 'öffentlichen'],
  ['\\bOeffentlich\\b', 'Öffentlich'],
  ['\\bOeffentliche\\b', 'Öffentliche'],
  ['\\bOeffentlichen\\b', 'Öffentlichen'],
  ['\\bpruef\\w*\\b', 'prüf…'],
  ['\\bPruef\\w*\\b', 'Prüf…'],
  ['\\bhaeufig\\b', 'häufig'],
  ['\\bHaeufig\\b', 'Häufig'],
  ['\\benthaelt\\b', 'enthält'],
  ['\\bEnthaelt\\b', 'Enthält'],
  ['\\btemporaer\\b', 'temporär'],
  ['\\bTemporaer\\b', 'Temporär'],
  ['\\bPlaene\\b', 'Pläne'],
  ['\\bplaene\\b', 'pläne'],
  ['\\bnaech\\w*\\b', 'näch…'],
  ['\\bNaech\\w*\\b', 'Näch…'],
  ['\\bverfueg\\w*\\b', 'verfüg…'],
  ['\\bVerfueg\\w*\\b', 'Verfüg…'],
  ['\\bausfuehr\\w*\\b', 'ausführ…'],
  ['\\bAusfuehr\\w*\\b', 'Ausführ…'],
  ['\\bgehoer\\w*\\b', 'gehör…'],
  ['\\bGehoer\\w*\\b', 'Gehör…'],
  ['\\bKonfigurationsschluess\\w*\\b', 'Konfigurationsschlüss…'],
  ['\\bAender\\w*\\b', 'Änder…'],
  ['\\baender\\w*\\b', 'änder…'],
  ['\\bRueck\\w*\\b', 'Rück…'],
  ['\\brueck\\w*\\b', 'rück…'],
];

const toList = (command) =>
  execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const tracked = toList('git ls-files');
const untracked = toList('git ls-files --others --exclude-standard');
const files = Array.from(new Set([...tracked, ...untracked]))
  .filter((file) => allowedExtensions.has(path.extname(file)))
  .filter((file) => fs.existsSync(path.join(repoRoot, file)));

const failures = [];

for (const relativeFile of files) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  const content = fs.readFileSync(absoluteFile, 'utf8');

  for (const [rawPattern, suggestion] of checks) {
    const pattern = new RegExp(rawPattern, 'g');
    const match = pattern.exec(content);
    if (!match) {
      continue;
    }

    const before = content.slice(0, match.index);
    const line = before.split(/\r?\n/).length;
    failures.push(`${relativeFile}:${line}: "${match[0]}" -> ${suggestion}`);
  }
}

if (failures.length > 0) {
  console.error('German transliteration check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`German transliteration check passed for ${files.length} files.`);
