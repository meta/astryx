// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's adapter: the only place search reads the environment. It
 * gathers every candidate from the domains a query asks for (one file per
 * domain, _gather-*.mjs) and loads the tree's static data before it runs.
 */

import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {realDir, requireCoreDir} from '../../foundation/fs/paths.mjs';
import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {persistedGather} from '../../foundation/fs/gather-cache.mjs';
import {
  reusedWhileUnchanged,
  unchangedSince,
} from '../../foundation/fs/read-record.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {coreDirOrThrow} from '../error.mjs';
import {loadBlockPicker} from '../build/_adapter.mjs';
import {CORELESS_DOMAINS} from './_query.mjs';
import {gatherComponents} from './_gather-components.mjs';
import {gatherHooks} from './_gather-hooks.mjs';
import {gatherDocs} from './_gather-docs.mjs';
import {
  derivedFromSource,
  gatherTemplates,
  gatherThemes,
} from './_gather-templates.mjs';
import {componentsInSource} from '../../foundation/discovery/template-adapter.mjs';

export {componentKeywords} from './_gather-components.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * The Core a typed search reads: the project's, else the release's own,
 * installed into the per-user cache first when needed (a network install and
 * an npm subprocess; spec AST-081 FR3). Throws as requireCoreDir does.
 * @param {string} cwd
 * @returns {string}
 */
export function requireSearchCoreDir(cwd) {
  return requireCoreDir(cwd);
}

/**
 * Gathers every candidate the query's domains hold. The gather runs in one
 * listing-cache operation, so its discovery helpers list each folder once, as
 * in the CLI's searches. A caller that runs its own operation shares it.
 *
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<{all: Candidate[], components: Candidate[], searchedComponents: boolean, outside: boolean, coreSkipped: string | null, coreSkippedCode: string | null}>}
 */
export function gatherCandidates(options) {
  return withListingCache(() => gatherDomains(options));
}

/**
 * The Core a search of `type` reads, and the domains it gathers. `astryx docs`
 * reads docs without @astryxdesign/core, and `astryx theme list` reads themes
 * without it, so a docs or themes search never looks for Core. Every other
 * domain reads Core: the project's, else the answering release's own,
 * installed into the per-user cache on first need (spec AST-081 FR3). A Core
 * domain asked for by name throws the lookup's coded error. An open search
 * without Core gathers the docs and themes alone and records why in
 * `coreSkipped`; it never fails silently.
 * @param {string | undefined} type
 * @param {(cwd: string) => string} lookup finds the Core folder, or throws
 * @param {string} cwd
 * @returns {{coreDir: string | null, coreSkipped: string | null, coreSkippedCode: string | null, wants: (domain: string) => boolean}}
 */
export function resolveSearchCore(type, lookup, cwd) {
  const needsCore = !type || !CORELESS_DOMAINS.includes(type);
  /** @type {string | null} */
  let coreDir = null;
  /** @type {string | null} */
  let coreSkipped = null;
  /** @type {string | null} */
  let coreSkippedCode = null;
  if (needsCore && type) {
    coreDir = coreDirOrThrow(lookup, cwd);
  } else if (needsCore) {
    try {
      coreDir = lookup(cwd);
    } catch (error) {
      coreSkipped = /** @type {Error} */ (error).message;
      const code = /** @type {any} */ (error)?.code;
      coreSkippedCode = typeof code === 'string' ? code : null;
    }
  }
  /** @param {string} domain */
  const wants = domain =>
    (!type && (coreDir != null || CORELESS_DOMAINS.includes(domain))) ||
    type === domain;
  return {coreDir, coreSkipped, coreSkippedCode, wants};
}

/**
 * @param {{cwd?: string, type?: string}} options
 */
async function gatherDomains(options) {
  const {cwd = process.cwd(), type} = options;
  const {coreDir, coreSkipped, coreSkippedCode, wants} = resolveSearchCore(
    type,
    requireSearchCoreDir,
    cwd,
  );
  const [components, hooks, docTopics, templates, themes] = await Promise.all([
    wants('component')
      ? gatherComponents(/** @type {string} */ (coreDir), cwd)
      : [],
    wants('hook') ? gatherHooks(/** @type {string} */ (coreDir)) : [],
    wants('doc') ? gatherDocs(cwd) : [],
    wants('template') ? gatherTemplates(cwd) : [],
    wants('theme') ? gatherThemes(cwd) : [],
  ]);

  const all = [...components, ...hooks, ...docTopics, ...templates, ...themes];
  // Outside a project a theme cannot be added to an app, so its command forks
  // the source instead (spec AST-081 FR3).
  const outside = themes.length > 0 && isOutsideProject(cwd);
  return {
    all,
    components,
    searchedComponents: wants('component'),
    outside,
    coreSkipped,
    coreSkippedCode,
  };
}

/**
 * A gathered catalog as plain JSON and back, for a gather kept between runs
 * (persistedGather). A template's derived component names are read once and
 * stored as their value; `components` is stored by position in `all`, whose
 * objects it shares.
 */
const GATHER_CODEC = {
  /**
   * @param {any} gathered
   * @returns {any}
   */
  encode(gathered) {
    const position = new Map(
      gathered.all.map((/** @type {any} */ c, /** @type {number} */ i) => [
        c,
        i,
      ]),
    );
    return {
      ...gathered,
      all: gathered.all.map((/** @type {any} */ c) => {
        if (!Object.getOwnPropertyDescriptor(c, 'weakKeywords')?.get) return c;
        // The names come from the source file, read again when first asked
        // for (its content is one of the stored inputs); a source that could
        // not be read derives none.
        const from = derivedFromSource.get(c);
        const names = from?.derivedSoFar();
        /** @type {Record<string, unknown>} */
        const out = {};
        for (const k of Object.keys(c)) {
          out[k] =
            k === 'weakKeywords'
              ? {[DERIVED]: names ?? from?.file ?? null}
              : c[k];
        }
        return out;
      }),
      components: gathered.components.map((/** @type {any} */ c) =>
        position.get(c),
      ),
    };
  },
  /**
   * @param {any} stored
   * @returns {any}
   */
  decode(stored) {
    const all = stored.all.map((/** @type {any} */ c) => {
      const stored = c.weakKeywords?.[DERIVED];
      if (stored === undefined) return c;
      // Names read by the run that stored them, or the file to read them from.
      const file = typeof stored === 'string' ? stored : null;
      /** @type {string[] | undefined} */
      let derived = Array.isArray(stored) ? stored : undefined;
      const derive = () => {
        if (derived === undefined) {
          try {
            derived =
              file == null
                ? []
                : componentsInSource(readFileSync(file, 'utf-8'));
          } catch {
            derived = [];
          }
        }
        return derived;
      };
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of Object.keys(c)) {
        if (k === 'weakKeywords') {
          Object.defineProperty(out, k, {
            get: derive,
            enumerable: true,
            configurable: true,
          });
        } else {
          out[k] = c[k];
        }
      }
      return out;
    });
    return {
      ...stored,
      all,
      components: stored.components.map((/** @type {number} */ i) => all[i]),
    };
  },
};

/** The key a stored template's derived component names sit under. */
const DERIVED = '\0derived';

/**
 * @typedef {Awaited<ReturnType<typeof gatherCandidates>>} Gathered
 * @type {Map<string, (options?: {fresh?: boolean}) => Promise<Gathered>>}
 */
const gathered = new Map();

/**
 * gatherCandidates, reused within one process: a later search in the same
 * folder, for the same `type`, ranks the candidates an earlier search
 * gathered when none of the files that gather read, and none of the folders
 * it listed or probed, changed since (each is checked by its change time and
 * size, so an edited doc in a linked package is seen on the next call). That
 * holds for a gather that is still running too, so searches that start
 * together (a docs site's search right after it starts) share one gather. A
 * long-running caller (a docs site's search, an agent harness) then pays the
 * gather once. A one-shot `astryx search` gathers once, as before.
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<Gathered>}
 */
export function gatherCandidatesReused(options) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const type = options.type;
  const key = `${cwd}\0${type ?? ''}`;
  let gather = gathered.get(key);
  if (!gather) {
    gather = reusedWhileUnchanged(
      () =>
        persistedGather(
          [realDir(cwd), type ?? null],
          () => gatherCandidates({cwd, type}),
          GATHER_CODEC,
          // A gather that skipped Core (a failed install still in its
          // backoff, spec:AST-081 FR2) is not kept: once the backoff ends,
          // the next run must try again.
          value => value.coreSkipped == null,
        ),
      unchangedSince,
    );
    gathered.set(key, gather);
  }
  return gather();
}

/**
 * @typedef {{w: number[], mu: number[], sd: number[]}} SearcherWeights
 * @typedef {object} SearchData
 * @property {Record<string, {what?: string, synonyms?: string[], props?: string[]}>} cards
 *   Each Core component's and hook's source-built card: what it is, the words
 *   people type for it, its main props.
 * @property {import('../../foundation/route/route.mjs').ClassifierWeights} router The root classifier's weights.
 * @property {SearcherWeights} main The main searcher's weights.
 * @property {SearcherWeights} doc The doc searcher's weights.
 * @property {SearcherWeights} template The template searcher's weights.
 * @property {import('../build/blocks/blocks.mjs').BlockPickerWeights | null} picker
 *   Build's block-picker weights, which the fit pass (_fit-order.mjs) reads;
 *   null when build's loader finds the file absent, unreadable, or the wrong
 *   shape.
 * @typedef {Awaited<ReturnType<typeof gatherCandidates>> & {data: SearchData}} SearchCatalog
 */

/** @type {SearchData | null} */
let searchData = null;

/**
 * The search tree's static data, read once: the entry cards, each node's
 * weights file, and build's block-picker weights for the fit pass. Build's
 * loader (loadBlockPicker) reads and checks the picker weights, only when the
 * pass first needs them.
 *
 * These files are static, reviewed data that only order matches inside a score
 * band; ORDERING.md beside them says what each holds and how
 * they are refreshed.
 * @returns {SearchData}
 */
export function loadSearchData() {
  if (!searchData) {
    /** @param {string} file */
    const read = file =>
      JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    searchData = {
      cards: read('./_cards.json'),
      router: read('./tree.weights.json'),
      main: read('./_main-searcher.weights.json'),
      doc: read('./_doc-searcher.weights.json'),
      template: read('./_template-searcher.weights.json'),
      // Read on first use: most searches never reach the fit pass.
      get picker() {
        return loadBlockPicker();
      },
    };
  }
  return searchData;
}
