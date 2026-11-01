// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's adapter: the only place search reads the environment. It
 * gathers every candidate from the domains a query asks for (one file per
 * domain, _gather-*.mjs) and loads the tree's static data before it runs.
 */

import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {requireCoreDir} from '../../foundation/fs/paths.mjs';
import {recordReads, unchangedSince} from '../../foundation/fs/read-record.mjs';
import {isOutsideProject} from '../../foundation/env/project-scope.mjs';
import {coreDirOrThrow} from '../error.mjs';
import {CORELESS_DOMAINS} from './_query.mjs';
import {gatherComponents} from './_gather-components.mjs';
import {gatherHooks} from './_gather-hooks.mjs';
import {gatherDocs} from './_gather-docs.mjs';
import {gatherTemplates, gatherThemes} from './_gather-templates.mjs';

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
 * Gathers every candidate the query's domains hold.
 *
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<{all: Candidate[], components: Candidate[], searchedComponents: boolean, outside: boolean, coreSkipped: string | null}>}
 */
export async function gatherCandidates(options) {
  const {cwd = process.cwd(), type} = options;
  // `astryx docs` reads docs without @astryxdesign/core, and `astryx theme
  // list` reads themes without it (bundled themes need no project), so a
  // search of either must too. Every other domain reads core: asked for by
  // name, it is an error without core; an open search then covers the docs
  // and themes alone.
  const needsCore = !type || !CORELESS_DOMAINS.includes(type);
  // A domain that reads Core gets it as `component` does: the project's, else
  // the answering release's own, installed into the per-user cache on first
  // need (spec AST-081 FR3). Asked for by name, a Core that cannot be had is
  // the error; an open search answers from the rest and says what it skipped
  // and why, never silently.
  /** @type {string | null} */
  let coreDir = null;
  /** @type {string | null} */
  let coreSkipped = null;
  if (needsCore && type) {
    coreDir = coreDirOrThrow(requireSearchCoreDir, cwd);
  } else if (needsCore) {
    try {
      coreDir = requireSearchCoreDir(cwd);
    } catch (error) {
      coreSkipped = /** @type {Error} */ (error).message;
    }
  }

  // Gather candidates from each requested domain in parallel.
  /** @param {string} d */
  const wants = d =>
    (!type && (coreDir != null || CORELESS_DOMAINS.includes(d))) || type === d;
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
  };
}

/**
 * @typedef {Awaited<ReturnType<typeof gatherCandidates>>} Gathered
 * @type {Map<string, {reads: Map<string, string>, value: Promise<Gathered>}>}
 */
const gathered = new Map();

/**
 * gatherCandidates, reused within one process: a later search in the same
 * folder, for the same `type`, ranks the candidates an earlier search
 * gathered when none of the files that gather read, and none of the folders
 * it listed or probed, changed since (each is checked by its change time and
 * size, so an edited doc in a linked package is seen on the next call). A
 * long-running caller (a docs site's search, an agent harness) then pays the
 * gather once. A one-shot `astryx search` gathers once, as before.
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<Gathered>}
 */
export async function gatherCandidatesReused(options) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const key = `${cwd}\0${options.type ?? ''}`;
  const hit = gathered.get(key);
  if (hit && unchangedSince(hit.reads)) return hit.value;
  /** @type {Map<string, string>} */
  const seen = new Map();
  const value = recordReads(seen, () => gatherCandidates({...options, cwd}));
  try {
    await value;
  } catch (error) {
    if (gathered.get(key)?.value === value) gathered.delete(key);
    throw error;
  }
  // Each path's state was taken as it was first read, so an edit made while
  // the gather ran shows as a change on the next call.
  gathered.set(key, {reads: seen, value});
  return value;
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
 * @typedef {Awaited<ReturnType<typeof gatherCandidates>> & {data: SearchData}} SearchCatalog
 */

/** @type {SearchData | null} */
let searchData = null;

/**
 * The search tree's static data, read once: the entry cards and each node's
 * weights file.
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
    };
  }
  return searchData;
}
