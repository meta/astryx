// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  expandWorkspaceDirs,
  readWorkspaceGlobs,
} from '../../../scripts/lib/workspace-globs.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

/**
 * pnpm is a .cmd (batch) file on Windows. spawnSync can only run a batch
 * file through a shell — a bare 'pnpm' fails with ENOENT (never resolved
 * through PATHEXT) and an explicit 'pnpm.cmd' fails with EINVAL (batch files
 * still require a shell even named exactly). Shelling out through cmd.exe
 * /c directly, rather than spawnSync's shell:true, avoids Node's
 * shell-argument-escaping deprecation warning (DEP0190) — every argument
 * passed through here is a hardcoded literal, never user input, so we build
 * the argv ourselves instead of asking spawnSync to build a shell string.
 */
function spawnPnpmSync(args, options) {
  return process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'pnpm', ...args], options)
    : spawnSync('pnpm', args, options);
}
export const FIXTURES_ROOT = path.join(
  REPO_ROOT,
  'internal',
  'vibe-tests',
  'fixtures',
);
export const RECIPES_ROOT = path.join(
  REPO_ROOT,
  'internal',
  'vibe-tests',
  'fixture-recipes',
);
export const FIXTURE_GALLERY_README = path.join(FIXTURES_ROOT, 'README.md');
export const FIXTURE_ASSETS_ROOT = path.join(FIXTURES_ROOT, 'assets');
export const FIXTURE_ASSET_MAX_BYTES = 250 * 1024;
export const FIXTURE_ASSETS_TOTAL_MAX_BYTES = 300 * 1024;
export const FIXTURE_IDS = [
  'tailwind-v4-control',
  'shadcn-tailwind-v4-established',
  'enterprise-scoped-synthetic',
];

const REQUIRED_PROVENANCE_FIELDS = [
  'source',
  'generator',
  'version',
  'commit',
  'license',
];

const NONDETERMINISTIC_PATTERNS = [
  ['current time', /\b(?:new\s+Date|Date\.now|performance\.now)\s*\(/],
  ['timer', /\b(?:setTimeout|setInterval)\s*\(/],
  ['random value', /\b(?:Math\.random|crypto\.randomUUID)\s*\(/],
  [
    'UUID literal',
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  ],
  [
    'network access',
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*(?:\(|\b)/,
  ],
];

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function recipePath(fixtureId, recipesRoot = RECIPES_ROOT) {
  return path.join(recipesRoot, `${fixtureId}.json`);
}

export function readRecipe(fixtureId, recipesRoot = RECIPES_ROOT) {
  return readJson(recipePath(fixtureId, recipesRoot));
}

export function validateProvenance(recipe) {
  if (recipe.schemaVersion !== 1)
    fail(`${recipe.fixture}: unsupported recipe schema`);
  if (typeof recipe.synthetic !== 'boolean')
    fail(`${recipe.fixture}: synthetic must be boolean`);
  for (const field of REQUIRED_PROVENANCE_FIELDS) {
    if (typeof recipe[field] !== 'string' || recipe[field].trim() === '') {
      fail(`${recipe.fixture}: missing provenance field ${field}`);
    }
  }
  if (!Array.isArray(recipe.commands) || recipe.commands.length === 0) {
    fail(`${recipe.fixture}: commands must be a non-empty array`);
  }
  for (const command of recipe.commands) {
    if (typeof command.command !== 'string' || !Array.isArray(command.flags)) {
      fail(
        `${recipe.fixture}: every command must record its command and flags`,
      );
    }
  }
  if (
    !Array.isArray(recipe.authoredPatches) ||
    recipe.authoredPatches.length === 0
  ) {
    fail(`${recipe.fixture}: authoredPatches must be a non-empty array`);
  }
  if (
    typeof recipe.refresh?.command !== 'string' ||
    typeof recipe.refresh?.notes !== 'string'
  ) {
    fail(`${recipe.fixture}: refresh command and notes are required`);
  }
  if (recipe.synthetic) {
    if (
      recipe.source !== 'original synthetic fixture' ||
      recipe.generator !== 'hand-authored'
    ) {
      fail(
        `${recipe.fixture}: synthetic provenance must identify original hand-authored work`,
      );
    }
  } else if (!recipe.source.startsWith('https://github.com/')) {
    fail(`${recipe.fixture}: public source must be a pinned GitHub repository`);
  }
}

export function validateDeterministicContent(relativeFile, content) {
  for (const [label, pattern] of NONDETERMINISTIC_PATTERNS) {
    if (pattern.test(content))
      fail(`${relativeFile}: fixture contains ${label}`);
  }
}

export function validatePackageJson(fixtureId, packageJson) {
  if (packageJson.private !== true)
    fail(`${fixtureId}: package must be private`);
  if (packageJson.packageManager !== 'pnpm@11.10.0') {
    fail(`${fixtureId}: packageManager must be pnpm@11.10.0`);
  }
  if (packageJson.engines?.node !== '>=24 <25') {
    fail(`${fixtureId}: Node range must be >=24 <25`);
  }
  const dependencyGroups = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ];
  for (const group of dependencyGroups) {
    for (const [name, version] of Object.entries(packageJson[group] ?? {})) {
      if (name.startsWith('@astryxdesign/') || name === 'astryx') {
        fail(`${fixtureId}: Astryx must not be preinstalled`);
      }
      if (
        typeof version !== 'string' ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
      ) {
        fail(`${fixtureId}: ${group}.${name} must use an exact version`);
      }
    }
  }
}

function validateFixtureShape(fixtureId, fixtureRoot) {
  const css = fs.readFileSync(
    path.join(fixtureRoot, 'src', 'index.css'),
    'utf8',
  );
  const app = fs.readFileSync(path.join(fixtureRoot, 'src', 'App.tsx'), 'utf8');
  const requiredProbeMarkers = {
    'tailwind-v4-control': [
      'host-shell',
      'page-title',
      'primary-action',
      'table-header',
      'table-cell',
      'status',
      'form-control',
    ],
    'shadcn-tailwind-v4-established': [
      'host-shell',
      'page-title',
      'primary-action',
      'table-header',
      'status',
      'form-control',
      'dialog-backdrop',
      'dialog-surface',
      'tooltip-trigger',
      'tooltip-surface',
      'popover-trigger',
      'popover-surface',
    ],
    'enterprise-scoped-synthetic': [
      'host-shell',
      'page-title',
      'mode-control',
      'table-header',
      'status',
      'settings-control',
      'guest-boundary',
      'guest-callout',
      'guest-callout-heading',
      'dialog-trigger',
      'dialog-backdrop',
      'dialog-surface',
      'dialog-body',
      'dialog-callout',
      'destructive-action',
      'popover-trigger',
      'popover-surface',
      'popover-menu-item',
    ],
  }[fixtureId];
  const nestedOverlayMarkers = {
    'tailwind-v4-control': [],
    'shadcn-tailwind-v4-established': [
      'dialog-backdrop',
      'dialog-surface',
      'tooltip-trigger',
      'tooltip-surface',
      'popover-trigger',
      'popover-surface',
    ],
    'enterprise-scoped-synthetic': [
      'dialog-trigger',
      'dialog-backdrop',
      'dialog-surface',
      'popover-trigger',
      'popover-surface',
    ],
  }[fixtureId];
  for (const marker of nestedOverlayMarkers) {
    if (!app.includes(`data-vibe-probe="${marker}"`)) {
      fail(`${fixtureId}: missing nested-overlay probe marker ${marker}`);
    }
  }
  const probeAttributeCount = [...app.matchAll(/\bdata-vibe-probe=/g)].length;
  if (probeAttributeCount !== requiredProbeMarkers.length) {
    fail(
      `${fixtureId}: expected ${requiredProbeMarkers.length} stable host probe markers, found ${probeAttributeCount}`,
    );
  }
  for (const marker of requiredProbeMarkers) {
    if (!app.includes(`"${marker}"`) && !app.includes(`'${marker}'`)) {
      fail(`${fixtureId}: missing stable host probe marker ${marker}`);
    }
  }

  if (fixtureId === 'tailwind-v4-control') {
    const customColors = [...css.matchAll(/--color-([\w-]+):/g)]
      .map(match => match[1])
      .sort();
    if (
      JSON.stringify(customColors) !==
      JSON.stringify(['background', 'foreground'])
    ) {
      fail(
        `${fixtureId}: control must define only background/foreground semantic colors`,
      );
    }
    if (/shadcn|components\.json/i.test(app + css)) {
      fail(`${fixtureId}: control must not contain shadcn structure`);
    }
  }

  if (fixtureId === 'shadcn-tailwind-v4-established') {
    const requiredTokens = [
      'background',
      'card',
      'popover',
      'primary',
      'secondary',
      'muted',
      'accent',
      'destructive',
      'border',
      'input',
      'ring',
    ];
    if (
      !css.includes('@theme inline') ||
      !css.includes(':root') ||
      !/(?:^|\n)\.dark\s*\{/.test(css)
    ) {
      fail(`${fixtureId}: missing Tailwind v4 light/dark theme structure`);
    }
    for (const token of requiredTokens) {
      if (!css.includes(`--color-${token}:`))
        fail(`${fixtureId}: missing ${token} semantic token`);
    }
    for (const surface of [
      '<form',
      '<table',
      'statusClasses',
      'createPortal(',
      'role="dialog"',
      'role="tooltip"',
      'role="menu"',
      'aria-modal="true"',
    ]) {
      if (!app.includes(surface))
        fail(`${fixtureId}: missing ${surface} surface`);
    }
  }

  if (fixtureId === 'enterprise-scoped-synthetic') {
    for (const token of [
      'success',
      'warning',
      'error',
      'overlay',
      'accent',
      'border',
    ]) {
      if (!css.includes(`--color-${token}:`))
        fail(`${fixtureId}: missing ${token} semantic token`);
    }
    for (const marker of [
      'data-mode={mode}',
      'data-guest-design-system',
      '<table',
      'createPortal(',
      'role="dialog"',
      'role="menu"',
      'aria-modal="true"',
    ]) {
      if (!app.includes(marker))
        fail(`${fixtureId}: missing ${marker} boundary surface`);
    }
    if (
      !css.includes("[data-mode='light']") ||
      !css.includes("[data-mode='dark']")
    ) {
      fail(`${fixtureId}: light and dark modes must be app-controlled`);
    }
  }
}

export function validateFixture({fixtureId, fixtureRoot, recipe, actualFiles}) {
  validateProvenance(recipe);
  if (recipe.fixture !== fixtureId)
    fail(`${fixtureId}: recipe fixture name does not match`);
  if (
    recipe.manifest?.algorithm !== 'sha256' ||
    typeof recipe.manifest.files !== 'object'
  ) {
    fail(`${fixtureId}: sha256 manifest is required`);
  }

  const expectedFiles = Object.keys(recipe.manifest.files).sort();
  if (expectedFiles.length === 0)
    fail(`${fixtureId}: manifest must not be empty`);
  if (actualFiles) {
    const sortedActual = [...actualFiles].sort();
    if (JSON.stringify(sortedActual) !== JSON.stringify(expectedFiles)) {
      fail(`${fixtureId}: manifest file list does not match canonical files`);
    }
  }

  for (const relativeFile of expectedFiles) {
    if (
      path.isAbsolute(relativeFile) ||
      relativeFile.split(path.sep).includes('..')
    ) {
      fail(`${fixtureId}: unsafe manifest path ${relativeFile}`);
    }
    const file = path.join(fixtureRoot, relativeFile);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      fail(`${fixtureId}: missing manifest file ${relativeFile}`);
    }
    const expectedHash = recipe.manifest.files[relativeFile];
    const actualHash = sha256File(file);
    if (actualHash !== expectedHash) {
      fail(`${fixtureId}: hash mismatch for ${relativeFile}`);
    }
    validateDeterministicContent(
      `${fixtureId}/${relativeFile}`,
      fs.readFileSync(file, 'utf8'),
    );
  }

  validatePackageJson(
    fixtureId,
    readJson(path.join(fixtureRoot, 'package.json')),
  );
  validateFixtureShape(fixtureId, fixtureRoot);
}

export function validateWorkspaceIsolation(
  workspaceGlobs,
  workspacePackages,
  fixturesRoot = FIXTURES_ROOT,
) {
  if (!workspaceGlobs.includes('!internal/vibe-tests/fixtures/**')) {
    fail('pnpm workspace must explicitly exclude canonical fixtures');
  }
  const resolvedFixtures = path.resolve(fixturesRoot);
  for (const packagePath of workspacePackages) {
    const resolvedPackage = path.resolve(packagePath);
    if (
      resolvedPackage === resolvedFixtures ||
      resolvedPackage.startsWith(`${resolvedFixtures}${path.sep}`)
    ) {
      fail(`fixture entered workspace package discovery: ${resolvedPackage}`);
    }
  }
}

export function validateTarballIsolation(fixturesRoot, packageRoots) {
  const resolvedFixtures = path.resolve(fixturesRoot);
  for (const entry of packageRoots) {
    if (entry.private) continue;
    const resolvedPackage = path.resolve(entry.path);
    if (
      resolvedFixtures === resolvedPackage ||
      resolvedFixtures.startsWith(`${resolvedPackage}${path.sep}`)
    ) {
      fail(`fixtures are inside publishable tarball root: ${resolvedPackage}`);
    }
  }
}

function gitFixtureFiles(fixtureId, repoRoot = REPO_ROOT) {
  const fixturePrefix = path.posix.join(
    'internal',
    'vibe-tests',
    'fixtures',
    fixtureId,
  );
  const result = spawnSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      fixturePrefix,
    ],
    {cwd: repoRoot, encoding: 'utf8'},
  );
  if (result.status !== 0) fail(`git ls-files failed: ${result.stderr.trim()}`);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map(file => path.posix.relative(fixturePrefix, file))
    .sort();
}

function workspacePackagePaths(repoRoot = REPO_ROOT) {
  const result = spawnPnpmSync(
    ['list', '--recursive', '--depth', '-1', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0)
    fail(
      `pnpm workspace discovery failed: ${(result.stderr ?? result.error?.message ?? '').trim()}`,
    );
  return JSON.parse(result.stdout).map(entry => entry.path);
}

function publishablePackageRoots(repoRoot = REPO_ROOT) {
  const dirs = [repoRoot, ...expandWorkspaceDirs(repoRoot)];
  return dirs.flatMap(dir => {
    const packageFile = path.join(dir, 'package.json');
    if (!fs.existsSync(packageFile)) return [];
    const packageJson = readJson(packageFile);
    return [{path: dir, private: packageJson.private === true}];
  });
}

export function validateFixtureGallery({
  readmeFile = FIXTURE_GALLERY_README,
  assetsRoot = FIXTURE_ASSETS_ROOT,
  maxAssetBytes = FIXTURE_ASSET_MAX_BYTES,
  maxTotalBytes = FIXTURE_ASSETS_TOTAL_MAX_BYTES,
} = {}) {
  if (!fs.existsSync(readmeFile)) fail('fixture gallery README is missing');
  if (!fs.existsSync(assetsRoot) || !fs.statSync(assetsRoot).isDirectory()) {
    fail('fixture gallery assets directory is missing');
  }

  const markdown = fs.readFileSync(readmeFile, 'utf8');
  const imageReferences = [
    ...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+['"][^'"]*['"])?\)/g),
  ].map(match => match[1]);
  if (imageReferences.length === 0) {
    fail('fixture gallery README must reference at least one image');
  }

  const referencedFiles = new Set();
  let totalBytes = 0;
  for (const reference of imageReferences) {
    if (
      !reference.startsWith('assets/') ||
      path.extname(reference) !== '.png'
    ) {
      fail(
        `fixture gallery image must be a relative PNG under assets/: ${reference}`,
      );
    }
    const file = path.resolve(path.dirname(readmeFile), reference);
    if (!file.startsWith(`${path.resolve(assetsRoot)}${path.sep}`)) {
      fail(`fixture gallery image escapes assets directory: ${reference}`);
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      fail(`fixture gallery image is missing: ${reference}`);
    }
    const size = fs.statSync(file).size;
    if (size > maxAssetBytes) {
      fail(
        `fixture gallery image exceeds ${maxAssetBytes} bytes: ${reference}`,
      );
    }
    totalBytes += size;
    referencedFiles.add(path.basename(file));
  }

  const assetFiles = fs
    .readdirSync(assetsRoot, {withFileTypes: true})
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .sort();
  const expectedFiles = [...referencedFiles].sort();
  if (JSON.stringify(assetFiles) !== JSON.stringify(expectedFiles)) {
    fail(
      'fixture gallery assets must all be referenced exactly once in README.md',
    );
  }
  if (totalBytes > maxTotalBytes) {
    fail(`fixture gallery assets exceed ${maxTotalBytes} bytes total`);
  }
}

export function validateCanonicalSuite(repoRoot = REPO_ROOT) {
  const fixturesRoot = path.join(
    repoRoot,
    'internal',
    'vibe-tests',
    'fixtures',
  );
  const recipesRoot = path.join(
    repoRoot,
    'internal',
    'vibe-tests',
    'fixture-recipes',
  );
  const discoveredRecipes = fs
    .readdirSync(recipesRoot, {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => entry.name.replace(/\.json$/, ''))
    .sort();
  if (
    JSON.stringify(discoveredRecipes) !==
    JSON.stringify([...FIXTURE_IDS].sort())
  ) {
    fail(
      'fixture recipe directory must contain exactly one recipe per canonical fixture',
    );
  }

  validateFixtureGallery({
    readmeFile: path.join(fixturesRoot, 'README.md'),
    assetsRoot: path.join(fixturesRoot, 'assets'),
  });

  for (const fixtureId of FIXTURE_IDS) {
    validateFixture({
      fixtureId,
      fixtureRoot: path.join(fixturesRoot, fixtureId),
      recipe: readRecipe(fixtureId, recipesRoot),
      actualFiles: gitFixtureFiles(fixtureId, repoRoot),
    });
  }

  validateWorkspaceIsolation(
    readWorkspaceGlobs(repoRoot),
    workspacePackagePaths(repoRoot),
    fixturesRoot,
  );
  validateTarballIsolation(fixturesRoot, publishablePackageRoots(repoRoot));
}

export function copyFixture(
  fixtureId,
  outputDir,
  {fixturesRoot = FIXTURES_ROOT, recipesRoot = RECIPES_ROOT} = {},
) {
  const recipe = readRecipe(fixtureId, recipesRoot);
  const sourceRoot = path.join(fixturesRoot, fixtureId);
  validateFixture({fixtureId, fixtureRoot: sourceRoot, recipe});
  if (fs.existsSync(outputDir)) fail(`sandbox already exists: ${outputDir}`);
  fs.mkdirSync(outputDir, {recursive: true});
  for (const relativeFile of Object.keys(recipe.manifest.files)) {
    const target = path.join(outputDir, relativeFile);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(sourceRoot, relativeFile), target);
  }
  validateFixture({fixtureId, fixtureRoot: outputDir, recipe});
  return outputDir;
}

export function refreshManifest(
  fixtureId,
  {fixturesRoot = FIXTURES_ROOT, recipesRoot = RECIPES_ROOT} = {},
) {
  const file = recipePath(fixtureId, recipesRoot);
  const recipe = readJson(file);
  validateProvenance(recipe);
  const fixtureRoot = path.join(fixturesRoot, fixtureId);
  for (const relativeFile of Object.keys(recipe.manifest.files)) {
    const manifestFile = path.join(fixtureRoot, relativeFile);
    if (!fs.existsSync(manifestFile))
      fail(`${fixtureId}: missing manifest file ${relativeFile}`);
    recipe.manifest.files[relativeFile] = sha256File(manifestFile);
  }
  fs.writeFileSync(file, `${JSON.stringify(recipe, null, 2)}\n`);
}

function runPnpm(args, cwd) {
  const result = spawnPnpmSync(args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status !== 0) {
    fail(
      `pnpm ${args.join(' ')} failed in ${cwd}\n${result.stdout ?? ''}${result.stderr ?? result.error?.message ?? ''}`,
    );
  }
  return `${result.stdout}${result.stderr}`.trim();
}

export function buildFixture(fixtureId) {
  const sandboxParent = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-fixture-'),
  );
  const sandbox = path.join(sandboxParent, fixtureId);
  try {
    copyFixture(fixtureId, sandbox);
    const installOutput = runPnpm(
      ['install', '--frozen-lockfile', '--ignore-scripts'],
      sandbox,
    );
    const typecheckOutput = runPnpm(['typecheck'], sandbox);
    const buildOutput = runPnpm(['build'], sandbox);
    return {fixtureId, installOutput, typecheckOutput, buildOutput};
  } finally {
    fs.rmSync(sandboxParent, {recursive: true, force: true});
  }
}
