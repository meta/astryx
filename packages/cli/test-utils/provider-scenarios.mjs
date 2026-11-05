// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Seeded provider-resolution scenarios for property tests.
 *
 * @input A seed.
 * @output A scenario description (installed packages, config, declared
 *   dependencies, the package being authored, `--integration` extras), a
 *   writer that lays it out on disk, and the candidate inputs a correct ledger
 *   must account for — derived from the description, never from the resolver.
 * @position test-utils — shared by the provider ledger property tests.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Package names in the pool. Small on purpose, so claims collide often. */
const POOL = ['@acme/a', '@acme/b', '@acme/c'];
/** Install directories that hold a package under another key. */
const ALIASES = ['@acme/alias-1', '@acme/alias-2'];
const VERSIONS = ['1.0.0', '2.0.0'];
const FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * @typedef {'ok' | 'throws' | 'none' | 'two'} ManifestShape
 *   `throws`: fails on import; `none`: no root manifest; `two`: two root
 *   manifests
 */

/**
 * @typedef {object} ScenarioPackage
 * @property {string} dir the node_modules key it is installed under
 * @property {string} name its package.json name
 * @property {string} [version]
 * @property {string} [providerId] its manifest providerId
 * @property {ManifestShape} manifest
 * @property {string} [linkTo] installed as a symlink to this other key's
 *   directory, the way pnpm links one store entry under two keys
 */

/**
 * @typedef {object} Scenario
 * @property {number} seed
 * @property {ScenarioPackage[]} packages
 * @property {string[] | null} config integrations; null means no config file
 * @property {Array<{name: string, field: string}>} dependencies
 * @property {{name: string, version: string, providerId?: string, manifest: 'ok' | 'throws'} | null} local
 *   the package being authored; null means the project has no manifest
 * @property {string[]} extras `upgrade --integration` specs
 */

/**
 * A small deterministic PRNG (mulberry32).
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} items
 * @returns {T}
 */
function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/**
 * A random subset in random order.
 * @template T
 * @param {() => number} random
 * @param {readonly T[]} items
 * @param {number} chance
 * @returns {T[]}
 */
function subset(random, items, chance) {
  const chosen = items.filter(() => random() < chance);
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

/**
 * Generate one scenario. Every scenario loads without a hard error: configured
 * specs and extras are installed with one root manifest, and a package that
 * lists itself has an installed copy.
 * @param {number} seed
 * @returns {Scenario}
 */
export function generateScenario(seed) {
  const random = prng(seed);
  /** @type {ScenarioPackage[]} */
  const packages = [];

  for (const name of POOL) {
    if (random() < 0.2) continue;
    const roll = random();
    packages.push({
      dir: name,
      name,
      version: random() < 0.1 ? undefined : pick(random, VERSIONS),
      providerId: random() < 0.35 ? pick(random, POOL) : undefined,
      manifest:
        roll < 0.08
          ? 'throws'
          : roll < 0.13
            ? 'none'
            : roll < 0.17
              ? 'two'
              : 'ok',
    });
  }
  for (const dir of ALIASES) {
    const roll = random();
    if (roll < 0.35) continue;
    const linkable = packages.filter(pkg => !pkg.linkTo);
    if (roll < 0.6 && linkable.length > 0) {
      const target = pick(random, linkable);
      packages.push({...target, dir, linkTo: target.dir});
      continue;
    }
    // An npm alias installed as a copy: often the same name and version as a
    // pool package, sometimes another version of it.
    const twin =
      packages.length > 0 && random() < 0.6 ? pick(random, packages) : null;
    packages.push({
      dir,
      name: twin?.name ?? pick(random, POOL),
      version:
        twin != null && random() < 0.7 ? twin.version : pick(random, VERSIONS),
      providerId: twin != null && random() < 0.7 ? twin.providerId : undefined,
      manifest: random() < 0.08 ? 'throws' : 'ok',
    });
  }

  const loadable = packages.filter(
    pkg => pkg.manifest === 'ok' || pkg.manifest === 'throws',
  );
  const local =
    random() < 0.55
      ? {
          name: random() < 0.7 ? pick(random, POOL) : '@acme/self',
          version: '3.0.0-dev',
          ...(random() < 0.45
            ? {providerId: pick(random, [...POOL, '@acme/next'])}
            : {}),
          manifest: /** @type {'ok' | 'throws'} */ (
            random() < 0.1 ? 'throws' : 'ok'
          ),
        }
      : null;

  const config =
    random() < 0.2
      ? null
      : subset(
          random,
          loadable.map(pkg => pkg.dir),
          0.45,
        );
  const dependencies = subset(
    random,
    packages.map(pkg => pkg.dir),
    0.5,
  ).map(name => ({name, field: pick(random, FIELDS)}));
  const extras = subset(
    random,
    loadable.map(pkg => pkg.dir),
    0.25,
  );

  return {seed, packages, config, dependencies, local, extras};
}

/**
 * @param {ScenarioPackage | {providerId?: string, manifest: ManifestShape}} pkg
 * @returns {string}
 */
function manifestSource(pkg) {
  if (pkg.manifest === 'throws') return "throw new Error('broken manifest');\n";
  return `export default ${JSON.stringify(
    pkg.providerId == null ? {} : {providerId: pkg.providerId},
  )};\n`;
}

/**
 * Lay a scenario out under `projectDir`.
 * @param {string} projectDir
 * @param {Scenario} scenario
 */
export function writeScenario(projectDir, scenario) {
  const modules = path.join(projectDir, 'node_modules');
  for (const pkg of scenario.packages.filter(entry => !entry.linkTo)) {
    const dir = path.join(modules, ...pkg.dir.split('/'));
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: pkg.name, version: pkg.version}),
    );
    if (pkg.manifest === 'none') continue;
    fs.writeFileSync(
      path.join(dir, 'astryx.integration.mjs'),
      manifestSource(pkg),
    );
    if (pkg.manifest === 'two') {
      fs.writeFileSync(
        path.join(dir, 'astryx.integration.js'),
        manifestSource(pkg),
      );
    }
  }
  for (const pkg of scenario.packages.filter(entry => entry.linkTo)) {
    const link = path.join(modules, ...pkg.dir.split('/'));
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(
      path.join(modules, .../** @type {string} */ (pkg.linkTo).split('/')),
      link,
      'dir',
    );
  }

  /** @type {Record<string, Record<string, string>>} */
  const declared = {};
  for (const {name, field} of scenario.dependencies) {
    declared[field] = {...declared[field], [name]: '*'};
  }
  const {local} = scenario;
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify({
      name: local?.name ?? 'consumer',
      ...(local ? {version: local.version} : {}),
      ...declared,
    }),
  );
  if (local) {
    fs.writeFileSync(
      path.join(projectDir, 'astryx.integration.mjs'),
      manifestSource(local),
    );
  }
  if (scenario.config) {
    fs.writeFileSync(
      path.join(projectDir, 'astryx.config.mjs'),
      `export default ${JSON.stringify({integrations: scenario.config})};\n`,
    );
  }
}

/**
 * A scenario is runnable when nothing in it is a hard load error: the package
 * being authored, when it lists itself, has an installed copy with one root
 * manifest.
 * @param {Scenario} scenario
 * @returns {boolean}
 */
export function isRunnable(scenario) {
  const {local, config} = scenario;
  if (local == null || config == null || !config.includes(local.name)) {
    return true;
  }
  const installed = scenario.packages.find(pkg => pkg.dir === local.name);
  return (
    installed != null &&
    (installed.manifest === 'ok' || installed.manifest === 'throws')
  );
}

/**
 * The inputs a Project ledger must account for, from the scenario alone: each
 * configured spec, each declared dependency installed with exactly one root
 * manifest, and the package being authored.
 * @param {string} projectDir
 * @param {Scenario} scenario
 * @returns {Array<{source: string, spec: string, key: string}>}
 */
export function expectedProjectInputs(projectDir, scenario) {
  const modules = path.join(projectDir, 'node_modules');
  /** @param {string} dir */
  const keyOf = dir => fs.realpathSync(path.join(modules, ...dir.split('/')));
  /** @param {string} dir */
  const packageOf = dir => {
    const pkg = scenario.packages.find(entry => entry.dir === dir);
    const target = pkg?.linkTo
      ? scenario.packages.find(entry => entry.dir === pkg.linkTo)
      : pkg;
    return target;
  };
  /** @type {Array<{source: string, spec: string, key: string}>} */
  const inputs = [];
  for (const spec of new Set(scenario.config ?? [])) {
    inputs.push({source: 'configured', spec, key: keyOf(spec)});
  }
  const seen = new Set();
  for (const {name} of scenario.dependencies) {
    if (seen.has(name)) continue;
    seen.add(name);
    const pkg = packageOf(name);
    if (pkg == null || pkg.manifest === 'none' || pkg.manifest === 'two')
      continue;
    inputs.push({source: 'autolinked', spec: name, key: keyOf(name)});
  }
  if (scenario.local) {
    inputs.push({
      source: 'local',
      spec: scenario.local.name,
      key: fs.realpathSync(projectDir),
    });
  }
  return inputs;
}
