// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The active hosted run (architecture:cli-surface INV30, spec AST-081
 * FR1): the package sets, approved integrations, and discover sources a host
 * passed through `@astryxdesign/cli/host`, the root that holds the copy that
 * started the run, and the packages the run resolved.
 *
 * Only the host entry activates a hosted run, once per process. With none
 * active, every lookup that consults it behaves as it does without a host.
 *
 * @input What the host entry passes to `activateHostedRun`.
 * @output `hostedRun()` for the lookups that consult it; the resolved-package
 *   record the host entry returns.
 * @position foundation/runtime — read by the release choice, Core lookups,
 *   computer-level integrations, and discover; written by host/index.mjs.
 */

import * as fs from 'node:fs';
import {relativeWithin, samePath} from '../fs/path-compare.mjs';

/**
 * @typedef {object} HostedRun
 * @property {readonly string[]} roots the host's package sets, in its order
 * @property {readonly string[]} integrations the integrations it approves for
 *   use outside a project
 * @property {readonly Function[]} discoverSources its own discover sources
 * @property {string | null} startingRoot the root that holds the copy that
 *   started the run
 * @property {string | null} projectRoot the project the run works in, if any
 * @property {((hostEntry: string) => Promise<(options: object) => Promise<{status: number, packages: Array<{name: string, version: string | null, source: 'project' | 'package-set'}>}>>) | null} loadHostEntry
 *   loads another release's host entry, from one of the package sets, to hand
 *   this run over to in this process
 */

/** @type {HostedRun | null} */
let active = null;

/** @type {Map<string, {name: string, version: string | null, dir: string | null, source: 'project' | 'package-set' | undefined}>} */
const resolved = new Map();

/**
 * @param {string} p
 * @returns {string}
 */
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Start the hosted run of this process.
 * @param {{roots?: readonly string[], integrations?: readonly string[], discoverSources?: readonly Function[], startingRoot?: string | null, projectRoot?: string | null, loadHostEntry?: HostedRun['loadHostEntry']}} inputs
 * @returns {HostedRun}
 */
export function activateHostedRun({
  roots = [],
  integrations = [],
  discoverSources = [],
  startingRoot = null,
  projectRoot = null,
  loadHostEntry = null,
}) {
  if (active)
    throw new Error('A hosted run is already active in this process.');
  active = Object.freeze({
    roots: Object.freeze([...roots]),
    integrations: Object.freeze([...integrations]),
    discoverSources: Object.freeze([...discoverSources]),
    startingRoot,
    projectRoot,
    loadHostEntry,
  });
  return active;
}

/**
 * The hosted run of this process, or null when no host started it.
 * @returns {HostedRun | null}
 */
export function hostedRun() {
  return active;
}

/**
 * Note one package the run resolved. The first record of a name stands. Does
 * nothing outside a hosted run.
 * @param {string} name
 * @param {unknown} version
 * @param {string | null | undefined} dir
 * @param {'project' | 'package-set'} [source] where it came from, when the
 *   caller knows; otherwise the folder that holds `dir` says
 */
export function recordResolved(name, version, dir, source) {
  if (!active || typeof name !== 'string' || resolved.has(name)) return;
  resolved.set(name, {
    name,
    version: typeof version === 'string' ? version : null,
    dir: dir ?? null,
    source,
  });
}

/**
 * Note every integration a project load resolved: one installed for the
 * computer, an approved one included, comes from a package set; any other,
 * from the project.
 * @param {ReadonlyArray<{name: string, version?: string, __packageDir?: string, __computer?: boolean}>} integrations
 */
export function recordResolvedIntegrations(integrations) {
  if (!active) return;
  for (const integration of integrations) {
    recordResolved(
      integration.name,
      integration.version,
      integration.__packageDir,
      integration.__computer ? 'package-set' : 'project',
    );
  }
}

/**
 * Where a package in `dir` came from: the deepest of the project and the
 * package sets (the root that holds the starting copy, and the roots the host
 * passed) that holds it. A root that is the project itself, as when the
 * host's CLI is installed in the project, counts as the project.
 * @param {string | null} dir
 * @returns {'project' | 'package-set'}
 */
function sourceOf(dir) {
  if (!active || !dir) return 'project';
  const target = real(dir);
  /** @type {Array<{base: string, source: 'project' | 'package-set'}>} */
  const holders = [];
  if (active.projectRoot) {
    holders.push({base: real(active.projectRoot), source: 'project'});
  }
  for (const root of [active.startingRoot, ...active.roots]) {
    if (root) holders.push({base: real(root), source: 'package-set'});
  }
  /** @type {{base: string, source: 'project' | 'package-set'} | null} */
  let best = null;
  for (const holder of holders) {
    const holds =
      samePath(holder.base, target) ||
      relativeWithin(holder.base, target) != null;
    // The project comes first, so it keeps a tie with a root that is itself.
    if (holds && (!best || holder.base.length > best.base.length))
      best = holder;
  }
  return best ? best.source : 'project';
}

/**
 * Each package the run resolved: its name, version, and whether it came from
 * the project or a package set (INV30).
 * @returns {Array<{name: string, version: string | null, source: 'project' | 'package-set'}>}
 */
export function resolvedPackages() {
  return [...resolved.values()].map(({name, version, dir, source}) => ({
    name,
    version,
    source: source ?? sourceOf(dir),
  }));
}

/** Forget the hosted run. Tests only. */
export function _resetHostedRun() {
  active = null;
  resolved.clear();
}
