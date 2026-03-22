#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, '..');

const readGitFileList = (command) =>
  execSync(command, {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const trackedMarkdownFiles = readGitFileList('git ls-files "*.md"');
const untrackedMarkdownFiles = readGitFileList('git ls-files --others --exclude-standard "*.md"');
const markdownFiles = Array.from(new Set([...trackedMarkdownFiles, ...untrackedMarkdownFiles]))
  .filter((file) => fs.existsSync(path.join(repoRoot, file)));

const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
const errors = [];

const shouldSkipTarget = (target) =>
  !target ||
  target.startsWith('#') ||
  target.startsWith('http://') ||
  target.startsWith('https://') ||
  target.startsWith('mailto:') ||
  target.startsWith('tel:') ||
  target.startsWith('data:');

for (const relativeFile of markdownFiles) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  const content = fs.readFileSync(absoluteFile, 'utf8');
  const fileDir = path.dirname(absoluteFile);

  for (const match of content.matchAll(linkPattern)) {
    const rawTarget = match[1]?.trim() ?? '';
    if (shouldSkipTarget(rawTarget)) {
      continue;
    }

    const targetWithoutAnchor = rawTarget.split('#')[0].split('?')[0];
    if (!targetWithoutAnchor) {
      continue;
    }

    const normalizedTarget = decodeURIComponent(targetWithoutAnchor);
    const resolvedPath = path.resolve(fileDir, normalizedTarget);

    if (!fs.existsSync(resolvedPath)) {
      errors.push(`${relativeFile}: missing link target -> ${rawTarget}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Markdown link check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Markdown link check passed for ${markdownFiles.length} files.`);
