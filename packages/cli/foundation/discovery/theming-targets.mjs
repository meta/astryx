// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The one enumeration of component theming targets.
 *
 * @input  a core `src` directory
 * @output every `theming.targets` entry authored in a component `.doc.mjs`,
 *         flattened into the `defineTheme` component key a theme author writes
 * @position packages/cli/foundation/discovery — shared by `theme targets` (the
 *           listing) and `theme build` (override validation). Both read the
 *           component docs, which are the source of truth `astryx component
 *           <Name>` prints; nothing here is a second registry, so the list a
 *           theme author can enumerate and the set the compiler accepts cannot
 *           drift from the components or from each other.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {loadComponentDoc} from './component-loader.mjs';

const SKIP_DIRS = new Set(['node_modules', '__tests__']);

/**
 * One theming target, as a theme author has to write it.
 * @typedef {object} ThemingTarget
 * @property {string} key - the `defineTheme` `components` key (class minus the `astryx-` prefix)
 * @property {string} className - the stable class the component renders
 * @property {string} component - the component whose doc declares it
 * @property {string[]} props - visual props the target reflects (`variant:value` keys)
 * @property {string[]} states - runtime states the target reflects (bare-name keys)
 */

/**
 * Strip the namespace prefix to get the `defineTheme` key for a class name.
 *
 * Keep the `astryx-` literal in sync with packages/core/src/naming.ts
 * (NAMESPACE / classPrefix), the same way component-format.mjs does.
 * <!-- SYNC: packages/core/src/naming.ts (namespace prefix source of truth) -->
 * @param {string} className
 * @returns {string}
 */
function targetKey(className) {
  return className.replace(/^astryx-/, '');
}

/**
 * Every theming target declared under a core `src` directory, sorted by key
 * then component. When both a parent doc and one of its `subComponentOf`
 * children declare the same class, the parent is the canonical discovery owner;
 * the child keeps its direct docs but does not add a second listing row. Shared
 * targets declared by unrelated components remain separate rows.
 *
 * Unreadable docs are skipped rather than fatal — a single malformed doc must
 * not take out theme validation or the listing.
 *
 * @param {string} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<ThemingTarget[]>}
 */
export async function collectThemingTargets(coreSrc) {
  if (!coreSrc || !fs.existsSync(coreSrc)) return [];

  /** @type {Array<ThemingTarget & {parent: string|null}>} */
  const targets = [];

  /** @param {string} dir */
  async function scan(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await scan(full);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;

      /** @type {any} */
      let doc;
      try {
        doc = await loadComponentDoc(full);
      } catch {
        continue;
      }

      const component =
        typeof doc?.name === 'string' && doc.name
          ? doc.name
          : path.basename(path.dirname(full));

      for (const target of doc?.theming?.targets || []) {
        const className = target?.className;
        if (typeof className !== 'string') continue;
        const key = targetKey(className);
        if (!key) continue;
        targets.push({
          key,
          className,
          component,
          parent:
            typeof doc?.subComponentOf === 'string' ? doc.subComponentOf : null,
          props: stringList(target.visualProps),
          states: stringList(target.states),
        });
      }
    }
  }

  await scan(coreSrc);

  const canonical = canonicalizeParentTargets(targets);
  canonical.sort(
    (a, b) =>
      a.key.localeCompare(b.key) || a.component.localeCompare(b.component),
  );
  return canonical;
}

/**
 * Collapse only an explicit parent/child duplicate. A child target is removed
 * when its `subComponentOf` parent declares that same class exactly once; its
 * props and states are merged into the parent's row so no capability is lost.
 *
 * Unrelated components sharing a class remain separate. An ambiguous parent
 * declaration also remains untouched rather than guessing which row is
 * canonical.
 *
 * @param {Array<ThemingTarget & {parent: string|null}>} targets
 * @returns {ThemingTarget[]}
 */
function canonicalizeParentTargets(targets) {
  /** @type {Map<string, Array<ThemingTarget & {parent: string|null}>>} */
  const rootsByComponentAndClass = new Map();
  for (const target of targets) {
    if (target.parent != null) continue;
    const identity = `${target.component}\0${target.className}`;
    const roots = rootsByComponentAndClass.get(identity) ?? [];
    roots.push(target);
    rootsByComponentAndClass.set(identity, roots);
  }

  /** @type {Set<ThemingTarget & {parent: string|null}>} */
  const duplicates = new Set();
  for (const target of targets) {
    if (target.parent == null) continue;
    const roots =
      rootsByComponentAndClass.get(`${target.parent}\0${target.className}`) ??
      [];
    if (roots.length !== 1) continue;

    const canonical = roots[0];
    canonical.props = [...new Set([...canonical.props, ...target.props])];
    canonical.states = [...new Set([...canonical.states, ...target.states])];
    duplicates.add(target);
  }

  return targets
    .filter(target => !duplicates.has(target))
    .map(({parent: _parent, ...target}) => target);
}

/**
 * One public custom property a theme may set on a component's target.
 * @typedef {object} ThemingVar
 * @property {string} name - the custom property, e.g. `--tree-list-indent`
 * @property {string} component - the component whose doc declares it
 * @property {string} dir - absolute path to the directory the doc lives in
 * @property {string} default - the documented default value
 */

/**
 * Every PUBLIC theming var declared under a core `src` directory, sorted by
 * name. Private `--_*` vars are a component's own plumbing, not a theme's to
 * set, so they are not enumerated here.
 *
 * @param {string} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<ThemingVar[]>}
 */
export async function collectThemingVars(coreSrc) {
  if (!coreSrc || !fs.existsSync(coreSrc)) return [];

  /** @type {Map<string, ThemingVar>} */
  const vars = new Map();

  /** @param {string} dir */
  async function scan(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await scan(full);
        continue;
      }
      if (!entry.name.endsWith('.doc.mjs')) continue;

      /** @type {any} */
      let doc;
      try {
        doc = await loadComponentDoc(full);
      } catch {
        continue;
      }

      const component =
        typeof doc?.name === 'string' && doc.name
          ? doc.name
          : path.basename(path.dirname(full));

      for (const entryVar of doc?.theming?.vars || []) {
        const name = entryVar?.name;
        if (typeof name !== 'string') continue;
        if (entryVar.private === true || name.startsWith('--_')) continue;
        if (vars.has(name)) continue;
        vars.set(name, {
          name,
          component,
          dir: path.dirname(full),
          default: typeof entryVar.default === 'string' ? entryVar.default : '',
        });
      }
    }
  }

  await scan(coreSrc);

  return [...vars.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Collapse the enumeration into the `{key: [props and states]}` map theme
 * validation checks override keys against — both are legal override keys, so
 * they share one list.
 * @param {ThemingTarget[]} targets
 * @returns {Record<string, string[]>}
 */
export function targetsByKey(targets) {
  /** @type {Record<string, string[]>} */
  const byKey = {};
  for (const t of targets) {
    byKey[t.key] = [
      ...new Set([...(byKey[t.key] || []), ...t.props, ...t.states]),
    ];
  }
  return byKey;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
  return Array.isArray(value)
    ? value.filter((/** @type {unknown} */ v) => typeof v === 'string')
    : [];
}
