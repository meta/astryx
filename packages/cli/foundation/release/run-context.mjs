// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Who answered this run: the record behind `meta.answeredBy` and the
 * Core a copy carries for use outside a project (spec AST-081 FR3, FR5).
 *
 * The bin records the choice it made (handoff.mjs) before any command runs.
 * A caller that drives the CLI in-process, such as the test harness or the
 * programmatic API, never went through the bin, so the choice is made here on
 * first use from the working folder, without asking the registry.
 *
 * @input  the bin's choice, or the working folder
 * @output `{cli, core, copy}`; the carried Core's folder
 * @position foundation/release — read by jsonOut and by the Core lookups of
 *   commands that answer from Core outside a project.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chooseRelease, isComputerLevel, runningCopy} from './choose.mjs';
import {progressLine} from './handoff.mjs';
import {isJsonMode} from '../response/json.mjs';
import {cachedRelease, ensureRelease, userCacheDir} from './cache.mjs';
import {readJson, findReadCore, CORE_PACKAGE_NAME} from './project.mjs';
import {hostedRun} from '../runtime/package-root.mjs';

/** The running CLI package's folder. */
const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/** @type {import('./choose.mjs').ReleaseChoice | null} */
let recorded = null;
/** @type {string | null} */
let recordedFor = null;

/**
 * Record the bin's choice for this process.
 * @param {import('./choose.mjs').ReleaseChoice} choice
 */
export function recordRunChoice(choice) {
  recorded = choice;
  recordedFor = process.cwd();
}

/**
 * The choice that applies to `cwd`: the bin's, else one made now.
 * @param {string} [cwd]
 * @returns {import('./choose.mjs').ReleaseChoice}
 */
export function runChoice(cwd = process.cwd()) {
  if (recorded && recordedFor === path.resolve(cwd)) return recorded;
  try {
    const self = runningCopy(CLI_ROOT);
    const choice = chooseRelease({
      cwd,
      self,
      resolve: () => null,
      computer: isComputerLevel(process.argv.slice(2)),
    });
    if (choice.answer === 'self') return choice;
    // Driven in-process (the programmatic API, a test harness), nothing hands
    // the run off: this copy answers, as the copy that started the run.
    return {
      ...choice,
      copy: choice.inProject ? 'starting' : 'carried',
      answer: 'self',
      version: self.version,
      bin: null,
      unavailable: null,
    };
  } catch {
    return {
      copy: 'carried',
      answer: 'self',
      version: runningCopy(CLI_ROOT).version,
      bin: null,
      coreVersion: null,
      inProject: false,
      unavailable: null,
    };
  }
}

/** The running CLI's version. */
export function cliVersion() {
  return runningCopy(CLI_ROOT).version;
}

/**
 * The Core a copy carries: the `@astryxdesign/core` of its own release, beside
 * the CLI package (a release in the cache, or a package runner that fetched
 * both), else the cached release of the same version. With `fetch`, a copy
 * that carries none installs its release into the cache first.
 *
 * @param {{fetch?: boolean, cacheDir?: string}} [options]
 * @returns {{dir: string | null, unavailable: string | null, version?: string, reason?: string}}
 */
export function carriedCore(options = {}) {
  const {fetch = false, cacheDir = userCacheDir()} = options;
  const version = cliVersion();
  const beside = path.resolve(CLI_ROOT, '..', 'core');
  const besidePkg = readJson(path.join(beside, 'package.json'));
  if (besidePkg?.name === CORE_PACKAGE_NAME && besidePkg.version === version) {
    return {dir: beside, unavailable: null};
  }
  // A hosted run resolves from its package set alone and installs nothing
  // (architecture:cli-surface INV30): the Core beside the CLI, or none.
  if (hostedRun()) {
    if (!fetch) return {dir: null, unavailable: null};
    const reason =
      "a hosted run installs nothing, and the host's package set holds no Core beside its CLI";
    return {
      dir: null,
      unavailable: `Core ${version} could not be found: ${reason}`,
      version,
      reason,
    };
  }
  const cached = cachedRelease(version, cacheDir);
  if (cached) return {dir: cached.coreDir, unavailable: null};
  if (!fetch) return {dir: null, unavailable: null};
  const json = isJsonMode() || process.argv.includes('--json');
  const release = ensureRelease(version, {
    cacheDir,
    onProgress: json ? undefined : progressLine,
  });
  return 'coreDir' in release
    ? {dir: release.coreDir, unavailable: null}
    : {
        dir: null,
        unavailable: `Core ${version} could not be installed: ${release.reason}`,
        version,
        reason: release.reason,
      };
}

/**
 * `meta.answeredBy` for this run: the answering CLI's version, the Core the
 * run pairs with (`null` when there is none), and which copy answered.
 * @param {string} [cwd]
 * @returns {{cli: string, core: string | null, copy: 'project' | 'starting' | 'matched' | 'carried' | 'fallback'}}
 */
export function answeredBy(cwd = process.cwd()) {
  const choice = runChoice(cwd);
  const read = findReadCore(cwd);
  let core = read ? read.version : null;
  if (!core && choice.copy !== 'project') {
    const carried = carriedCore();
    core = carried.dir
      ? (readJson(path.join(carried.dir, 'package.json'))?.version ?? null)
      : null;
  }
  return {cli: cliVersion(), core, copy: choice.copy};
}

/** Exported for tests: forget the recorded choice. */
export function _resetRunChoice() {
  recorded = null;
  recordedFor = null;
}
