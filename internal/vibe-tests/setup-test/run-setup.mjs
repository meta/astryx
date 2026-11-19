#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Prepare setup-test sandboxes without launching an executor.
 *
 * Every run is a validated copy of a canonical fixture. The matrix keeps
 * fixture, condition, prompt, repetition, and paired harness/model bundle as
 * separate dimensions and emits one versioned provenance sidecar per task.
 */

import * as crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyFixture, readRecipe} from '../src/fixture-suite.mjs';
import {
  createSetupProvenance,
  expandSetupMatrix,
  fixtureManifestSha256,
  setupEnvironmentHash,
  sha256Text,
  taskContractText,
  validatePromptContracts,
} from './setup-matrix.mjs';
import {assertPublicArtifactSafe} from '../src/public-artifact.mjs';
import {linkDirectory} from './linkDirectory.mjs';

const EXP_DIR = path.dirname(fileURLToPath(import.meta.url));
const VIBE_DIR = path.resolve(EXP_DIR, '..');
const REPO_ROOT = path.resolve(VIBE_DIR, '../..');
const GUIDANCE = path.join(EXP_DIR, 'guidance');
const REAL_CLI_BIN = path.join(
  REPO_ROOT,
  'packages',
  'cli',
  'clients',
  'cli',
  'bin',
  'astryx.mjs',
);

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const list = name => {
  const selected = value(name);
  return selected
    ? selected
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : undefined;
};

const outRoot = path.resolve(value('out', path.join(EXP_DIR, 'results')));
const artifactPath = absolutePath =>
  path.relative(outRoot, absolutePath).split(path.sep).join('/');
const matrixFile = path.resolve(
  value('matrix', path.join(EXP_DIR, 'matrix.json')),
);
const matrixConfig = JSON.parse(fs.readFileSync(matrixFile, 'utf8'));
const stage = value('stage', matrixConfig.stages[0]?.id);
const requestedReps = value('reps');
const copyDeps = flag('copy-deps') || stage === 'confirmation';

const read = file => fs.readFileSync(file, 'utf8');
const ensureDir = directory => fs.mkdirSync(directory, {recursive: true});
const write = (file, content) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content);
};
const run = (command, commandArgs, cwd) =>
  execFileSync(command, commandArgs, {cwd, stdio: 'pipe', encoding: 'utf8'});
// pnpm is a .cmd (batch) file on Windows. execFileSync, like spawnSync, can
// only run a batch file through a shell — a bare 'pnpm' fails with ENOENT
// and an explicit 'pnpm.cmd' still fails with EINVAL (batch files need a
// shell even named exactly). Shelling out through cmd.exe /c directly,
// rather than execFileSync's shell:true, avoids Node's
// shell-argument-escaping deprecation warning (DEP0190) — every argument
// here is a hardcoded literal, never user input, so we build the argv
// ourselves instead of asking execFileSync to build a shell string. See
// internal/vibe-tests/src/fixture-suite.mjs for the same pattern.
const runPnpm = (pnpmArgs, cwd) =>
  process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...pnpmArgs], {
        cwd,
        stdio: 'pipe',
        encoding: 'utf8',
      })
    : execFileSync('pnpm', pnpmArgs, {cwd, stdio: 'pipe', encoding: 'utf8'});

function copyDirectory(source, destination) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, {withFileTypes: true})) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    else fs.copyFileSync(from, to);
  }
}

function prepareDependencies(fixtureId) {
  const fixtureRoot = path.join(VIBE_DIR, 'fixtures', fixtureId);
  const depsDir = path.join(outRoot, '.deps', fixtureId);
  if (fs.existsSync(path.join(depsDir, 'node_modules'))) return depsDir;
  ensureDir(depsDir);
  for (const file of ['package.json', 'pnpm-lock.yaml']) {
    fs.copyFileSync(path.join(fixtureRoot, file), path.join(depsDir, file));
  }
  runPnpm(['install', '--frozen-lockfile', '--ignore-scripts'], depsDir);
  return depsDir;
}

function linkDependencies(depsDir, sandboxDir) {
  const source = path.join(depsDir, 'node_modules');
  const destination = path.join(sandboxDir, 'node_modules');
  if (copyDeps) copyDirectory(source, destination);
  else linkDirectory(source, destination);
}

function installLoggingShim(sandboxDir) {
  const binDir = path.join(sandboxDir, 'node_modules', '.bin');
  ensureDir(binDir);
  const logPath = path.join(sandboxDir, '.astryx-invocations.log');
  const shim = `#!/usr/bin/env node
// Records setup-documentation lookups, then delegates to the real CLI.
import {appendFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const LOG = ${JSON.stringify(logPath)};
const REAL = ${JSON.stringify(REAL_CLI_BIN)};
const argv = process.argv.slice(2);
const started = new Date().toISOString();
const result = spawnSync(process.execPath, [REAL, ...argv], {stdio: 'inherit'});
try {
  appendFileSync(LOG, JSON.stringify({ts: started, argv, status: result.status ?? 0}) + '\\n');
} catch {}
process.exit(result.status ?? 0);
`;
  const shimPath = path.join(binDir, 'astryx');
  fs.rmSync(shimPath, {force: true});
  fs.writeFileSync(shimPath, shim);
  fs.chmodSync(shimPath, 0o755);
}

function createSandbox(fixtureId, sandboxDir, depsDir) {
  copyFixture(fixtureId, sandboxDir);
  linkDependencies(depsDir, sandboxDir);
  installLoggingShim(sandboxDir);
  runPnpm(['build'], sandboxDir);
}

function appendGuidance(sandboxDir, guidanceFile) {
  const agentsFile = path.join(sandboxDir, 'AGENTS.md');
  const prefix = fs.existsSync(agentsFile) ? '\n' : '';
  fs.appendFileSync(
    agentsFile,
    prefix + read(path.join(GUIDANCE, guidanceFile)),
  );
}

const PATCH_FILES = {
  'patch:pointer': 'pointer.md',
  'patch:existing-app': 'existing-app.md',
  'patch:directed': 'directed.md',
  'patch:host-aligned': 'host-aligned.md',
  'patch:guest-contained': 'guest-contained.md',
};

function guidanceFileFor(patch) {
  const file = PATCH_FILES[patch];
  if (!file) throw new Error(`unknown patch: ${patch}`);
  return file;
}

const PATCHES = Object.fromEntries(
  Object.entries(PATCH_FILES).map(([patch, file]) => [
    patch,
    sandboxDir => appendGuidance(sandboxDir, file),
  ]),
);

function taskPrompt(prompt, fixtureId) {
  return `You are working in an existing application.

You have no prior knowledge of this codebase or of any specific component
library or styling convention. Use only what the project and its public
documentation make available.

## Project

Treat the current working directory as the project and explore it before editing.

## Task

${prompt.prompt}

${taskContractText(prompt, fixtureId)}

## Working notes

Leave the working tree ready for review. Do not commit.

Write a short note to \`.run-notes.json\`:

{
  "summary": "<what you changed>",
  "approach": "<what you did, and why>",
  "consulted": ["<what you read or looked up before deciding>"],
  "uncertain": ["<anything you could not confirm>"],
  "workarounds": ["<anything you had to override or work around>"],
  "verified": ["<how you checked the result>" ]
}
`;
}

function gitBaseline(sandboxDir) {
  const git = commandArgs =>
    execFileSync('git', ['-C', sandboxDir, ...commandArgs], {
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'vibe-tests',
        GIT_AUTHOR_EMAIL: 'vibe-tests@example.com',
        GIT_COMMITTER_NAME: 'vibe-tests',
        GIT_COMMITTER_EMAIL: 'vibe-tests@example.com',
      },
    });
  write(
    path.join(sandboxDir, '.gitignore'),
    'node_modules/\ndist/\n.astryx-invocations.log\n.run-notes.json\n',
  );
  git(['init', '-q']);
  git(['add', '-A']);
  git(['commit', '-qm', 'baseline: app before design-system setup']);
}

const conditionsFile = JSON.parse(read(path.join(EXP_DIR, 'conditions.json')));
const promptsFile = JSON.parse(read(path.join(EXP_DIR, 'prompts.json')));
const probeConfig = JSON.parse(read(path.join(EXP_DIR, 'probes.json')));
validatePromptContracts(promptsFile.prompts, probeConfig, matrixConfig);
const conditionById = new Map(
  conditionsFile.conditions.map(condition => [condition.id, condition]),
);
const promptById = new Map(
  promptsFile.prompts.map(prompt => [prompt.id, prompt]),
);
if (promptById.size !== promptsFile.prompts.length) {
  throw new Error('prompt ids must not contain duplicates');
}
for (const prompt of promptsFile.prompts) {
  if (!prompt.kind || !prompt.contract || !Array.isArray(prompt.fixtures)) {
    throw new Error(`prompt ${prompt.id} is missing its structured contract`);
  }
}
const entries = expandSetupMatrix(matrixConfig, {
  stage,
  fixtures: list('fixtures'),
  conditions: list('conditions'),
  prompts: list('prompts'),
  bundles: list('bundles'),
  ...(requestedReps ? {reps: Number(requestedReps)} : {}),
});

for (const entry of entries) {
  if (!conditionById.has(entry.condition)) {
    throw new Error(`matrix references unknown condition ${entry.condition}`);
  }
  if (!promptById.has(entry.prompt)) {
    throw new Error(`matrix references unknown prompt ${entry.prompt}`);
  }
}

const expId = crypto.randomBytes(4).toString('hex');
const experimentRoot = path.join(outRoot, expId);
const fixtureIds = [...new Set(entries.map(entry => entry.fixture))];
const depsByFixture = new Map();
const baselines = {};

for (const fixtureId of fixtureIds) {
  const depsDir = prepareDependencies(fixtureId);
  depsByFixture.set(fixtureId, depsDir);
  const baselineDir = path.join(experimentRoot, 'baselines', fixtureId, 'app');
  createSandbox(fixtureId, baselineDir, depsDir);
  baselines[fixtureId] = artifactPath(baselineDir);
}

const runs = [];
for (const entry of entries) {
  const condition = conditionById.get(entry.condition);
  const prompt = promptById.get(entry.prompt);
  const runRoot = path.join(experimentRoot, entry.id);
  const sandboxDir = path.join(runRoot, 'app');
  createSandbox(entry.fixture, sandboxDir, depsByFixture.get(entry.fixture));
  for (const patch of condition.patches ?? []) {
    const apply = PATCHES[patch];
    if (!apply) throw new Error(`unknown patch: ${patch}`);
    apply(sandboxDir);
  }
  gitBaseline(sandboxDir);

  const task = taskPrompt(prompt, entry.fixture);
  const recipe = readRecipe(entry.fixture);
  const fixtureSha256 = fixtureManifestSha256(recipe);
  const guidanceHash = setupEnvironmentHash({
    fixtureSha256,
    condition: entry.condition,
    patches: (condition.patches ?? []).map(patch => [
      patch,
      read(path.join(GUIDANCE, guidanceFileFor(patch))),
    ]),
  });
  const provenance = createSetupProvenance({
    entry,
    taskSha256: sha256Text(task),
    fixtureSha256,
    environmentHash: guidanceHash,
  });
  const taskFile = path.join(runRoot, 'task.md');
  const provenanceFile = path.join(runRoot, `${entry.id}.provenance.json`);
  write(taskFile, task);
  write(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
  runs.push({
    ...entry,
    sandboxDir: artifactPath(sandboxDir),
    taskFile: artifactPath(taskFile),
    provenanceFile: artifactPath(provenanceFile),
  });
  console.log(`prepared ${entry.id}`);
}

const configFile = path.join(outRoot, `setup-config-${expId}.json`);
const publicMatrixFile = `setup-matrix-${expId}.json`;
assertPublicArtifactSafe(matrixConfig, {label: 'setup matrix'});
write(
  path.join(outRoot, publicMatrixFile),
  `${JSON.stringify(matrixConfig, null, 2)}\n`,
);
const publicConfig = {
  schemaVersion: 1,
  expId,
  stage,
  createdAt: new Date().toISOString(),
  matrixFile: publicMatrixFile,
  baselines,
  runs,
};
assertPublicArtifactSafe(publicConfig, {label: 'setup config'});
write(configFile, `${JSON.stringify(publicConfig, null, 2)}\n`);
console.log(`\n${runs.length} run(s) — ${path.basename(configFile)}`);
console.log(
  'No executor was launched. Supply each task and sidecar to a runner.',
);
console.log(
  'Measure each pristine fixture baseline and run with setup-measure.mjs --fixture <id>.',
);
