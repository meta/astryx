// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doc reader — authored files in, lowered docs out, for every doc kind.
 *
 * @input A descriptor file, the root that reads it (components, hooks,
 *   templates, themes, self-docs, or doc topics), the reading language, and
 *   how strictly the reader checks.
 * @output The lowered doc for that file. Readers get the view they have always
 *   read, lowered afresh on every read; a whole-project compile also gets the
 *   sealed node, memoized per file while the file is unchanged. An edited file
 *   is read again in the same process (./import.mjs). For doc topics: the
 *   compiler input for a topic, with its extensions and overlays loaded.
 * @position Loads authored doc files for the readers in api/ and clients/ and
 *   hands each to ./compile.mjs. Each reader keeps its own loader, export
 *   order, and strictness, so what it prints is what it printed before.
 *   ./doc-loads.test.mjs lists, site by site, every other place the CLI runs
 *   anything but its static imports of other CLI code, the doc reads that skip
 *   this module among them: discovery's catalog fields, each command's
 *   self-docs for its help text, and the build-time README. A new site fails
 *   it. It catches every ordinary way of running code, whatever the local
 *   names; deliberate obfuscation is out of scope. Internal to the CLI:
 *   nothing here is public API.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  importDocModule,
  importNativeModule,
  importTemplateModule,
} from './import.mjs';
import {fileStamp, recordContentRead} from '../fs/read-record.mjs';
import {lowerDoc, parserFor} from './compile.mjs';
import {translationFor} from './overlays.mjs';
import {parseReadableDoc} from './parse-readable.mjs';
import {packageOf, packageSource} from './source.mjs';

/**
 * How each root's module names its doc, in precedence order: the `??` chain
 * each reader has always used, so a file that exports two docs keeps serving
 * the one it served before.
 */
export const DOC_EXPORTS = Object.freeze({
  components: ['default', 'docs'],
  hooks: ['default', 'docs'],
  templates: ['default', 'doc'],
  'self-docs': ['doc', 'docs', 'default'],
  // The docs tree's own files: namespace docs and the guides it places.
  tree: ['docs', 'default'],
});

/** How a reader imports a doc module. */
const LOADERS = Object.freeze({
  // jiti for `.ts`, native otherwise: the checked loaders' import.
  user: importDocModule,
  // A plain `import()`: what the unchecked readers have always used.
  native: importNativeModule,
  // jiti with JSX for `.ts`: template discovery's import.
  template: importTemplateModule,
});

/**
 * @typedef {object} ReadOptions
 * @property {'components' | 'hooks' | 'templates' | 'themes' | 'icon-definitions' | 'self-docs' | 'tree'} root
 * @property {string | null} [lang] overlay language; null reads the authored
 *   text
 * @property {string} [label] how a parse error names the file (default: its
 *   file name)
 * @property {string} [provider] the owning package, when the caller knows it
 * @property {string} [id] the node's id (default: provider, root, and file
 *   name)
 * @property {keyof typeof LOADERS} [loader] how to import the module (default
 *   `user`)
 * @property {readonly string[]} [exports] which exports name the doc, in
 *   precedence order, for a reader that has always read a narrower set than its
 *   root's default ({@link DOC_EXPORTS})
 * @property {() => unknown} [readStatic] for themes and icon definitions: the descriptor value, read
 *   without executing the file
 * @property {'authored' | 'parsed'} [value] which value the view carries: the
 *   authored export (default) or its parser's result, for a reader that has
 *   always read the checked value
 * @property {boolean} [check] hold the doc to its kind's parser
 */

/** @type {Map<string, {stamp: string, result: Promise<import('./compile.mjs').LoweredDoc>}>} */
const lowered = new Map();

/**
 * Lower one descriptor file. Memoized per file and options while the file is
 * unchanged; an edited file is lowered again from its new content, and a file
 * that failed to load is tried again on the next read, as a fresh import
 * would be.
 * @param {string} file absolute path
 * @param {ReadOptions} options
 * @param {{node?: boolean}} [want] also build the sealed node
 * @returns {Promise<import('./compile.mjs').LoweredDoc>}
 */
export function compileDocFile(file, options, {node = false} = {}) {
  const lang = options.lang ?? null;
  const check = options.check === true;
  const key = JSON.stringify([
    path.resolve(file),
    options.root,
    lang,
    options.label ?? null,
    options.provider ?? null,
    options.id ?? null,
    options.loader ?? 'user',
    options.exports ?? null,
    options.value ?? 'authored',
    check,
    node,
  ]);
  recordContentRead(file);
  const stamp = fileStamp(file);
  const hit = lowered.get(key);
  let result = hit?.stamp === stamp ? hit.result : undefined;
  if (!result) {
    result = loadAuthored(file, options, lang).then(authored => {
      const provider = options.provider ?? packageOf(file);
      const out = lowerDoc(
        {
          id:
            options.id ?? `${provider}:${options.root}:${path.basename(file)}`,
          root: options.root,
          provider,
          source: packageSource(file),
          lang,
          file: authored,
          ...(options.label ? {label: options.label} : {}),
          ...(options.value === 'parsed' ? {useParsed: true} : {}),
        },
        {check, node},
      );
      if (out.node) deepFreeze(out.node);
      if (out.loadFailed || 'overlayError' in authored) {
        if (lowered.get(key)?.result === result) lowered.delete(key);
      }
      return out;
    });
    lowered.set(key, {stamp, result});
  }
  return result;
}

/**
 * What a reader gets for one descriptor: the view it has always read.
 *
 * `strict` readers check the doc and throw what they always threw: the import
 * error, the parser's error (for an empty export too), then a failed
 * translation. Other readers skip the check, throw only what importing or
 * translating threw, and read an empty export as the empty value itself.
 * The view is shared, as the module's own export always was.
 * @param {string} file absolute path
 * @param {ReadOptions & {strict?: boolean}} options
 * @returns {Promise<any>}
 */
export async function readDocView(file, options) {
  const strict = options.strict === true;
  const lang = options.lang ?? null;
  // Lowered on every read, as the readers always loaded: Node caches the
  // module, and the translation and the check run fresh each time, so a
  // reader never shares a translated or parsed result with the next one.
  const provider = options.provider ?? packageOf(file);
  const result = lowerDoc(
    {
      id: options.id ?? `${provider}:${options.root}:${path.basename(file)}`,
      root: options.root,
      provider,
      source: packageSource(file),
      lang,
      file: await loadAuthored(file, options, lang),
      ...(options.label ? {label: options.label} : {}),
      ...(options.value === 'parsed' ? {useParsed: true} : {}),
    },
    {check: strict || options.check === true, node: false},
  );
  if (result.loadFailed) throw result.loadFailure;
  if (result.missing) {
    if (strict) {
      // A doc that exports nothing its reader takes (an empty file, or one
      // with other exports) is said plainly, with what it does export and
      // the fix; the schema would only say "(root): Invalid input".
      const exported =
        options.exports ??
        /** @type {Record<string, readonly string[]>} */ (DOC_EXPORTS)[
          options.root
        ] ??
        [];
      const problem =
        result.missingValue === undefined
          ? await missingDocProblem(file, options, exported)
          : null;
      if (problem) throw new Error(`${options.label ?? file} ${problem}`);
      parserFor(options.root)(result.missingValue, options.label ?? file);
    }
    return result.missingValue;
  }
  if (strict && result.failed) throw result.failure;
  if (result.overlayFailed) throw result.overlayFailure;
  return result.view;
}

/**
 * Why a doc file exports no doc, with the fix: it is empty, or it exports
 * other names than the ones its reader takes. Null when neither explains it.
 * @param {string} file
 * @param {ReadOptions} options
 * @param {readonly string[]} exported the export names the reader takes
 * @returns {Promise<string | null>}
 */
async function missingDocProblem(file, options, exported) {
  // A theme descriptor is read statically, never imported.
  if (options.root === 'themes') return null;
  const fix =
    'Fix: export the doc object as the default export: `export default {type: ..., name: ..., ...}`.';
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const code = text
    .replace(/^\uFEFF/u, '')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/(^|[^:])\/\/.*$/gmu, '$1')
    .trim();
  if (code === '') return `is empty, so it documents nothing. ${fix}`;
  /** @type {string[]} */
  let names;
  try {
    const mod = await LOADERS[options.loader ?? 'user'](file);
    names = Object.keys(mod ?? {}).filter(name => name !== 'default');
  } catch {
    return null;
  }
  const takes = exported.map(name =>
    name === 'default' ? 'default export' : `\`${name}\` export`,
  );
  const found =
    names.length > 0
      ? ` (it exports ${names.map(name => `\`${name}\``).join(', ')})`
      : ' (it exports nothing)';
  return `has no ${takes.join(' or ')}${found}, so it documents nothing. ${fix}`;
}

/**
 * Load one file as its root reads it: the doc its module exports and, for a
 * component or hook, the translation it exports for `lang`.
 * @param {string} file
 * @param {ReadOptions} options
 * @param {string | null} lang
 * @returns {Promise<import('./compile.mjs').AuthoredFile>}
 */
async function loadAuthored(file, options, lang) {
  const name = path.basename(file);
  if (options.root === 'themes' || options.root === 'icon-definitions') {
    if (!options.readStatic) {
      throw new Error(
        'A theme descriptor or an icon definition is read statically; pass readStatic.',
      );
    }
    try {
      return {file: name, doc: options.readStatic()};
    } catch (error) {
      return {file: name, error};
    }
  }
  let mod;
  try {
    mod = await LOADERS[options.loader ?? 'user'](file);
  } catch (error) {
    return {file: name, error};
  }
  // `a ?? b ?? c`, exactly: the first value that is not null or undefined,
  // else the last one.
  const [first, ...rest] = options.exports ?? DOC_EXPORTS[options.root];
  let doc = mod?.[first];
  for (const key of rest) doc = doc ?? mod?.[key];
  const overlay =
    lang && (options.root === 'components' || options.root === 'hooks')
      ? translationFor(mod, lang)
      : null;
  return overlay ? {file: name, doc, overlay} : {file: name, doc};
}

/**
 * Freeze a value and everything in it.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// ── Doc topics ─────────────────────────────────────────────────────────────

/** The localized overlays a docs read can apply. */
export const OVERLAY_LANGUAGES = ['zh', 'dense'];

/**
 * Where the `lang` overlay of a doc file lives: `{topic}.doc.{lang}.mjs`.
 * @param {string} docPath
 * @param {string} lang
 * @returns {string}
 */
export function overlayPath(docPath, lang) {
  return path.join(
    path.dirname(docPath),
    `${path.basename(docPath, '.doc.mjs')}.doc.${lang}.mjs`,
  );
}

/**
 * The overlay languages a topic ships for its own file or any extension.
 * @param {import('../discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @returns {string[]}
 */
export function overlayLanguages(entry) {
  const files = [entry.path, ...entry.extensions.map(ext => ext.path)];
  return OVERLAY_LANGUAGES.filter(lang =>
    files.some(file => fs.existsSync(overlayPath(file, lang))),
  );
}

/**
 * Load one topic file and the overlay for `lang`. A failure is recorded on the
 * result, not thrown, so the compiler reports it in reading order.
 * @param {string} docPath
 * @param {string | null} lang
 * @returns {Promise<import('./compile.mjs').AuthoredFile>}
 */
export async function loadTopicFile(docPath, lang) {
  const file = path.basename(docPath);
  let doc;
  try {
    const mod = await importNativeModule(docPath);
    doc = parseReadableDoc(mod.docs ?? mod.default, file);
  } catch (error) {
    return {file, error};
  }
  if (!lang) return {file, doc};
  const translationPath = overlayPath(docPath, lang);
  if (!fs.existsSync(translationPath)) return {file, doc};
  try {
    const translationMod = await importNativeModule(translationPath);
    return {
      file,
      doc,
      overlay: translationMod.docsZh || translationMod.docsDense || null,
    };
  } catch (overlayError) {
    return {file, doc, overlayError};
  }
}

/**
 * Everything the compiler needs for one topic, read from disk.
 * @param {import('../discovery/docs-discovery.mjs').DocsTopicEntry} entry
 * @param {string | null} lang
 * @returns {Promise<import('./compile.mjs').ReferenceTopicInput>}
 */
export async function loadTopicInput(entry, lang) {
  const extensions = [];
  for (const extension of entry.extensions) {
    extensions.push({
      ...(await loadTopicFile(extension.path, lang)),
      provider: extension.package,
      providerId: extension.providerId ?? extension.package,
    });
  }
  return {
    id: entry.name,
    provider: entry.package,
    providerId: entry.providerId ?? entry.package,
    replaces: entry.replaces ?? null,
    lang,
    base: await loadTopicFile(entry.path, lang),
    extensions,
    ...(entry.tree === true ? {tree: true} : {}),
  };
}
