// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Which base a run reads, and which integrations build on it.
 * @input the requested `--base`, the project's loaded integrations, and
 *   whether the project installs Core
 * @output the run's base resolution, and the integrations that contribute
 *   to it
 * @position foundation/bases — read by Project.load, the requirement check,
 *   help, the manifest, and `meta.answeredBy`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {ERROR_CODES} from '../response/error-codes.mjs';
import {installedProjectCoreDir} from '../fs/paths.mjs';
import {resolveInstalledPackageDir} from '../integrations/installed-package.mjs';
import {CORE_BASE_NAME, coreBase} from './core.mjs';
import {BASE_CAPABILITIES} from './steps.mjs';
import {registerRunBaseResolver} from './state.mjs';

/**
 * The one base a run reads.
 * @typedef {object} ActiveBase
 * @property {string} name the package name
 * @property {boolean} core true for Core
 * @property {string | null} dir the package folder; null for Core, whose
 *   steps the CLI performs itself
 * @property {string | null} version the package version, when known
 * @property {Record<string, string>} adapters capability to module path,
 *   relative to `dir`, for the capabilities this CLI knows
 * @property {readonly string[]} steps the steps the base serves
 */

/**
 * @typedef {{ok: true, base: ActiveBase}
 *   | {ok: false, code: string, message: string, base: null}} BaseResolution
 */

/** @typedef {import('../integrations/integrations.mjs').LoadedIntegration} LoadedIntegration */

/** @type {string | null} */
let requested = null;

/**
 * Set the package `--base` names for this run; null when it names none.
 * @param {string | null | undefined} name
 */
export function setRequestedBase(name) {
  requested = typeof name === 'string' && name.length > 0 ? name : null;
}

/** @returns {string | null} */
export function requestedBase() {
  return requested;
}

/**
 * The value of `--base` in a run's arguments, read before Commander parses
 * so a project loaded that early reads the same base the run checks.
 * Arguments after `--` are operands and never name a base.
 * @param {string[]} argv the arguments after `astryx`
 * @returns {string | null}
 */
export function requestedBaseFromArgv(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') return null;
    if (arg === '--base') return argv[i + 1] ?? null;
    if (arg.startsWith('--base=')) return arg.slice('--base='.length);
  }
  return null;
}

/** @type {Map<string, LoadedIntegration[]>} */
const candidatesByDir = new Map();

/**
 * Keep the integrations a project load found, before the base filter, so
 * the requirement check and help resolve the base without loading the
 * project again.
 * @param {string} cwd
 * @param {LoadedIntegration[]} integrations
 */
export function recordBaseCandidates(cwd, integrations) {
  candidatesByDir.set(path.resolve(cwd), integrations);
}

/** Forget every recorded project. For tests. */
export function _resetBases() {
  candidatesByDir.clear();
  requested = null;
}

/**
 * The base the run in `cwd` reads, from the integrations its last project
 * load found, or from none when no project loaded there.
 * @param {string} [cwd]
 * @returns {BaseResolution}
 */
export function runBase(cwd = process.cwd()) {
  return resolveBase({
    cwd,
    integrations: candidatesByDir.get(path.resolve(cwd)) ?? [],
    requested,
  });
}

/**
 * Does this loaded integration declare `base`?
 * @param {LoadedIntegration} integration
 * @returns {boolean}
 */
export function isBaseIntegration(integration) {
  return integration.base != null && integration.__loadError == null;
}

/**
 * A base integration as the run's base.
 * @param {LoadedIntegration} integration
 * @returns {ActiveBase}
 */
export function baseOf(integration) {
  /** @type {Record<string, string>} */
  const adapters = {};
  for (const [capability, file] of Object.entries(
    integration.base?.adapters ?? {},
  )) {
    if (
      /** @type {readonly string[]} */ (BASE_CAPABILITIES).includes(capability)
    ) {
      adapters[capability] = file;
    }
  }
  return {
    name: integration.name,
    core: false,
    dir: integration.__packageDir,
    version: integration.version ?? null,
    adapters,
    // No command calls an adapter step, so a base other than Core serves no
    // step, whatever its adapters declare. Help hides each command that needs
    // one, and a run refuses it.
    steps: [],
  };
}

/**
 * The bases an integration builds on: each base its package.json lists in
 * `peerDependencies`; with none, a base builds on no base and any other
 * integration builds on Core.
 * @param {LoadedIntegration} integration
 * @param {ReadonlySet<string>} baseNames every base the run knows, Core
 *   included
 * @returns {string[]}
 */
export function buildsOn(integration, baseNames) {
  let peers = {};
  try {
    peers =
      JSON.parse(
        fs.readFileSync(
          path.join(integration.__packageDir, 'package.json'),
          'utf8',
        ),
      ).peerDependencies ?? {};
  } catch {
    // A package.json that cannot be read lists no peers.
  }
  const on = Object.keys(peers).filter(
    name => baseNames.has(name) && name !== integration.name,
  );
  if (on.length > 0) return on;
  // A base that lists no other base builds on none: it contributes only to a
  // run on itself.
  return isBaseIntegration(integration) ? [] : [CORE_BASE_NAME];
}

/**
 * @param {ActiveBase} base
 * @returns {BaseResolution}
 */
function found(base) {
  return {ok: true, base};
}

/**
 * @param {string} code
 * @param {string} message
 * @returns {BaseResolution}
 */
function failed(code, message) {
  return {ok: false, code, message, base: null};
}

/**
 * @param {string[]} names
 * @returns {BaseResolution}
 */
function ambiguous(names) {
  return failed(
    ERROR_CODES.ERR_BASE_AMBIGUOUS,
    `This project installs more than one base and no Core: ${names.join(', ')}. Pick one with ${names.map(name => `--base ${name}`).join(' or ')}.`,
  );
}

/**
 * Resolve the run's base: `--base`, then the base an integration package
 * builds on, then the project's Core, then the project's one installed
 * base, then Core.
 * @param {{
 *   cwd: string,
 *   integrations: LoadedIntegration[],
 *   requested?: string | null,
 *   projectHasCore?: () => boolean,
 * }} input
 * @returns {BaseResolution}
 */
export function resolveBase({
  cwd,
  integrations,
  requested: name = null,
  projectHasCore = () => installedProjectCoreDir(cwd) != null,
}) {
  const bases = integrations.filter(isBaseIntegration);
  if (name != null) {
    if (name === CORE_BASE_NAME) return found(coreBase());
    const hit = bases.find(integration => integration.name === name);
    if (hit) return found(baseOf(hit));
    const installed = resolveInstalledPackageDir(name, cwd) != null;
    return failed(
      ERROR_CODES.ERR_BASE_NOT_FOUND,
      installed
        ? `--base ${name}: the package is installed, but its integration manifest does not declare base.`
        : `--base ${name}: the package is not installed in this project, in the package set that serves this run, or for this computer.`,
    );
  }
  // With no base declared anywhere, Core answers, as it always has, and
  // nothing more is read.
  if (bases.length === 0) return found(coreBase());

  const baseNames = new Set([CORE_BASE_NAME, ...bases.map(b => b.name)]);
  const local = integrations.find(
    integration => integration.__local && integration.__loadError == null,
  );
  if (local) {
    if (isBaseIntegration(local)) return found(baseOf(local));
    const on = buildsOn(local, baseNames);
    if (on.includes(CORE_BASE_NAME)) return found(coreBase());
    if (on.length === 1) {
      const hit = bases.find(integration => integration.name === on[0]);
      if (hit) return found(baseOf(hit));
    }
    if (on.length > 1) return ambiguous(on);
  }
  if (projectHasCore()) return found(coreBase());
  const projectBases = bases.filter(integration => !integration.__computer);
  if (projectBases.length === 1) return found(baseOf(projectBases[0]));
  if (projectBases.length > 1) {
    return ambiguous(projectBases.map(integration => integration.name));
  }
  return found(coreBase());
}

/**
 * Split the loaded integrations into the ones that contribute to a run on
 * `base` and the ones left out: an integration contributes when it is that
 * base or builds on it. With no base declared anywhere, every integration
 * builds on Core and none is left out.
 * @param {LoadedIntegration[]} integrations
 * @param {ActiveBase} base
 * @returns {{kept: LoadedIntegration[], leftOut: Array<{integration: LoadedIntegration, buildsOn: string[]}>}}
 */
export function splitForBase(integrations, base) {
  const bases = integrations.filter(isBaseIntegration);
  if (bases.length === 0 && base.core) return {kept: integrations, leftOut: []};
  const baseNames = new Set([CORE_BASE_NAME, ...bases.map(b => b.name)]);
  /** @type {LoadedIntegration[]} */
  const kept = [];
  /** @type {Array<{integration: LoadedIntegration, buildsOn: string[]}>} */
  const leftOut = [];
  for (const integration of integrations) {
    if (integration.name === base.name) {
      kept.push(integration);
      continue;
    }
    const on = buildsOn(integration, baseNames);
    if (on.includes(base.name)) kept.push(integration);
    else leftOut.push({integration, buildsOn: on});
  }
  return {kept, leftOut};
}

registerRunBaseResolver(() => runBase());
