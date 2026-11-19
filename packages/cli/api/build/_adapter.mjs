// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The build subject's environment access: the page templates a project
 * can scaffold, the components it can use, the checked-in matcher weights, and
 * the block picker's per-block vectors kept between runs.
 *
 * @input Template and component discovery for `cwd` — the CLI's own templates
 *   and Core's components, plus any that the project's configured integrations
 *   contribute; the project's generated theme module and installed theme
 *   packages.
 * @output Ready page templates as `{name, displayName, description, category,
 *   keywords, command}`, where `command` is the `astryx template` command that
 *   selects exactly that template; blocks as search names them; components as
 *   `{name, keywords}`; the kit's matcher weights, the root's classifier
 *   weights, and the block picker's weights; `keptBlockCatalog`, which keeps
 *   the picker's per-block vectors beside the kept search catalog; and
 *   `appThemeWiring`, how the project wires its theme.
 * @position Beside build.mjs (api/build/). The kit leaf reads templates and
 *   components only through here, because a subject's `_adapter.mjs` is its
 *   only environment access. This adds no discovery of its own: templates come
 *   from the template subject's, components from search's, themes from the
 *   theme subject's.
 */

import fs from 'node:fs';
import {linkOwnedTexts} from '../docs/_adapter.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {discoverTemplates} from '../template/template.mjs';
import {componentKeywords} from '../search/search.mjs';
import {coreContentDir, findCoreDir} from '../../foundation/fs/paths.mjs';
import {persistedDerived} from '../../foundation/fs/gather-cache.mjs';
import {analyzeTemplateNeeds} from '../../foundation/discovery/template-needs.mjs';
import {extractComponents} from '../../foundation/discovery/template-adapter.mjs';
import {templateDestination} from '../../foundation/discovery/template-destination.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';
import {isWordModel} from './kit/word-model.mjs';
import {
  listAvailableThemeState,
  themeOwnerInstalled,
} from '../theme/_adapter.mjs';
import {providerLine, providersOf} from '../theme/_app-provider.mjs';
import {
  ThemeImportError,
  resolveThemeImports,
} from '../../foundation/discovery/theme-imports.mjs';
import {
  ThemeStateError,
  readThemeState,
} from '../../foundation/config/theme-state.mjs';
import {STARTER_THEME} from '../../foundation/discovery/theme-discovery.mjs';
import {fillTemplatePlaceholders} from '../../foundation/discovery/template-placeholders.mjs';
import {AstryxError} from '../error.mjs';

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
 * @property {string[]} components The components its page composes, read from its source on first use; empty when the source cannot be read.
 * @property {boolean} hidden The template's own `isHiddenFromOverview`: kept off the gallery, so never taken as the app shell.
 * @property {boolean} [isReady] Whether its doc calls it ready; the kit lists only ready pages.
 */

/**
 * A component the project can use, as the ranker reads it.
 * @typedef {object} ComponentWords
 * @property {string} name The component's name, e.g. `DateRangeInput`.
 * @property {string[]} keywords The keywords its own doc declares.
 * @property {string} [category] The category its own doc files it under,
 *   e.g. `Table & List`.
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
 * @property {boolean} isReady Whether its doc calls it ready, as search reports it.
 */

/**
 * Every ready page template and every block the project can scaffold, from one
 * discovery: pages as {@link loadPageTemplates} returns them, blocks as
 * {@link BlockTemplate}, and the page templates that are not ready yet, by
 * their name and descriptor words. Discovery failures leave all three empty.
 *
 * @param {string} cwd
 * @returns {Promise<{pages: PageTemplate[], blocks: BlockTemplate[], notReadyPages: import('./kit/words.mjs').NamedTemplate[]}>}
 */
export async function loadTemplates(cwd) {
  let templates;
  try {
    templates = await discoverTemplates(cwd);
  } catch {
    return {pages: [], blocks: [], notReadyPages: []};
  }
  // Each description as `astryx docs` shows a doc's text: links and doc
  // tokens rendered, so the kit and its JSON carry the bare command.
  const described = await linkOwnedTexts(
    templates.map(t => ({text: t.description || '', package: t.package})),
    cwd,
  );
  const descriptions = new Map(templates.map((t, i) => [t, described[i]]));
  const notReadyPages = templates
    .filter(t => t.type === 'page' && t.isReady === false)
    .map(t => ({
      name: t.dirName,
      displayName: t.displayName || t.name,
      category: t.category || '',
      keywords: t.keywords ?? [],
      description: descriptions.get(t) ?? '',
    }));
  const pages = templates
    .filter(t => t.type === 'page' && t.isReady !== false)
    .map(t =>
      withComponents(
        {
          name: t.dirName,
          displayName: t.displayName || t.name,
          description: descriptions.get(t) ?? '',
          package: t.package ?? '@astryxdesign/core',
          category: t.category || '',
          keywords: t.keywords ?? [],
          hidden: t.hidden === true,
          isReady: t.isReady !== false,
          filePath: t.filePath,
          // The id `template()` resolves back to this entry: an active
          // replacement owns the Core id it names, so that id selects it.
          command: `astryx template ${t.replaces ?? t.dirName} --type page`,
        },
        t.filePath,
      ),
    );
  const blocks = templates
    .filter(t => t.type === 'block')
    .map(t => ({
      name: t.dirName,
      package: t.package ?? '@astryxdesign/core',
      displayName: t.name,
      description: descriptions.get(t) ?? '',
      command: `astryx template ${t.replaces ?? t.dirName} --type block`,
      isReady: t.isReady !== false,
    }));
  return {pages, blocks, notReadyPages};
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

/** @type {{threshold: number, weights: Record<string, number>} | null | undefined} */
let shellWeights;

/**
 * The fixed word table of the shell-start check (kit/shell.weights.json), read
 * once. Null when the file is missing or unreadable.
 * @returns {{threshold: number, weights: Record<string, number>} | null}
 */
export function loadShellWeights() {
  if (shellWeights === undefined) {
    try {
      shellWeights = JSON.parse(
        fs.readFileSync(
          new URL('./kit/shell.weights.json', import.meta.url),
          'utf8',
        ),
      );
    } catch {
      shellWeights = null;
    }
  }
  return shellWeights ?? null;
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
 * The files the block picker's per-block vectors are worked out from, besides
 * the catalog text: its module, its weights, and search's word rules (the
 * stopwords).
 */
const BLOCK_CATALOG_INPUTS = [
  fileURLToPath(new URL('./blocks/blocks.mjs', import.meta.url)),
  fileURLToPath(new URL('./blocks/blocks.weights.json', import.meta.url)),
  fileURLToPath(new URL('../search/_query.mjs', import.meta.url)),
];

/**
 * Keep the block picker's per-block vectors beside the kept search catalog
 * (foundation/fs/gather-cache.mjs persistedDerived), keyed also by the files
 * that work them out, so a later run with the same catalog text and code
 * reads them back.
 * @type {import('./blocks/blocks.mjs').KeepCatalog}
 */
export function keptBlockCatalog(key, compute, codec) {
  return persistedDerived(key, compute, codec, BLOCK_CATALOG_INPUTS);
}

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
  return isWordModel(file, n);
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
    const {source} = fillTemplatePlaceholders(
      fs.readFileSync(template.filePath, 'utf-8'),
    );
    return analyzeTemplateNeeds(source, cwd).notes;
  } catch {
    // Best-effort: a read failure does not break the recommendation.
    return [];
  }
}

/**
 * Where a page template goes in the project where build ran, quoted for a
 * printed command: the path `astryx template` names for it from the
 * project's layout (in a Next app, the App Router folder). Null when that
 * folder has no package.json, so no project layout is known.
 *
 * @param {string} id the template's own id
 * @param {string} cwd the folder build ran in
 * @returns {string | null}
 */
export function pageDestination(id, cwd) {
  if (!fs.existsSync(path.join(cwd, 'package.json'))) return null;
  return quoteCommandArgument(templateDestination(cwd, 'page', id));
}

/**
 * The Core a build answers from: the project's, else the release's own,
 * installed into the per-user cache first when needed (a network install
 * and an npm subprocess; spec AST-081 FR3). Throws as requireCoreDir does.
 * Null in a run whose base is not Core, which builds from its integrations.
 * @param {string} cwd
 * @returns {string | null}
 */
export function buildCoreContentDir(cwd) {
  return coreContentDir(cwd);
}

/**
 * Adds a lazy, non-enumerable `components` getter to a page entry: the page's
 * source is read and parsed only when a caller reads it, once, so loading the
 * catalog stays cheap and the entry's own fields are unchanged.
 * @template {object} T
 * @param {T} entry
 * @param {string | undefined} filePath
 * @returns {T & {readonly components: string[]}}
 */
function withComponents(entry, filePath) {
  /** @type {string[] | undefined} */
  let components;
  return /** @type {T & {readonly components: string[]}} */ (
    Object.defineProperty(entry, 'components', {
      get() {
        if (components === undefined) {
          try {
            components = filePath ? extractComponents(filePath) : [];
          } catch {
            components = [];
          }
        }
        return components;
      },
    })
  );
}

/**
 * The provider the app passes its theme to instead of `<Theme>`, as
 * `theme add` names it: the one an installed package declares, when it takes
 * a theme object. `line` is its opening tag, built as the `theme add`
 * receipt builds it.
 * @typedef {{export: string, from: string, line: string}} ThemeProvider
 */

/**
 * @typedef {({state: 'wired', modulePath: string, hasModes: boolean}
 *   | {state: 'installed', slug: string, hasModes: boolean}
 *   | {state: 'none', slug: string, package: string})
 *   & {provider: ThemeProvider | null}} AppThemeWiring
 */

/**
 * How the project at `cwd` wires its theme, read the way `theme add` reads
 * it: `wired` when `theme add` has written the generated module, `installed`
 * when a theme it can add is installed but not added, and otherwise the
 * starter theme. `hasModes` says the module records a theme's one color mode,
 * or will once `theme add` adds the installed theme, read from its built
 * module as `theme add` reads it. `provider` is set when an installed package
 * names the provider that takes the theme.
 * @param {string} cwd
 * @returns {Promise<AppThemeWiring>}
 */
export async function appThemeWiring(cwd) {
  /** @type {ThemeProvider | null} */
  let starterProvider = null;
  try {
    const {themes} = await listAvailableThemeState(cwd);
    const {taking} = providersOf(themes);
    /** @param {boolean} oneMode @returns {ThemeProvider | null} */
    const provide = oneMode =>
      taking?.provider.themeProp
        ? {
            export: taking.provider.export,
            from: taking.provider.from,
            line: providerLine(taking.provider, oneMode),
          }
        : null;
    starterProvider = provide(false);
    const state = readThemeState(cwd);
    const source = state.module.expectedOriginal;
    if (state.configured && source) {
      const hasModes = /\bexport const themeModes\b/u.test(
        source.toString('utf-8'),
      );
      return {
        state: 'wired',
        modulePath: state.module.path,
        hasModes,
        provider: provide(hasModes),
      };
    }
    const installed = themes.find(theme =>
      themeOwnerInstalled(theme, state.projectDir),
    );
    if (installed) {
      const hasModes = oneColorModeOf(installed, cwd);
      return {
        state: 'installed',
        slug: installed.slug,
        hasModes,
        provider: provide(hasModes),
      };
    }
  } catch (error) {
    // Outside a project, or with theme state the theme commands refuse, the
    // playbook names the starter theme; those commands report the problem.
    if (!(error instanceof ThemeStateError || error instanceof AstryxError))
      throw error;
  }
  return {
    state: 'none',
    slug: STARTER_THEME.slug,
    package: STARTER_THEME.package,
    provider: starterProvider,
  };
}

/**
 * Whether `theme add` records one color mode for a theme: its built module
 * exports one. A theme whose built module cannot be resolved has none here;
 * `theme add` reports that problem.
 * @param {import('../../foundation/discovery/theme-discovery.mjs').DiscoveredTheme} theme
 * @param {string} cwd
 */
function oneColorModeOf(theme, cwd) {
  try {
    return resolveThemeImports(theme, {cwd}).mode != null;
  } catch (error) {
    if (error instanceof ThemeImportError) return false;
    throw error;
  }
}
