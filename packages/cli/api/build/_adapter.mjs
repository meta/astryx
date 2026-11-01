// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The build subject's environment access: the page templates a project
 * can scaffold, the components it can use, and the checked-in matcher weights.
 *
 * @input Template and component discovery for `cwd` — the CLI's own templates
 *   and Core's components, plus any that the project's configured integrations
 *   contribute.
 * @output Ready page templates as `{name, displayName, description, category,
 *   keywords, command}`, where `command` is the `astryx template` command that
 *   selects exactly that template; blocks as search names them; components as
 *   `{name, keywords}`; the kit's matcher weights, the root's classifier
 *   weights, and the block picker's weights.
 * @position Beside build.mjs (api/build/). The kit leaf reads templates and
 *   components only through here, because a subject's `_adapter.mjs` is its
 *   only environment access. This adds no discovery of its own: templates come
 *   from the template subject's, components from search's.
 */

import fs from 'node:fs';

import {discoverTemplates} from '../template/template.mjs';
import {componentKeywords} from '../search/search.mjs';
import {findCoreDir, requireCoreDir} from '../../foundation/fs/paths.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';

/**
 * Runs one build with a single directory listing per path: the kit resolves
 * every candidate's source and docs by walking the same tree, which does not
 * change during the call.
 */
export {withListingCache} from '../../foundation/fs/listing-cache.mjs';

/**
 * A page template the kit can recommend starting from.
 * @typedef {object} PageTemplate
 * @property {string} name The template's own id, as search reports it.
 * @property {string} command `astryx template <id> --type page`, the command that selects exactly this template: an integration replacement is selected by the Core id it replaces, and `--type page` keeps a block with the same id from making it ambiguous. Search prints template commands the same way.
 * @property {string} displayName Human-facing name.
 * @property {string} description What the page is and how it is laid out.
 * @property {string} package The npm package that owns this template.
 * @property {string} category The template's own `Family - Variant` label; empty when it declares none.
 * @property {string[]} keywords The ideas the page serves, as its own descriptor names them; empty when it declares none.
 * @property {string} filePath Absolute path to the template source file on disk.
 */

/**
 * A component the project can use, as the ranker reads it.
 * @typedef {object} ComponentWords
 * @property {string} name The component's name, e.g. `DateRangeInput`.
 * @property {string[]} keywords The keywords its own doc declares.
 */

/**
 * Every ready page template the project can scaffold, in discovery order. This
 * is the default discovery view: an active integration replacement stands in
 * for the Core template it replaces, as it does for `astryx template <id>`.
 *
 * Discovery failures leave the kit without a start rather than failing the
 * command: the kit still carries its search matches, and `template --list`
 * reports what went wrong.
 *
 * @param {string} cwd
 * @returns {Promise<PageTemplate[]>}
 */
export async function loadPageTemplates(cwd) {
  return (await loadTemplates(cwd)).pages;
}

/**
 * A block the kit can name, as search names a block result.
 * @typedef {object} BlockTemplate
 * @property {string} name The block's own id, as search reports it.
 * @property {string} package The npm package that owns this block.
 * @property {string} displayName Human-facing name.
 * @property {string} description What the block is.
 * @property {string} command `astryx template <id> --type block`, as search prints it.
 */

/**
 * Every ready page template and every block the project can scaffold, from one
 * discovery: pages as {@link loadPageTemplates} returns them, blocks as
 * {@link BlockTemplate}. Discovery failures leave both empty.
 *
 * @param {string} cwd
 * @returns {Promise<{pages: PageTemplate[], blocks: BlockTemplate[]}>}
 */
export async function loadTemplates(cwd) {
  let templates;
  try {
    templates = await discoverTemplates(cwd);
  } catch {
    return {pages: [], blocks: []};
  }
  const pages = templates
    .filter(t => t.type === 'page' && t.isReady !== false)
    .map(t => ({
      name: t.dirName,
      displayName: t.displayName || t.name,
      description: t.description || '',
      package: t.package ?? '@astryxdesign/core',
      category: t.category || '',
      keywords: t.keywords ?? [],
      filePath: t.filePath,
      // The id `template()` resolves back to this entry: an active replacement
      // owns the Core id it names, so that id selects it, not its own.
      command: `astryx template ${t.replaces ?? t.dirName} --type page`,
    }));
  const blocks = templates
    .filter(t => t.type === 'block')
    .map(t => ({
      name: t.dirName,
      package: t.package ?? '@astryxdesign/core',
      displayName: t.name,
      description: t.description || '',
      command: `astryx template ${t.replaces ?? t.dirName} --type block`,
    }));
  return {pages, blocks};
}

/**
 * The components the project can use, Core's and its integrations', each with
 * the keywords its own doc declares: what the ranker reads to tell a part of a
 * page from a page. Search's own discovery, so both agree on what exists; empty
 * when Core cannot be found.
 *
 * @param {string} cwd
 * @returns {Promise<ComponentWords[]>}
 */
export async function loadComponents(cwd) {
  const coreDir = findCoreDir(cwd);
  if (!coreDir) return [];
  try {
    return await componentKeywords(coreDir, cwd);
  } catch {
    return [];
  }
}

/** @type {import('./kit/weights.mjs').WeightsFile | null | undefined} */
let weights;

/**
 * The matcher weights checked in beside the kit (`kit/weights.json`), read
 * once; null when the file is absent or unreadable.
 * @returns {import('./kit/weights.mjs').WeightsFile | null}
 */
export function loadWeights() {
  if (weights === undefined) {
    try {
      const file = JSON.parse(
        fs.readFileSync(new URL('./kit/weights.json', import.meta.url), 'utf8'),
      );
      weights = isWeightsFile(file) ? file : null;
    } catch {
      weights = null;
    }
  }
  return weights ?? null;
}

/** @type {import('../../foundation/route/route.mjs').ClassifierWeights | undefined} */
let treeWeights;

/**
 * The classifier weights of build's root (tree.weights.json), read once.
 * @returns {import('../../foundation/route/route.mjs').ClassifierWeights}
 */
export function loadTreeWeights() {
  treeWeights ??= JSON.parse(
    fs.readFileSync(new URL('./tree.weights.json', import.meta.url), 'utf8'),
  );
  return /** @type {import('../../foundation/route/route.mjs').ClassifierWeights} */ (
    treeWeights
  );
}

/** @type {import('./blocks/blocks.mjs').BlockPickerWeights | null | undefined} */
let blockPicker;

/**
 * The block picker's weights (blocks/blocks.weights.json), read once; null
 * when the file is absent, unreadable, or not the shape the picker reads, in
 * which case build names its own blocks.
 * @returns {import('./blocks/blocks.mjs').BlockPickerWeights | null}
 */
export function loadBlockPicker() {
  if (blockPicker === undefined) {
    try {
      const file = JSON.parse(
        fs.readFileSync(
          new URL('./blocks/blocks.weights.json', import.meta.url),
          'utf8',
        ),
      );
      blockPicker = isBlockPickerWeights(file) ? file : null;
    } catch {
      blockPicker = null;
    }
  }
  return blockPicker ?? null;
}

/**
 * Whether a parsed weights file has the shape the kit reads: every row has a
 * weight per candidate, every bias a number per candidate, and three blend
 * numbers per member (the tables plus the ranker) and one for the shell.
 * @param {any} file
 * @returns {file is import('./kit/weights.mjs').WeightsFile}
 */
export function isWeightsFile(file) {
  const n = Array.isArray(file?.candidates) ? file.candidates.length : 0;
  return (
    n > 0 &&
    Array.isArray(file.tables) &&
    file.tables.length > 0 &&
    file.tables.every(
      (/** @type {any} */ t) =>
        Array.isArray(t?.words) &&
        Array.isArray(t.rows) &&
        t.rows.length === t.words.length &&
        t.rows.every(
          (/** @type {any} */ r) => typeof r === 'string' && r.length === n,
        ) &&
        Array.isArray(t.bias) &&
        t.bias.length === n &&
        t.bias.every((/** @type {any} */ b) => Number.isFinite(b)) &&
        Number.isFinite(t.clip) &&
        Number.isFinite(t.step),
    ) &&
    Array.isArray(file.blend) &&
    file.blend.length === 3 * (file.tables.length + 1) + 1 &&
    file.blend.every((/** @type {any} */ x) => Number.isFinite(x))
  );
}

/** The ranking coefficients the picker reads. */
const PICKER_THETA = [
  'g',
  'grank',
  'gmargin',
  'seen',
  'lex',
  'sscore',
  'scov',
  'srank',
  'inkit',
  'kitpos',
  'mention',
  'show',
];

/**
 * Whether a parsed block picker file has the shape the picker reads: a
 * vocabulary with an idf per entry, two signed byte matrices of vocabulary x
 * dims (base64) with their scales, the lexical weight, the known blocks, and
 * the ranking coefficients.
 * @param {any} w
 * @returns {w is import('./blocks/blocks.mjs').BlockPickerWeights}
 */
function isBlockPickerWeights(w) {
  const n = Array.isArray(w?.vocab) ? w.vocab.length : 0;
  const size = (/** @type {unknown} */ s) =>
    typeof s === 'string' ? Buffer.from(s, 'base64').length : -1;
  return (
    n > 0 &&
    w.vocab.every((/** @type {unknown} */ t) => typeof t === 'string') &&
    Array.isArray(w.idf) &&
    w.idf.length === n &&
    w.idf.every((/** @type {unknown} */ x) => Number.isFinite(x)) &&
    Number.isInteger(w.dims) &&
    w.dims > 0 &&
    size(w.request) === n * w.dims &&
    size(w.doc) === n * w.dims &&
    Number.isFinite(w.requestScale) &&
    Number.isFinite(w.docScale) &&
    Number.isFinite(w.lexical) &&
    Array.isArray(w.known) &&
    w.known.every((/** @type {unknown} */ b) => typeof b === 'string') &&
    !!w.theta &&
    PICKER_THETA.every(k => Number.isFinite(w.theta[k]))
  );
}

/**
 * Analyze what a start template needs that the project lacks. The kit leaf
 * calls this through the adapter rather than reading the file itself, because
 * file access is environment access (architecture:cli-surface INV21).
 *
 * @param {PageTemplate} template
 * @param {string} cwd Project directory
 * @returns {string[]} Setup notes (empty when the template needs nothing).
 */
export function templateSetupNotes(template, cwd) {
  try {
    const source = fs.readFileSync(template.filePath, 'utf-8');
    return analyzeTemplateNeeds(source, cwd).notes;
  } catch {
    // Best-effort: a read failure does not break the recommendation.
    return [];
  }
}

/**
 * The Core a build answers from: the project's, else the release's own,
 * installed into the per-user cache first when needed (a network install
 * and an npm subprocess; spec AST-081 FR3). Throws as requireCoreDir does.
 * @param {string} cwd
 * @returns {string}
 */
export function requireBuildCoreDir(cwd) {
  return requireCoreDir(cwd);
}
