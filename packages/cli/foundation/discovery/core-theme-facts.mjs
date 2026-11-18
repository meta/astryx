// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What theme build checks a theme against in Core's component docs,
 *   kept between runs.
 * @input  a Core `src` directory
 * @output the theming targets (theming-targets.mjs), the known values of each
 *   target's visual props, and the docs that name each target token
 * @position Read by theme build (api/theme/build/build.mjs). Worked out from
 *   the docs core-component-docs.mjs reads (themeFactsOf). A run that keeps
 *   gathers keeps them as one, keyed on the Core and its version
 *   (gather-cache.mjs), and reads them back while every folder, doc and module
 *   the read touched is unchanged; a run that keeps nothing works out only
 *   the facts a build asks for.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {persistedGather, recordedRun} from '../fs/gather-cache.mjs';
import {EXACT_CODEC} from '../fs/exact-codec.mjs';
import {reusedWhileUnchanged} from '../fs/read-record.mjs';
import {coreComponentDocs} from './core-component-docs.mjs';
import {targetsFromDocs} from './theming-targets.mjs';

/**
 * The docs that name one target token: each one's module name (its `name`,
 * else its folder's) and the names of the components it documents.
 * @typedef {{moduleName: string, components: string[]}} TokenOwner
 */

/**
 * @typedef {object} CoreThemeFacts
 * @property {import('./theming-targets.mjs').ThemingTarget[]} targets - as
 *   collectThemingTargets lists them
 * @property {Record<string, Record<string, string[]>>} knownValues - each
 *   target's visual props, with the values the docs give them
 * @property {Record<string, TokenOwner[]>} owners - by target token (the class
 *   name without `astryx-`), the docs that declare it, in doc order
 */

/** The facts, with the shape they need, kept exactly. */
const FACTS_CODEC = {
  ...EXACT_CODEC,
  valid: (/** @type {any} */ value) =>
    value != null &&
    Array.isArray(value.targets) &&
    value.knownValues !== null &&
    typeof value.knownValues === 'object' &&
    value.owners !== null &&
    typeof value.owners === 'object',
};

/**
 * The kept facts of each Core `src`, by its real path.
 * @type {Map<string, () => Promise<CoreThemeFacts>>}
 */
const kept = new Map();

/**
 * Each view worked out now, for a run that keeps nothing, by the view and the
 * real path.
 * @type {Map<string, () => Promise<any>>}
 */
const live = new Map();

/**
 * The theming targets under `coreSrc`, as collectThemingTargets lists them:
 * what every theme build checks a theme's component overrides against.
 * @param {string} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<import('./theming-targets.mjs').ThemingTarget[]>}
 */
export async function coreThemeTargets(coreSrc) {
  if (!coreSrc || !fs.existsSync(coreSrc)) return [];
  const real = fs.realpathSync(coreSrc);
  return recordedRun()
    ? (await keptFacts(real)).targets
    : liveView(real, 'targets', targetsFromDocs);
}

/**
 * The known prop values and the token owners under `coreSrc`: what a theme
 * whose overrides name prop values is checked against.
 * @param {string} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<{knownValues: CoreThemeFacts['knownValues'], owners: CoreThemeFacts['owners']}>}
 */
export async function coreThemeValues(coreSrc) {
  if (!coreSrc || !fs.existsSync(coreSrc)) return {knownValues: {}, owners: {}};
  const real = fs.realpathSync(coreSrc);
  if (!recordedRun()) return liveView(real, 'values', valueFactsOf);
  const {knownValues, owners} = await keptFacts(real);
  return {knownValues, owners};
}

/**
 * In a run that keeps Core's facts, work them out now. A kept gather stamps
 * every read of its run so far, so a build asks for them before it reads the
 * theme it builds: an edit to that theme then leaves them kept. A run that
 * keeps nothing works each view out only when asked, so this does nothing
 * there.
 * @param {string | null} coreSrc - absolute path to `<core>/src`
 * @returns {Promise<void>}
 */
export async function keepCoreThemeFacts(coreSrc) {
  if (coreSrc && recordedRun() && fs.existsSync(coreSrc)) {
    await keptFacts(fs.realpathSync(coreSrc));
  }
}

/**
 * The facts each recorded run asked for, by the run's record and the real
 * path: a build asks for them several times, and checking again each time
 * every path they were worked out from costs more than the ask.
 * @type {WeakMap<Map<string, string>, Map<string, Promise<CoreThemeFacts>>>}
 */
const askedInRun = new WeakMap();

/**
 * Every fact under the real `src` path `real`, kept as one gather. A run
 * reads it back while nothing it was worked out from changed. Each caller
 * reads it and never changes it.
 *
 * One gather holds every fact, worked out before the build reads the theme
 * (keepCoreThemeFacts): a gather later in the build would stamp the theme,
 * and miss after every edit to it, or the output the build rewrites, and miss
 * every run.
 * @param {string} real
 * @returns {Promise<CoreThemeFacts>}
 */
function keptFacts(real) {
  const reads = recordedRun()?.reads;
  let asked = reads && askedInRun.get(reads);
  if (reads && !asked) {
    asked = new Map();
    askedInRun.set(reads, asked);
  }
  const known = asked?.get(real);
  if (known) return known;
  let facts = kept.get(real);
  if (facts == null) {
    facts = reusedWhileUnchanged(
      async () =>
        /** @type {CoreThemeFacts} */ (
          await persistedGather(
            ['core-theme-facts', real, coreVersion(real)],
            async () => themeFactsOf(await coreComponentDocs(real)),
            FACTS_CODEC,
          )
        ),
    );
    kept.set(real, facts);
  }
  const read = facts();
  if (asked) {
    asked.set(real, read);
    // A failed read is tried again at the next ask.
    read.catch(() => asked.delete(real));
  }
  return read;
}

/**
 * One view under the real `src` path `real`, worked out from the docs when a
 * build asks for it: a run that keeps nothing works out no fact it does not
 * use. A process reuses it while nothing it was worked out from changed.
 * @template T
 * @param {string} real
 * @param {string} view
 * @param {(docs: import('./core-component-docs.mjs').CoreComponentDoc[]) => T} derive
 * @returns {Promise<T>}
 */
function liveView(real, view, derive) {
  const id = `${view}\0${real}`;
  let read = live.get(id);
  if (read == null) {
    read = reusedWhileUnchanged(async () =>
      derive(await coreComponentDocs(real)),
    );
    live.set(id, read);
  }
  return read();
}

/**
 * The version of the Core whose `src` is `src`, or null when its package.json
 * cannot be read.
 * @param {string} src
 * @returns {string | null}
 */
function coreVersion(src) {
  try {
    const {version} = JSON.parse(
      fs.readFileSync(path.join(path.dirname(src), 'package.json'), 'utf8'),
    );
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * Theme build's facts from `docs`: the one place they are worked out.
 * @param {import('./core-component-docs.mjs').CoreComponentDoc[]} docs
 * @returns {CoreThemeFacts}
 */
export function themeFactsOf(docs) {
  return {targets: targetsFromDocs(docs), ...valueFactsOf(docs)};
}

/**
 * The known prop values and the token owners from `docs`.
 * @param {import('./core-component-docs.mjs').CoreComponentDoc[]} docs
 * @returns {{knownValues: CoreThemeFacts['knownValues'], owners: CoreThemeFacts['owners']}}
 */
export function valueFactsOf(docs) {
  return {
    // One malformed or optional doc must not erase validation for the rest.
    knownValues: knownValuesFrom(
      docs.flatMap(read => ('error' in read ? [] : [read.doc])),
    ),
    owners: ownersFrom(docs),
  };
}

/**
 * One target-keyed index of built-in visual-prop values from every core
 * component doc. A rendered target often lives in a sibling doc (for example,
 * `astryx-heading` is documented by Text/Heading.doc.mjs), so directory-name
 * guessing is not a valid lookup strategy.
 * @param {any[]} docs
 * @returns {Record<string, Record<string, string[]>>}
 */
function knownValuesFrom(docs) {
  /** @param {string} value */
  const targetName = value =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/\s+/g, '-')
      .toLowerCase();
  /**
   * The values one prop's type names: its quoted strings, then its numbers.
   * Each prop is read once, though both passes below ask for it.
   * @type {WeakMap<object, Set<string>>}
   */
  const valuesOfProp = new WeakMap();
  /** @param {any} prop @returns {Set<string>} */
  const propValues = prop => {
    let values = valuesOfProp.get(prop);
    if (values === undefined) {
      values = new Set();
      for (const match of prop.type.match(/'([^']+)'/g) ?? []) {
        values.add(match.slice(1, -1));
      }
      for (const part of prop.type
        .split('|')
        .map((/** @type {string} */ value) => value.trim())) {
        if (/^-?\d+(?:\.\d+)?$/.test(part)) values.add(part);
      }
      valuesOfProp.set(prop, values);
    }
    return values;
  };
  /**
   * @param {any[]} props
   * @returns {Record<string, Set<string>>}
   */
  const valuesFromProps = props => {
    /** @type {Record<string, Set<string>>} */
    const result = {};
    for (const prop of props ?? []) {
      if (typeof prop?.name !== 'string' || typeof prop?.type !== 'string') {
        continue;
      }
      const values = propValues(prop);
      if (values.size > 0) result[prop.name] = values;
    }
    return result;
  };

  // A component can appear in more than one doc: its own doc declares its
  // props, and a parent doc can list it by name only. Merge every entry, so
  // the result does not depend on the order the docs load in.
  /** @type {Record<string, Record<string, Set<string>>>} */
  const valuesByOwner = {};
  /**
   * @param {string} name
   * @param {any[]} props
   */
  const addOwnerValues = (name, props) => {
    const owner = (valuesByOwner[targetName(name)] ??= {});
    for (const [prop, values] of Object.entries(valuesFromProps(props))) {
      const merged = (owner[prop] ??= new Set());
      for (const value of values) merged.add(value);
    }
  };
  for (const doc of docs) {
    if (typeof doc?.name === 'string') {
      addOwnerValues(doc.name, doc.props);
    }
    for (const component of /** @type {any[]} */ (doc?.components ?? [])) {
      if (typeof component?.name === 'string') {
        addOwnerValues(component.name, component.props);
      }
    }
  }

  /** @type {Record<string, Record<string, Set<string>>>} */
  const collected = {};
  for (const doc of docs) {
    const targets = (doc?.theming?.targets ?? []).filter(
      (/** @type {any} */ target) => typeof target?.className === 'string',
    );
    if (targets.length === 0) continue;
    const localValues = valuesFromProps([
      ...(doc?.props ?? []),
      ...(doc?.components ?? []).flatMap(
        (/** @type {any} */ component) => component?.props ?? [],
      ),
    ]);
    for (const target of targets) {
      const componentName = target.className.replace(/^astryx-/, '');
      const ownerValues = valuesByOwner[componentName] ?? {};
      if (!collected[componentName]) collected[componentName] = {};
      for (const prop of target.visualProps ?? []) {
        if (!collected[componentName][prop]) {
          collected[componentName][prop] = new Set();
        }
        for (const value of [
          ...(localValues[prop] ?? []),
          ...(ownerValues[prop] ?? []),
        ]) {
          collected[componentName][prop].add(value);
        }
      }
    }
  }

  return Object.fromEntries(
    Object.entries(collected).map(([component, props]) => [
      component,
      Object.fromEntries(
        Object.entries(props).map(([prop, values]) => [prop, [...values]]),
      ),
    ]),
  );
}

/**
 * By target token, the docs that declare it, in doc order: a token documented
 * by a parent component (`avatar-status-dot` by Avatar) names its owner.
 * @param {import('./core-component-docs.mjs').CoreComponentDoc[]} docs
 * @returns {Record<string, TokenOwner[]>}
 */
function ownersFrom(docs) {
  /** @type {Map<string, TokenOwner[]>} */
  const owners = new Map();
  for (const read of docs) {
    if ('error' in read) continue;
    const {file, doc} = read;
    const moduleName =
      typeof doc?.name === 'string' && doc.name
        ? doc.name
        : path.basename(path.dirname(file));
    const components = Array.isArray(doc?.components)
      ? doc.components.flatMap((/** @type {any} */ component) =>
          typeof component?.name === 'string' ? [component.name] : [],
        )
      : [];
    /** @type {Set<string>} */
    const tokens = new Set();
    for (const target of doc?.theming?.targets || []) {
      if (typeof target?.className === 'string') {
        tokens.add(target.className.replace(/^astryx-/, ''));
      }
    }
    for (const token of tokens) {
      // Each token's list holds its own copy: a kept value shares no array.
      owners.set(token, [
        ...(owners.get(token) ?? []),
        {moduleName, components: [...components]},
      ]);
    }
  }
  return Object.fromEntries(owners);
}
