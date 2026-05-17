import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const runNodeScript = (relativePath) => {
  execFileSync(process.execPath, [path.join(repoRoot, relativePath)], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
};

const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
const expectedEngine = '>=24 <25';

if (packageJson.engines?.node !== expectedEngine) {
  fail(`Root package.json must keep engines.node at "${expectedEngine}".`);
}

for (const workspace of ['apps/backend', 'apps/frontend']) {
  const workspacePackage = JSON.parse(
    await readFile(path.join(repoRoot, workspace, 'package.json'), 'utf8'),
  );
  if (workspacePackage.engines?.node !== expectedEngine) {
    fail(`${workspace}/package.json must keep engines.node at "${expectedEngine}".`);
  }
}

const major = Number.parseInt(process.versions.node.split('.')[0] ?? '', 10);
if (major !== 24) {
  fail(`Lint must run on Node 24.x; current runtime is ${process.version}.`);
}

runNodeScript('tools/check-doc-links.mjs');
runNodeScript('tools/check-german-transliterations.mjs');

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Repository lint checks passed.');
