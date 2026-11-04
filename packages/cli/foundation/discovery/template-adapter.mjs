// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared template discovery + IO.
 *
 * Owns everything the template leaves (list/show/skeleton/copy) AND other
 * commands (component, layout, search, init, discover, Doctor integration)
 * share: template discovery across core/external/integration sources, the
 * template-spec loaders, and the cross-command helpers (stripTemplateAssetRefs,
 * findShowcase, findRelatedBlocks, extractComponents, listTemplates). The
 * `api/template/template.mjs` barrel re-exports the public helpers so external
 * import paths keep working unchanged.
 *
 * Lives in foundation rather than under api/template because foundation itself
 * needs it: `Project` assembles templates from it. While this sat in api/, that
 * made a cycle across the layer boundary — Project reached up for discovery and
 * this module imported Project back. Nothing here depends on api/; every import
 * is node:*, jiti, foundation/*, or authoring/*, plus a lazily required
 * @babel/parser for extractComponents' local-declaration scan.
 *
 * @position packages/cli/foundation/discovery — shared template discovery/IO;
 *   consumed by Project and by the api/template leaves.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {readDocView} from '../doc-compiler/read.mjs';
import {importDocModule} from '../doc-compiler/import.mjs';
import {CLI_ROOT, discoverExternalPackages} from '../fs/paths.mjs';
import {CORE_PROVIDER_ID} from '../identity/providers.mjs';
import {Project} from '../config/project.mjs';
import {
  isReference,
  parseTemplateSource,
  programPath,
  traverseTemplateSource,
  writtenNames,
} from './template-source-tree.mjs';

const require = createRequire(import.meta.url);

/** Identity used for core (built-in) templates in package-scoped listings. */
const CORE_PACKAGE = CORE_PROVIDER_ID;

/**
 * Identity for a template in package-scoped views. Core (built-in) templates
 * have no `package` field; report them under @astryxdesign/core.
 * @param {{package?: string}} t
 * @returns {string}
 */
export function pkgOf(t) {
  return t.package ?? CORE_PACKAGE;
}

/**
 * Every id that should resolve to a discovered template. Replacements keep
 * their own integration id and also own the Core id they replace.
 * @param {{dirName: string, replaces?: string}} template
 * @returns {string[]}
 */
export function templateLookupIds(template) {
  if (template.replaces && template.replaces !== template.dirName) {
    return [template.dirName, template.replaces];
  }
  return [template.dirName];
}

/**
 * Remove entries shadowed in the default discovery view while retaining them in
 * package-scoped views. An active replacement owns its target id. A rejected
 * same-id declaration falls back to Core when a Core template of the same kind
 * owns that id; otherwise the integration template remains available by kind.
 * @param {DiscoveredTemplate[]} templates
 * @returns {DiscoveredTemplate[]}
 */
export function effectiveTemplateDiscovery(templates) {
  const activeTargets = new Set(
    templates
      .filter(template => template.replaces != null)
      .map(template => `${template.type}:${template.replaces}`),
  );
  const coreIds = new Set(
    templates
      .filter(template => pkgOf(template) === CORE_PACKAGE)
      .map(template => `${template.type}:${template.dirName}`),
  );
  return templates.filter(template => {
    if (
      template.replacementRejected &&
      template.replacementTarget === template.dirName &&
      coreIds.has(`${template.type}:${template.dirName}`)
    ) {
      return false;
    }
    return (
      !activeTargets.has(`${template.type}:${template.dirName}`) ||
      template.replaces != null
    );
  });
}

/**
 * A discovered template (page or block), normalized across core, external, and
 * integration sources. Not every source populates every field, so
 * source-specific extras (`aspectRatio`, `isShowcase`, `package`) are optional.
 * @typedef {object} DiscoveredTemplate
 * @property {'page'|'block'} type
 * @property {string} dirName
 * @property {string} name
 * @property {string} [displayName]
 * @property {string} description
 * @property {string[]} [keywords]
 * @property {string} [category]
 * @property {boolean} [isReady]
 * @property {boolean} [scaffold]
 * @property {number} [aspectRatio]
 * @property {string} [exampleFor]
 * @property {string[]} [alsoExampleFor]
 * @property {string[]} [alsoShowcaseFor]
 * @property {string[]} [componentsUsed]
 * @property {Record<string, string>} [icons] the icon definition each
 *   imported icon draws, by its imported name
 * @property {boolean} [isShowcase]
 * @property {string} filePath
 * @property {string} docPath
 * @property {string} [package]
 * @property {boolean} [autolinked] whether the owning integration was discovered
 *   from package.json rather than named in astryx.config
 * @property {string} [replaces] active Core template id this integration template replaces
 * @property {boolean} [replacementRejected] whether an invalid declaration was disabled
 * @property {string} [replacementTarget] disabled declaration target
 */

/**
 * An integration-template discovery error.
 * @typedef {object} TemplateDiscoveryError
 * @property {string} package
 * @property {string} [template]
 * @property {string} message
 * @property {string} [code]
 * @property {'warning' | 'error'} [severity]
 * @property {string} [replacementTarget] Core target whose replacement set is invalid
 * @property {boolean} [autolinked] whether the declaration came from an autolinked integration
 */

/**
 * A semantic error in an integration template replacement declaration.
 * @typedef {TemplateDiscoveryError & {code: 'missing_template_replacement_target' | 'ambiguous_template_replacement' | 'invalid_template_replacement', severity: 'warning' | 'error'}} TemplateReplacementError
 */

/**
 * The loaded metadata object from a template spec (loose — authored shape).
 * @typedef {Record<string, any> | undefined | null} TemplateDocModule
 */

/**
 * Released compatibility suffixes, in precedence order. Stable 0.6.0
 * documented `.template.*`, so discovery keeps reading those files while all
 * new authoring uses `.doc.mjs`.
 */
const TEMPLATE_SUFFIXES = ['.template.ts', '.template.mjs', '.template.js'];

/**
 * Descriptor suffixes for templates, in precedence order. New authoring always
 * emits `.doc.mjs`; the TypeScript and JavaScript variants remain readable.
 */
const DOC_SUFFIXES = ['.doc.ts', '.doc.mjs', '.doc.js'];

/**
 * Every template-spec suffix, in the released precedence a core page directory
 * uses to pick one file. Integration discovery never picks: every match is a
 * template, so two specs for one stem list twice and read as ambiguous.
 */
const ALL_TEMPLATE_SUFFIXES = [...TEMPLATE_SUFFIXES, ...DOC_SUFFIXES];

/**
 * The template-spec suffix present on `file`, or null if none matches.
 * Recognizes both the canonical `.doc.*` and released `.template.*` families.
 * @param {string} file
 * @returns {string | null}
 */
function matchedTemplateSuffix(file) {
  return ALL_TEMPLATE_SUFFIXES.find(suffix => file.endsWith(suffix)) ?? null;
}

/**
 * RegExp matching either template-spec suffix family at end of a basename.
 * Used where a per-file regex is convenient (e.g. block discovery walks).
 */
const TEMPLATE_SUFFIX_RE = /\.(template|doc)\.(ts|mjs|js)$/;

/**
 * Load an integration template doc module and validate it against the template
 * envelope at the load boundary. Default export only — `.ts` via jiti,
 * `.mjs`/`.js` via dynamic import. Throws (caught by discovery) if the default
 * export is missing or fails {@link parseTemplate}. NOTE: the built-in
 * core templates use `export const doc = {...}` and are loaded by a different
 * function ({@link loadDocModule}) — this path is for INTEGRATION templates.
 *
 * @param {string} file
 * @param {string} [label]
 */
async function loadIntegrationDoc(file, label) {
  return readDocView(file, {
    root: 'templates',
    exports: ['default'],
    label: label ?? file,
    strict: true,
    value: 'parsed',
  });
}

const TEMPLATES_DIR = path.join(CLI_ROOT, 'assets', 'templates');
const PAGES_DIR = path.join(TEMPLATES_DIR, 'pages');
const BLOCKS_DIR = path.join(TEMPLATES_DIR, 'blocks');

/**
 * Inline placeholder swapped in for demo imagery when scaffolding a template,
 * so scaffolded pages render with zero setup (see stripTemplateAssetRefs).
 * Neutral hex colors (not design tokens) so it renders in any project, themed
 * or not. Mirrors apps/docsite/public/template-assets/placeholder.svg.
 */
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20400%20300%22%20preserveAspectRatio%3D%22xMidYMid%20slice%22%3E%3Crect%20width%3D%22400%22%20height%3D%22300%22%20fill%3D%22%23f5f6f8%22%2F%3E%3Cg%20transform%3D%22translate%28200%20150%29%22%20fill%3D%22none%22%20stroke%3D%22%23c2cad6%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%22-44%22%20y%3D%22-44%22%20width%3D%2288%22%20height%3D%2288%22%20rx%3D%2216%22%2F%3E%3Ccircle%20cx%3D%2218%22%20cy%3D%22-18%22%20r%3D%222.5%22%20fill%3D%22%23c2cad6%22%20stroke%3D%22none%22%2F%3E%3Cpath%20d%3D%22M-34%2030%20L-8%200%20L10%2018%20L20%208%20L34%2024%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E';

/**
 * Extensions that need a video-safe placeholder rather than the image data
 * URI (see stripTemplateAssetRefs). There's no equivalent self-contained
 * inline placeholder for video: unlike an SVG data URI, a `<video src>`
 * needs actual encoded media, and hand-authoring a valid tiny MP4/WebM
 * blob isn't something we can do reliably here — an unverifiable, possibly
 * still-broken binary would just trade one silent failure for another.
 * Rather than mis-render image data as video (the original bug) or guess at
 * binary bytes, video sources are stripped to an empty string so the
 * scaffolded example is honest about needing the builder to supply their
 * own file, instead of silently pointing at something that can't play.
 *
 * @type {Set<string>}
 */
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'ogv', 'm4v']);

/**
 * A video placeholder that names itself in the source, for a copy that has no
 * response to disclose the replacement in, such as the shadcn install. It is a
 * text data URL: it makes no request, it does not play, and it is not image
 * data, so a video element never receives image bytes.
 */
export const MARKED_VIDEO_PLACEHOLDER = 'data:,placeholder-video-add-your-own';

const IMAGE_EXTENSIONS = new Set([
  'svg',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
]);

/**
 * First path segment of every Astryx template fixture. Template demo imagery
 * is self-hosted under the docsite's `/template-assets/*` dir (committed there,
 * mirrored into the sandbox preview by scripts/sync-templates.js), so those
 * paths only resolve inside the Astryx docsite/sandbox and are replaced on
 * scaffold. Only a root-relative URL whose first segment this is counts: the
 * same text inside a third-party URL or a product path is left untouched.
 */
const FIXTURE_SEGMENT = 'template-assets';

/** Characters that end a URL token in template source, besides whitespace. */
const TOKEN_DELIMITERS = new Set([
  "'",
  '"',
  '`',
  '(',
  ')',
  '<',
  '>',
  '{',
  '}',
  '[',
  ']',
  '\\',
  '|',
  '^',
]);

/** The closing delimiter each opening delimiter must pair with. */
const CLOSING_DELIMITERS = new Map([
  ["'", "'"],
  ['"', '"'],
  ['`', '`'],
  ['(', ')'],
]);
const CLOSERS = new Set(CLOSING_DELIMITERS.values());

/** A URL with a scheme: absolute, so never a fixture reference. */
const ABSOLUTE_URL = /^[a-z][a-z\d+.-]*:/iu;

/** What may lead up to the fixture segment inside a relative product path. */
const RELATIVE_PATH_PREFIX = /^[\w.~%@/-]+$/u;

/** Punctuation that ends a sentence or list item after a path in text. */
const PROSE_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?']);

/** `from`, `import` or `require` right before a quoted module specifier. */
const MODULE_SPECIFIER_LEAD = /(?:^|[^\w$])(?:from|import|require)\s*\(?$/u;

/**
 * Normalize path into Unix path (using forward slashes) for consistent comparison
 * across Windows, macOS, and Linux.
 *
 * @param {string} p - The file path to normalize.
 * @returns {string} The normalized Unix path.
 */
function toPosixPath(p) {
  return p.replace(/\\/g, '/');
}

/**
 * Replace each Astryx template fixture reference with a placeholder so
 * scaffolded pages render with zero setup. Images get a self-contained data
 * URI; videos (which have no equivalent inline placeholder — see
 * VIDEO_EXTENSIONS) are stripped to an empty src instead of being
 * mis-replaced with image data. Builders drop in their own media either way.
 *
 * A reference is a URL token that resolves to a root-relative path under
 * FIXTURE_SEGMENT. It is replaced whole, query and fragment included, and
 * classified by the suffix of its last path segment. A reference that cannot
 * be replaced safely throws with its path rather than being guessed at or
 * left behind. Prose is left as written: in text (JSX text, a word inside a
 * longer string) trailing punctuation is not part of a path and a path with
 * no suffix, such as the bare directory, is a mention; inside a comment
 * nothing throws.
 *
 * @param {string} source - Template source code.
 * @returns {string} Source with demo asset references replaced.
 */
export function stripTemplateAssetRefs(source) {
  return replaceDemoMedia(source).source;
}

/**
 * {@link stripTemplateAssetRefs}, plus how many references it replaced: one per
 * replaced reference, however many fixture paths its URL carries (a reference
 * is replaced whole, query included), and none for a prose mention or a
 * third-party URL left as written. That count is what a receipt discloses.
 *
 * @param {string} source - Template source code.
 * @param {{videoPlaceholder?: string}} [options] - `videoPlaceholder` replaces
 *   each video reference; the default is an empty source.
 * @returns {{source: string, demoMediaReplaced: number}}
 */
export function replaceDemoMedia(source, {videoPlaceholder = ''} = {}) {
  const needle = `/${FIXTURE_SEGMENT}`;
  let output = '';
  let copied = 0;
  let demoMediaReplaced = 0;
  /** @type {Array<[number, number]> | undefined} */
  let comments;
  let at = source.indexOf(needle);
  while (at !== -1) {
    let start = at;
    while (start > 0 && !isTokenDelimiter(source[start - 1])) start--;
    let end = at + needle.length;
    while (end < source.length && !isTokenDelimiter(source[end])) end++;
    /** @type {{text: string, end: number} | null} */
    let edit;
    try {
      edit = fixtureEdit(source, start, at, end, videoPlaceholder);
    } catch (err) {
      comments ??= commentRanges(source);
      if (!comments.some(([from, to]) => from <= at && at < to)) throw err;
      edit = null;
    }
    if (edit) {
      output += source.slice(copied, start) + edit.text;
      copied = edit.end;
      demoMediaReplaced += 1;
    }
    at = source.indexOf(needle, end);
  }
  return {source: output + source.slice(copied), demoMediaReplaced};
}

/**
 * The one module docs-only demo content is imported from. A template imports
 * an element such as a playing card's face from here so its live preview shows
 * real-looking content; the module exists only where Astryx's own previews
 * build templates, so a copy replaces every element imported from it (see
 * {@link replaceDemoContent}).
 */
export const DEMO_CONTENT_MODULE = '@astryx-docs/demo-content';

/** What a demo-content element becomes in emitted source. */
const DEMO_CONTENT_PLACEHOLDER_TEXT = 'Card content';

/** Where emitted placeholders import Text from, as catalog templates do. */
const TEXT_MODULE = '@astryxdesign/core/Text';

/** The modules an existing Astryx Text import can come from. */
const TEXT_MODULES = new Set([TEXT_MODULE, '@astryxdesign/core']);

/** The local name a new Text import takes when the file already writes `Text`. */
const TEXT_ALIAS = 'AstryxText';

/**
 * Replace each JSX element imported from {@link DEMO_CONTENT_MODULE} with a
 * generic `<Text>` placeholder and remove that import, so emitted source never
 * depends on content only Astryx's previews provide. An element that wraps one
 * element, such as a hint shown under a demo, is removed instead: its child
 * takes its place, with the indentation the child would have had without it.
 * `demoContentReplaced` counts the placeholders, because only they need the
 * consumer's own content.
 *
 * Every check resolves a name to its binding through the module's scope, so a
 * local declaration or parameter with the same name never counts as the same
 * variable. The placeholder uses an existing Text import from Astryx when that
 * import is the binding its name resolves to at every replaced element. Else
 * the placeholder imports Text, under a unique alias when the file already
 * writes the name `Text`.
 *
 * Only a plain static use is replaced: a named import used only as a JSX tag
 * whose children are whitespace or one element, and whose props are literal values or
 * read only bindings that code outside the replaced elements still reads. So
 * `faceDown={!isOpen}` is safe when the same `isOpen` is also read elsewhere.
 * Anything else (a namespace or type import, a re-export, a dynamic import, the
 * element used as a value or a type, a spread or computed prop, a prop whose
 * binding nothing else reads, other children) throws, naming the element, rather than
 * leaving a reference behind, leaving a binding unused, or dropping code the
 * rest of the file relies on. Source that never names the module is returned
 * as is.
 *
 * @param {string} source - Template source code.
 * @returns {{source: string, demoContentReplaced: number}}
 */
export function replaceDemoContent(source) {
  if (!source.includes(DEMO_CONTENT_MODULE)) {
    return {source, demoContentReplaced: 0};
  }
  /** @type {any} */
  let file;
  try {
    file = parseTemplateSource(source);
  } catch (err) {
    throw unsafeDemoContent(
      `the source does not parse (${/** @type {Error} */ (err).message})`,
    );
  }

  /** @type {any[]} */
  const demoImports = [];
  for (const statement of file.program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.source.value !== DEMO_CONTENT_MODULE
    ) {
      continue;
    }
    if (statement.importKind === 'type') {
      throw unsafeDemoContent('it is imported as a type');
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.importKind === 'type'
      ) {
        throw unsafeDemoContent(
          'only named value imports can be replaced; import each element by name',
        );
      }
    }
    demoImports.push(statement);
  }

  const program = programPath(file);
  const demoBindings = new Set(
    demoImports.flatMap(statement =>
      statement.specifiers.map((/** @type {any} */ specifier) =>
        program.scope.getBinding(specifier.local.name),
      ),
    ),
  );
  /** The paths of the JSX elements to replace. */
  /** @type {any[]} */
  const elements = [];
  traverseTemplateSource(file, {
    StringLiteral(/** @type {any} */ path) {
      if (
        path.node.value === DEMO_CONTENT_MODULE &&
        !(path.parentPath.isImportDeclaration() && path.key === 'source')
      ) {
        throw unsafeDemoContent(
          'it is used outside a static import (a re-export, dynamic import, require, or string value)',
        );
      }
    },
    TemplateLiteral(/** @type {any} */ path) {
      if (
        path.node.quasis.some((/** @type {any} */ quasi) =>
          quasi.value.cooked?.includes(DEMO_CONTENT_MODULE),
        )
      ) {
        throw unsafeDemoContent('it is used outside a static import');
      }
    },
    'Identifier|JSXIdentifier'(/** @type {any} */ path) {
      const {node, parentPath} = path;
      if (!demoBindings.has(path.scope.getBinding(node.name))) return;
      if (!isReference(node, path.parent, path.listKey ?? path.key)) return;
      if (path.key === 'name' && parentPath.isJSXOpeningElement()) {
        elements.push(parentPath.parentPath);
        return;
      }
      if (path.key === 'name' && parentPath.isJSXClosingElement()) return;
      if (parentPath.isJSXMemberExpression()) {
        throw unsafeDemoContent(`${node.name} is used as a namespace`);
      }
      throw unsafeDemoContent(
        `${node.name} is used as a value, not only as a JSX element`,
      );
    },
  });

  const wrappers = elements.filter(
    element => wrappedElement(element.node) !== null,
  );
  if (wrappers.length > 0) {
    return replaceDemoContent(unwrapDemoWrappers(source, wrappers));
  }

  /** @param {any} node */
  const isReplaced = node =>
    elements.some(
      element =>
        element.node.start <= node.start && node.end <= element.node.end,
    );
  for (const element of elements) {
    for (const variable of assertStaticDemoElement(element.node)) {
      const binding = element.scope.getBinding(variable);
      // An unbound name is a global: removing its read leaves nothing unused.
      if (!binding || isExportedDeclaration(binding)) continue;
      if (
        binding.referencePaths.every((/** @type {any} */ ref) =>
          isReplaced(ref.node),
        )
      ) {
        throw unsafeDemoContent(
          `<${element.node.openingElement.name.name}> reads ${variable}, and nothing else in the file reads it, so the copy would leave it unused`,
        );
      }
    }
  }

  const reused =
    elements.length === 0 ? null : astryxTextAtEvery(file, program, elements);
  const written = writtenNames(file);
  const textName =
    reused ?? (written.has('Text') ? uniqueName(TEXT_ALIAS, written) : 'Text');
  const textImport =
    elements.length > 0 && reused === null
      ? `import {${textName === 'Text' ? 'Text' : `Text as ${textName}`}} from '${TEXT_MODULE}';\n`
      : '';
  const placeholder = `<${textName}>${DEMO_CONTENT_PLACEHOLDER_TEXT}</${textName}>`;

  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = elements.map(element => ({
    start: element.node.start,
    end: element.node.end,
    text: placeholder,
  }));
  demoImports.forEach((statement, index) => {
    let end = statement.end;
    if (source[end] === '\n') end += 1;
    edits.push({
      start: statement.start,
      end,
      text: index === 0 ? textImport : '',
    });
  });
  edits.sort((a, b) => b.start - a.start);
  let output = source;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return {source: output, demoContentReplaced: elements.length};
}

/**
 * The local name of an Astryx Text import that is the binding its name
 * resolves to at every element, or null when no such import exists.
 * @param {any} file
 * @param {any} program - The program path, from {@link programPath}.
 * @param {any[]} elements - Element paths.
 * @returns {string | null}
 */
function astryxTextAtEvery(file, program, elements) {
  for (const statement of file.program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type' ||
      !TEXT_MODULES.has(statement.source.value)
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.importKind === 'type' ||
        (specifier.imported.name ?? specifier.imported.value) !== 'Text'
      ) {
        continue;
      }
      const name = specifier.local.name;
      const imported = program.scope.getBinding(name);
      if (
        elements.every(element => element.scope.getBinding(name) === imported)
      ) {
        return name;
      }
    }
  }
  return null;
}

/**
 * Whether a binding is declared in an export, so code outside the file can
 * still read it.
 * @param {any} binding
 */
function isExportedDeclaration(binding) {
  const declaration = binding.path.isVariableDeclarator()
    ? binding.path.parentPath
    : binding.path;
  return Boolean(declaration.parentPath?.isExportDeclaration());
}

/**
 * `base`, or `base` with the first number from 2 that makes it a name the
 * file does not write.
 * @param {string} base
 * @param {Set<string>} written
 */
function uniqueName(base, written) {
  let name = base;
  for (let n = 2; written.has(name); n++) name = `${base}${n}`;
  return name;
}

/**
 * Replace each outermost demo-content wrapper with the element it wraps.
 * Wrappers inside a kept child go on the next pass, when they are outermost.
 * Throws when a wrapper's prop reads a binding that nothing outside the
 * wrappers' opening tags reads, so the removal would leave it unused.
 * @param {string} source
 * @param {any[]} wrappers - Element paths whose element wraps one element.
 * @returns {string}
 */
function unwrapDemoWrappers(source, wrappers) {
  /** @param {any} node */
  const isInWrapperTag = node =>
    wrappers.some(
      wrapper =>
        wrapper.node.openingElement.start <= node.start &&
        node.end <= wrapper.node.openingElement.end,
    );
  for (const wrapper of wrappers) {
    for (const variable of staticPropReads(wrapper.node)) {
      const binding = wrapper.scope.getBinding(variable);
      if (!binding || isExportedDeclaration(binding)) continue;
      if (
        binding.referencePaths.every((/** @type {any} */ ref) =>
          isInWrapperTag(ref.node),
        )
      ) {
        throw unsafeDemoContent(
          `<${wrapper.node.openingElement.name.name}> reads ${variable}, and nothing else in the file reads it, so the copy would leave it unused`,
        );
      }
    }
  }
  const outermost = wrappers.filter(
    wrapper =>
      !wrappers.some(
        other =>
          other !== wrapper &&
          other.node.start <= wrapper.node.start &&
          wrapper.node.end <= other.node.end,
      ),
  );
  let output = source;
  for (const wrapper of outermost.sort((a, b) => b.node.start - a.node.start)) {
    output =
      output.slice(0, wrapper.node.start) +
      dedentedChild(source, wrapper) +
      output.slice(wrapper.node.end);
  }
  return output;
}

/**
 * The source of the element a wrapper holds, with each of its later lines
 * moved left by the indent the wrapper added. A line that starts inside a
 * string keeps its whitespace, because that whitespace is part of the value.
 * @param {string} source
 * @param {any} wrapper - An element path whose element wraps one element.
 * @returns {string}
 */
function dedentedChild(source, wrapper) {
  const child = /** @type {any} */ (wrappedElement(wrapper.node));
  /** @param {number} offset */
  const indentOfLine = offset => {
    const lineStart = source.lastIndexOf('\n', offset - 1) + 1;
    return /^[ \t]*/u.exec(source.slice(lineStart))?.[0].length ?? 0;
  };
  const depth = indentOfLine(child.start) - indentOfLine(wrapper.node.start);
  /** @type {any[]} */
  const strings = [];
  wrapper.traverse({
    'StringLiteral|TemplateLiteral'(/** @type {any} */ path) {
      strings.push(path.node);
    },
  });
  const leadingIndent = new RegExp(`^[ \\t]{0,${Math.max(depth, 0)}}`, 'u');
  let lineStart = child.start;
  return source
    .slice(child.start, child.end)
    .split('\n')
    .map((line, index) => {
      const start = lineStart;
      lineStart += line.length + 1;
      if (
        index === 0 ||
        strings.some(string => string.start < start && start < string.end)
      ) {
        return line;
      }
      return line.replace(leadingIndent, '');
    })
    .join('\n');
}

/**
 * The one element a demo-content element wraps, or null when its children are
 * only whitespace. Throws for any other children.
 * @param {any} element
 * @returns {any}
 */
function wrappedElement(element) {
  const content = element.children.filter(
    (/** @type {any} */ child) =>
      !(child.type === 'JSXText' && child.value.trim() === ''),
  );
  if (content.length === 0) return null;
  if (
    content.length === 1 &&
    (content[0].type === 'JSXElement' || content[0].type === 'JSXFragment')
  ) {
    return content[0];
  }
  throw unsafeDemoContent(
    `<${element.openingElement.name.name}> has children other than one element`,
  );
}

/**
 * Throw unless a demo-content element can be replaced without dropping code:
 * each prop a literal or a read of variables (see {@link staticPropReads}),
 * and no children but whitespace.
 * @param {any} element
 * @returns {string[]} The variables its props read.
 */
function assertStaticDemoElement(element) {
  const variables = staticPropReads(element);
  for (const child of element.children) {
    if (child.type === 'JSXText' && child.value.trim() === '') continue;
    throw unsafeDemoContent(
      `<${element.openingElement.name.name}> has children`,
    );
  }
  return variables;
}

/**
 * Throw unless each prop of a demo-content element is a literal or a read of
 * variables (see {@link isVariableRead}).
 * @param {any} element
 * @returns {string[]} The variables its props read.
 */
function staticPropReads(element) {
  const name = element.openingElement.name.name;
  /** @type {string[]} */
  const variables = [];
  for (const attribute of element.openingElement.attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      throw unsafeDemoContent(`<${name}> spreads props`);
    }
    const value = attribute.value;
    if (value === null || value.type === 'StringLiteral') continue;
    if (
      value.type === 'JSXExpressionContainer' &&
      (isLiteralExpression(value.expression) ||
        isVariableRead(value.expression, variables))
    ) {
      continue;
    }
    throw unsafeDemoContent(
      `<${name}> prop ${attribute.name.name ?? ''} is not a literal value or a variable read`,
    );
  }
  return variables;
}

/**
 * Whether an expression only reads variables: a variable, a non-computed
 * property of one, or its negation. Removing such a read runs no code. Adds
 * each variable it reads to `variables`.
 * @param {any} node
 * @param {string[]} variables
 * @returns {boolean}
 */
function isVariableRead(node, variables) {
  switch (node.type) {
    case 'Identifier':
      variables.push(node.name);
      return true;
    case 'MemberExpression':
      return !node.computed && isVariableRead(node.object, variables);
    case 'UnaryExpression':
      return node.operator === '!' && isVariableRead(node.argument, variables);
    default:
      return false;
  }
}

/** @param {any} node */
function isLiteralExpression(node) {
  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return node.operator === '-' && node.argument.type === 'NumericLiteral';
    default:
      return false;
  }
}

/** @param {string} reason */
function unsafeDemoContent(reason) {
  return new Error(
    `Demo content from ${DEMO_CONTENT_MODULE} cannot be replaced safely: ${reason}. Use each element as a JSX tag with no children or with one element child, and give each prop a literal or a variable the file also reads elsewhere.`,
  );
}

/**
 * Replace everything in a template that only Astryx's previews provide, in
 * the order a copy applies it: demo-content elements
 * ({@link replaceDemoContent}), then demo media ({@link replaceDemoMedia}).
 * Both counts are what a receipt discloses.
 *
 * @param {string} source - Template source code.
 * @param {{videoPlaceholder?: string}} [options] - As {@link replaceDemoMedia}.
 * @returns {{source: string, demoContentReplaced: number, demoMediaReplaced: number}}
 */
export function replaceTemplateDemos(source, options) {
  const {source: withContent, demoContentReplaced} = replaceDemoContent(source);
  const {source: output, demoMediaReplaced} = replaceDemoMedia(
    withContent,
    options,
  );
  return {source: output, demoContentReplaced, demoMediaReplaced};
}

/** @param {string | undefined} char */
function isTokenDelimiter(char) {
  return char === undefined || /\s/u.test(char) || TOKEN_DELIMITERS.has(char);
}

/**
 * Whitespace, the source edge, or a tag bracket: what bounds a word of text.
 * @param {string | undefined} char
 */
function isTextDelimiter(char) {
  return char === undefined || /\s/u.test(char) || char === '<' || char === '>';
}

/**
 * The path segments of a root-relative URL under FIXTURE_SEGMENT, or null.
 * @param {string} reference
 * @returns {string[] | null}
 */
function fixtureSegments(reference) {
  if (!reference.startsWith('/') || reference.startsWith('//')) return null;
  const segments = new URL(reference, 'http://template.invalid').pathname.split(
    '/',
  );
  return segments[1] === FIXTURE_SEGMENT ? segments : null;
}

/**
 * The replacement for the fixture reference in the URL token [start, end),
 * which contains FIXTURE_SEGMENT's path at `at`; null when the token is not a
 * fixture reference or is a prose mention.
 * @param {string} source
 * @param {number} start
 * @param {number} at
 * @param {number} end
 * @param {string} videoPlaceholder
 * @returns {{text: string, end: number} | null}
 */
function fixtureEdit(source, start, at, end, videoPlaceholder) {
  const token = source.slice(start, end);
  if (ABSOLUTE_URL.test(token)) return null;
  if (!token.startsWith('/')) {
    if (!fixtureSegments(source.slice(at, end))) return null;
    if (
      source[start - 1] !== '\\' &&
      RELATIVE_PATH_PREFIX.test(source.slice(start, at))
    ) {
      return null;
    }
    throw unsafeFixtureReference(
      source,
      at,
      'it is joined to text the copy cannot parse',
    );
  }

  const before = source[start - 1];
  const after = source[end];
  if (after === '{' && token.endsWith('$')) {
    if (!fixtureSegments(token.slice(0, -1))) return null;
    throw unsafeFixtureReference(
      source,
      at,
      'it is built by a template-literal interpolation',
    );
  }
  const quoted =
    before !== undefined && CLOSING_DELIMITERS.get(before) === after;
  const escapedQuoted =
    (before === "'" || before === '"') &&
    source[start - 2] === '\\' &&
    after === '\\' &&
    source[end + 1] === before;
  const whole = quoted || escapedQuoted;
  let referenceEnd = end;
  if (!whole) {
    while (
      referenceEnd > at &&
      PROSE_PUNCTUATION.has(source[referenceEnd - 1])
    ) {
      referenceEnd--;
    }
  }
  const segments = fixtureSegments(source.slice(start, referenceEnd));
  if (!segments) return null;

  const inText =
    (isTextDelimiter(before) || CLOSING_DELIMITERS.has(before)) &&
    (isTextDelimiter(after) || CLOSERS.has(after)) &&
    (isTextDelimiter(before) || isTextDelimiter(after));
  if (!whole && !inText) {
    throw unsafeFixtureReference(
      source,
      at,
      'it is not a whole quoted, url(), or text value',
    );
  }
  if (quoted && before !== '(') {
    const use = expressionUse(source, start - 1, end);
    if (use) throw unsafeFixtureReference(source, at, use);
  }

  const ext = path.posix
    .extname(segments[segments.length - 1])
    .slice(1)
    .toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) {
    return {text: videoPlaceholder, end: referenceEnd};
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return {text: PLACEHOLDER_IMAGE, end: referenceEnd};
  }
  if (whole || ext) {
    throw new Error(
      `Unrecognized template asset format ${ext || '(none)'} for ${displayReference(source, at)}`,
    );
  }
  return null;
}

/**
 * Why the string quoted at `open` and `close` cannot be replaced on its own,
 * or null when it is a plain value.
 * @param {string} source
 * @param {number} open
 * @param {number} close
 * @returns {string | null}
 */
function expressionUse(source, open, close) {
  let prev = open - 1;
  while (prev >= 0 && /\s/u.test(source[prev])) prev--;
  let next = close + 1;
  while (next < source.length && /\s/u.test(source[next])) next++;
  if (
    source[prev] === '+' ||
    (source[prev] === '=' && source[prev - 1] === '+') ||
    source[next] === '+'
  ) {
    return 'the string is concatenated with another value';
  }
  if (source[next] === '.' && /[A-Za-z_$]/u.test(source[next + 1] ?? '')) {
    return 'a method is called on the string';
  }
  if (
    MODULE_SPECIFIER_LEAD.test(source.slice(Math.max(0, prev - 16), prev + 1))
  ) {
    return 'it is imported as a module';
  }
  return null;
}

/** @type {typeof import('@babel/parser') | undefined} */
let babelParser;

/**
 * The template source parser, loaded on first use so listing templates
 * never pays for it.
 * @returns {typeof import('@babel/parser')}
 */
function templateSourceParser() {
  babelParser ??= require('@babel/parser');
  return /** @type {typeof import('@babel/parser')} */ (babelParser);
}

/**
 * The [start, end) range of every comment in `source`, or none when it does
 * not parse as TSX.
 * @param {string} source
 * @returns {Array<[number, number]>}
 */
function commentRanges(source) {
  try {
    const {comments} = templateSourceParser().parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    return (comments ?? []).map(
      comment =>
        /** @type {[number, number]} */ ([
          comment.start ?? 0,
          comment.end ?? 0,
        ]),
    );
  } catch {
    return [];
  }
}

/**
 * The fixture path at `at`, up to the next whitespace, quote, or tag bracket.
 * @param {string} source
 * @param {number} at
 */
function displayReference(source, at) {
  let end = at;
  while (end < source.length && !/[\s'"`<>]/u.test(source[end])) end++;
  return source.slice(at, end);
}

/**
 * @param {string} source
 * @param {number} at
 * @param {string} reason
 */
function unsafeFixtureReference(source, at, reason) {
  return new Error(
    `Template asset reference ${displayReference(source, at)} cannot be replaced safely: ${reason}. Use the complete path as one static string.`,
  );
}
/**
 * Load a template-spec module and return its metadata object. Supports both
 * families of suffix:
 *   - Canonical `.doc.*` specs may export the stamped object (`type: 'page' |
 *     'block'`) as the default export or use the historical named `doc` export.
 *   - Released `.template.*` compatibility specs use the same object shape.
 * Prefers the default export, falling back to the named `doc` export. `.ts` is
 * loaded via jiti; `.mjs`/`.js` via a
 * native dynamic import. Returns null if the file does not exist.
 *
 * @param {string} docPath absolute path to the spec file
 * @returns {Promise<TemplateDocModule>}
 */
async function loadDocModule(docPath) {
  if (!fs.existsSync(docPath)) return null;
  return readDocView(docPath, {root: 'templates', loader: 'template'});
}

/**
 * List the core page-template directory names (sorted). The `template --list`
 * view discovers far more; this is the minimal core-page set `init` scaffolds
 * from.
 * @returns {string[]}
 */
export function listTemplates() {
  /** @type {string[]} */
  const all = [];
  if (fs.existsSync(PAGES_DIR)) {
    all.push(
      ...fs
        .readdirSync(PAGES_DIR, {withFileTypes: true})
        .filter(e => e.isDirectory())
        .map(e => e.name),
    );
  }
  return all.sort();
}

/**
 * @param {string} dir
 * @param {RegExp} pattern
 * @returns {string[]}
 */
function findDocFiles(dir, pattern) {
  /** @type {string[]} */
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findDocFiles(full, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Resolve the template-spec file for a core page directory: the first existing
 * metadata file in {@link ALL_TEMPLATE_SUFFIXES} precedence, or null.
 * @param {string} dirPath
 * @returns {string | null}
 */
export function findPageDocFile(dirPath) {
  for (const suffix of ALL_TEMPLATE_SUFFIXES) {
    const candidate = path.join(dirPath, `template${suffix}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function discoverPages() {
  if (!fs.existsSync(PAGES_DIR)) return [];
  const dirs = fs
    .readdirSync(PAGES_DIR, {withFileTypes: true})
    .filter(e => e.isDirectory());

  /** @type {DiscoveredTemplate[]} */
  const templates = [];
  for (const dir of dirs) {
    const dirPath = path.join(PAGES_DIR, dir.name);
    const docPath =
      findPageDocFile(dirPath) ?? path.join(dirPath, 'template.doc.mjs');
    const doc = await loadDocModule(docPath);
    templates.push({
      type: 'page',
      dirName: dir.name,
      name: doc?.name || dir.name,
      description: doc?.description || '',
      category: doc?.category || '',
      keywords: doc?.keywords ?? [],
      isReady: doc?.isReady ?? true,
      scaffold: doc?.scaffold ?? false,
      ...(doc?.icons ? {icons: doc.icons} : {}),
      filePath: path.join(dirPath, 'page.tsx'),
      docPath,
    });
  }
  return templates;
}

async function discoverBlocks() {
  const docFiles = findDocFiles(BLOCKS_DIR, TEMPLATE_SUFFIX_RE);
  /** @type {DiscoveredTemplate[]} */
  const blocks = [];
  for (const docPath of docFiles) {
    const suffix = matchedTemplateSuffix(docPath);
    if (!suffix) continue;
    const basename = path.basename(docPath, suffix);
    const tsxPath = path.join(path.dirname(docPath), basename + '.tsx');
    if (!fs.existsSync(tsxPath)) continue;
    const doc = await loadDocModule(docPath);
    const relPath = toPosixPath(
      path.relative(BLOCKS_DIR, path.dirname(docPath)),
    );
    blocks.push({
      type: 'block',
      dirName: basename,
      name: doc?.name || basename,
      description: doc?.description || '',
      keywords: doc?.keywords ?? [],
      isReady: doc?.isReady ?? true,
      aspectRatio: doc?.aspectRatio ?? 1,
      componentsUsed: doc?.componentsUsed ?? [],
      ...(doc?.icons ? {icons: doc.icons} : {}),
      isShowcase: doc?.isShowcase ?? false,
      ...(typeof doc?.exampleFor === 'string'
        ? {exampleFor: doc.exampleFor}
        : {}),
      filePath: tsxPath,
      docPath,
      category: relPath,
    });
  }
  return blocks;
}

/**
 * Discover blocks from external packages that declare `astryx.blocks` in
 * their package.json. Same shape as discoverBlocks() output.
 *
 * @param {string} [cwd]
 */
async function discoverExternalBlocks(cwd = process.cwd()) {
  const externals = discoverExternalPackages(cwd);
  /** @type {DiscoveredTemplate[]} */
  const blocks = [];

  for (const ext of externals) {
    if (!ext.blocksDir || !fs.existsSync(ext.blocksDir)) continue;
    const docFiles = findDocFiles(ext.blocksDir, TEMPLATE_SUFFIX_RE);
    for (const docPath of docFiles) {
      const suffix = matchedTemplateSuffix(docPath);
      if (!suffix) continue;
      const basename = path.basename(docPath, suffix);
      const tsxPath = path.join(path.dirname(docPath), basename + '.tsx');
      if (!fs.existsSync(tsxPath)) continue;
      const doc = await loadDocModule(docPath);
      const relPath = toPosixPath(
        path.relative(ext.blocksDir, path.dirname(docPath)),
      );
      blocks.push({
        type: 'block',
        dirName: basename,
        name: doc?.name || basename,
        description: doc?.description || '',
        keywords: doc?.keywords ?? [],
        isReady: doc?.isReady ?? true,
        aspectRatio: doc?.aspectRatio ?? 1,
        componentsUsed: doc?.componentsUsed ?? [],
        ...(doc?.icons ? {icons: doc.icons} : {}),
        isShowcase: doc?.isShowcase ?? false,
        ...(typeof doc?.exampleFor === 'string'
          ? {exampleFor: doc.exampleFor}
          : {}),
        filePath: tsxPath,
        docPath,
        category: relPath,
        package: ext.name,
      });
    }
  }

  return blocks;
}

/**
 * Discover all blocks — core + external packages.
 * @param {string} [cwd]
 * @returns {Promise<DiscoveredTemplate[]>}
 */
async function discoverAllBlocks(cwd = process.cwd()) {
  const [core, external] = await Promise.all([
    discoverBlocks(),
    discoverExternalBlocks(cwd),
  ]);
  return [...core, ...external];
}

/**
 * Discover only the templates built into @astryxdesign/core. Integration
 * authoring checks use this narrower surface so a broken project config or a
 * second integration cannot affect the core-collision result.
 * @returns {Promise<DiscoveredTemplate[]>}
 */
export async function discoverCoreTemplates() {
  const [pages, blocks] = await Promise.all([
    discoverPages(),
    discoverBlocks(),
  ]);
  return [...pages, ...blocks];
}

/**
 * Apply valid integration replacements to a raw template set.
 *
 * One declaration owns its Core target. When different configured packages
 * replace the same target, the later package wins and discovery returns a
 * warning, matching integration-doc replacement order. Multiple declarations
 * inside one package are invalid and fail closed. Missing targets and kind
 * mismatches also fail closed: Core stays selected and every integration
 * template remains addressable by its own id.
 *
 * @param {DiscoveredTemplate[]} templates
 * @param {TemplateDiscoveryError[]} [declarationErrors]
 * @returns {{templates: DiscoveredTemplate[], errors: TemplateReplacementError[]}}
 */
export function applyTemplateReplacements(templates, declarationErrors = []) {
  /** @type {Map<string, DiscoveredTemplate[]>} */
  const coreById = new Map();
  /** @type {Map<string, DiscoveredTemplate[]>} */
  const replacementsByTarget = new Map();

  for (const template of templates) {
    if (pkgOf(template) === CORE_PACKAGE) {
      const matches = coreById.get(template.dirName) ?? [];
      matches.push(template);
      coreById.set(template.dirName, matches);
    }
    if (template.replaces != null) {
      const replacements = replacementsByTarget.get(template.replaces) ?? [];
      replacements.push(template);
      replacementsByTarget.set(template.replaces, replacements);
    }
  }

  const activeReplacements = new Set();
  const replacedCore = new Set();
  /** @type {TemplateReplacementError[]} */
  const errors = declarationErrors.map(error => ({
    ...error,
    code: /** @type {TemplateReplacementError['code']} */ (
      error.code ?? 'invalid_template_replacement'
    ),
    severity: error.severity ?? 'error',
  }));
  /** @param {TemplateReplacementError} error */
  const pushError = error => {
    if (
      errors.some(
        existing =>
          existing.code === error.code &&
          existing.package === error.package &&
          existing.template === error.template &&
          existing.message === error.message,
      )
    ) {
      return;
    }
    errors.push(error);
  };
  for (const [target, replacements] of replacementsByTarget) {
    const targetErrors = errors.filter(
      error => error.replacementTarget === target,
    );
    const hasExplicitIntent =
      replacements.some(replacement => !replacement.autolinked) ||
      targetErrors.some(error => !error.autolinked);
    const contenders = hasExplicitIntent
      ? replacements.filter(replacement => !replacement.autolinked)
      : replacements;
    let targetInvalid = targetErrors.some(
      error =>
        error.severity === 'error' && (!hasExplicitIntent || !error.autolinked),
    );

    /** @type {Map<string, DiscoveredTemplate[]>} */
    const byPackage = new Map();
    for (const replacement of replacements) {
      const pkg = pkgOf(replacement);
      const fromPackage = byPackage.get(pkg) ?? [];
      fromPackage.push(replacement);
      byPackage.set(pkg, fromPackage);
    }
    for (const [pkg, declarations] of byPackage) {
      if (declarations.length < 2) continue;
      if (!hasExplicitIntent || !declarations[0].autolinked) {
        targetInvalid = true;
      }
      const message =
        `${pkg} declares ${declarations.length} templates as replacements for Core ` +
        `template "${target}" (${declarations.map(template => template.dirName).join(', ')}). ` +
        'One package must declare at most one replacement for a Core target.';
      for (const declaration of declarations) {
        pushError({
          code: 'ambiguous_template_replacement',
          severity: 'error',
          package: pkg,
          template: declaration.dirName,
          replacementTarget: target,
          autolinked: declaration.autolinked,
          message,
        });
      }
    }

    const coreMatches = coreById.get(target) ?? [];
    /** @type {Map<DiscoveredTemplate, DiscoveredTemplate>} */
    const coreMatchByReplacement = new Map();
    for (const replacement of replacements) {
      const invalidAffectsTarget =
        !hasExplicitIntent || !replacement.autolinked;
      if (coreMatches.length === 0) {
        if (invalidAffectsTarget) targetInvalid = true;
        pushError({
          code: 'missing_template_replacement_target',
          severity: 'error',
          package: pkgOf(replacement),
          template: replacement.dirName,
          replacementTarget: target,
          autolinked: replacement.autolinked,
          message: `Template "${replacement.dirName}" replaces "${target}", which is not a Core template id.`,
        });
        continue;
      }
      const sameType = coreMatches.filter(
        core => core.type === replacement.type,
      );
      if (sameType.length !== 1) {
        if (invalidAffectsTarget) targetInvalid = true;
        const kinds = coreMatches.map(core => core.type).join(', ');
        pushError({
          code: 'invalid_template_replacement',
          severity: 'error',
          package: pkgOf(replacement),
          template: replacement.dirName,
          replacementTarget: target,
          autolinked: replacement.autolinked,
          message:
            `Template "${replacement.dirName}" is a ${replacement.type} template, but Core ` +
            `template "${target}" is ${kinds || 'not available'}. A replacement must have the same type.`,
        });
        continue;
      }
      coreMatchByReplacement.set(replacement, sameType[0]);
    }

    const validContenders = contenders.filter(replacement =>
      coreMatchByReplacement.has(replacement),
    );
    if (targetInvalid || validContenders.length === 0) continue;

    const replacement = validContenders[validContenders.length - 1];
    const validReplacements = replacements.filter(candidate =>
      coreMatchByReplacement.has(candidate),
    );
    if (validReplacements.length > 1) {
      const autolinkedLost =
        hasExplicitIntent &&
        validReplacements.some(candidate => candidate.autolinked);
      const allAutolinked = validReplacements.every(
        candidate => candidate.autolinked,
      );
      pushError({
        code: 'ambiguous_template_replacement',
        severity: 'warning',
        package: pkgOf(replacement),
        template: replacement.dirName,
        replacementTarget: target,
        autolinked: replacement.autolinked,
        message: autolinkedLost
          ? `Core template "${target}" is replaced by ${validReplacements.map(candidate => pkgOf(candidate)).join(', ')}. ${pkgOf(replacement)} is explicitly configured, so it wins over autolinked integrations.`
          : allAutolinked
            ? `Core template "${target}" is replaced by autolinked dependencies ${validReplacements.map(candidate => pkgOf(candidate)).join(', ')}. ${pkgOf(replacement)} is listed later in package.json dependencies, so it wins. Add the intended package to astryx.config integrations to make precedence explicit.`
            : `Core template "${target}" is replaced by ${validReplacements.map(candidate => pkgOf(candidate)).join(', ')}. ${pkgOf(replacement)} is configured later, so it wins.`,
      });
    }

    activeReplacements.add(replacement);
    const coreMatch = coreMatchByReplacement.get(replacement);
    if (coreMatch) replacedCore.add(coreMatch);
  }

  const effective = templates.flatMap(template => {
    if (replacedCore.has(template)) return [];
    if (template.replaces != null && !activeReplacements.has(template)) {
      const fallback = {
        ...template,
        replacementRejected: true,
        replacementTarget: template.replaces,
      };
      delete fallback.replaces;
      return [fallback];
    }
    return [template];
  });

  return {
    templates: effective.sort((a, b) => a.name.localeCompare(b.name)),
    errors,
  };
}

/**
 * Discover the raw Core, external, and integration template set before
 * replacement declarations are applied.
 * @param {string} [cwd]
 * @returns {Promise<{templates: DiscoveredTemplate[], errors: TemplateDiscoveryError[]}>}
 */
async function discoverAllSources(cwd = process.cwd()) {
  const [core, external, integration] = await Promise.all([
    discoverCoreTemplates(),
    discoverExternalBlocks(cwd),
    discoverIntegrationTemplates(cwd),
  ]);
  return {
    templates: [...core, ...external, ...integration.templates],
    errors: integration.errors,
  };
}

/**
 * Discover every template without hiding replaced Core originals. Internal
 * package-qualified selection uses this view.
 * @param {string} [cwd]
 * @returns {Promise<DiscoveredTemplate[]>}
 */
export async function discoverAllUnresolved(cwd = process.cwd()) {
  return (await discoverAllSources(cwd)).templates.sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Resolve replacement declarations while retaining package-addressable entries
 * that are shadowed or rejected in the default discovery view.
 * @param {string} [cwd]
 * @returns {Promise<{templates: DiscoveredTemplate[], errors: Array<TemplateDiscoveryError | TemplateReplacementError>}>}
 */
async function resolveAllSources(cwd = process.cwd()) {
  const discovered = await discoverAllSources(cwd);
  const replacementErrors = discovered.errors.filter(
    error => error.replacementTarget != null,
  );
  const resolved = applyTemplateReplacements(
    discovered.templates,
    replacementErrors,
  );
  return {
    templates: resolved.templates,
    errors: [
      ...discovered.errors.filter(error => error.replacementTarget == null),
      ...resolved.errors,
    ],
  };
}

/**
 * Discover the resolved catalog before default-view shadowing. Internal
 * package-qualified selection uses this view.
 * @param {string} [cwd]
 * @returns {Promise<DiscoveredTemplate[]>}
 */
export async function discoverAllResolved(cwd = process.cwd()) {
  return (await resolveAllSources(cwd)).templates;
}

/**
 * @param {string} [cwd]
 * @returns {Promise<DiscoveredTemplate[]>}
 */
export async function discoverAll(cwd = process.cwd()) {
  return effectiveTemplateDiscovery(await discoverAllResolved(cwd));
}

/**
 * Like {@link discoverAll} but also returns integration-template discovery and
 * replacement-declaration errors. Use this when the caller wants to warn about
 * malformed integration templates or inactive replacement declarations.
 *
 * @param {string} [cwd]
 * @returns {Promise<{templates: DiscoveredTemplate[], errors: Array<TemplateDiscoveryError | TemplateReplacementError>}>}
 */
export async function discoverAllWithErrors(cwd = process.cwd()) {
  const resolved = await resolveAllSources(cwd);
  return {
    templates: effectiveTemplateDiscovery(resolved.templates),
    errors: resolved.errors,
  };
}

/**
 * Recursively collect integration template-spec files under `root`.
 * Returns absolute paths to files ending in one of ALL_TEMPLATE_SUFFIXES
 * (canonical `.doc.*` or released `.template.*` compatibility files).
 *
 * @param {string} root
 * @returns {string[]}
 */
function findIntegrationDocFiles(root) {
  /** @type {string[]} */
  const results = [];
  if (!fs.existsSync(root)) return results;
  /** @param {string} dir */
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        ALL_TEMPLATE_SUFFIXES.some(suffix => entry.name.endsWith(suffix))
      ) {
        results.push(full);
      }
    }
  };
  walk(root);
  return results;
}

/**
 * Discover templates contributed by configured integrations.
 *
 * For each integration with a resolved `templates` root, every
 * canonical `<id>.doc.{mjs,ts,js}` (or released `<id>.template.{ts,mjs,js}`) file is a
 * template whose id is its path relative to the templates root with the
 * matched suffix stripped (kebab-case, may be nested). The doc's `type`
 * (page|block) decides scaffolding — there is no `/pages` vs `/blocks`
 * requirement. A same-stem sibling source file (`<id>.tsx`) is required; a doc
 * missing its source, or missing `type`, is an integration error and that
 * template is skipped (recorded in `errors`).
 *
 * @param {string} [cwd]
 * @returns {Promise<{templates: DiscoveredTemplate[], errors: TemplateDiscoveryError[]}>}
 */
async function discoverIntegrationTemplates(cwd = process.cwd()) {
  /** @type {DiscoveredTemplate[]} */
  const templates = [];
  /** @type {TemplateDiscoveryError[]} */
  const errors = [];

  let loadedIntegrations;
  try {
    const project = await Project.load(cwd);
    loadedIntegrations =
      /** @type {import('../integrations/integrations.mjs').LoadedIntegration[]} */ (
        project.loadedIntegrations
      );
  } catch (err) {
    // A broken astryx.config (or an integration that fails to load) can't
    // contribute templates. Record it as a discovery error instead of
    // swallowing it silently: a bare `catch {}` also hides unexpected bugs.
    // discoverAll (the no-error variant that `astryx template` uses) and
    // Project.templates() both discard this errors array, so the template
    // command's behavior is unchanged — the full config-error UX still lives
    // in `discover`/`doctor` via Project.issues(). Only callers that opt into
    // errors (discoverAllWithErrors) now see the signal.
    errors.push({
      package: 'astryx.config',
      message: err instanceof Error ? err.message : String(err),
    });
    return {templates, errors};
  }

  for (const integration of loadedIntegrations) {
    // One integration's unreadable root must not cost core or the others theirs.
    try {
      const result = await discoverIntegrationTemplatesForOne(integration);
      templates.push(...result.templates);
      errors.push(...result.errors);
    } catch (err) {
      errors.push({
        package: integration?.name ?? integration?.__spec ?? 'integration',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {templates, errors};
}

/**
 * Report replacement declarations that cannot hold inside one package: two of
 * its templates replacing the same Core target. Cross-package precedence and
 * target checks happen in {@link applyTemplateReplacements}.
 * @param {string} pkg
 * @param {boolean | undefined} autolinked
 * @param {DiscoveredTemplate[]} templates
 * @param {TemplateDiscoveryError[]} errors
 */
function reportSamePackageReplacements(pkg, autolinked, templates, errors) {
  /** @type {Map<string, string[]>} */
  const idsByTarget = new Map();
  for (const template of templates) {
    if (template.replaces == null) continue;
    const ids = idsByTarget.get(template.replaces) ?? [];
    ids.push(template.dirName);
    idsByTarget.set(template.replaces, ids);
  }
  for (const [target, ids] of idsByTarget) {
    if (ids.length < 2) continue;
    const message =
      `${pkg} declares ${ids.length} templates as replacements for Core template ` +
      `"${target}" (${ids.join(', ')}). One package must declare at most one ` +
      'replacement for a Core target.';
    for (const template of ids) {
      errors.push({
        code: 'ambiguous_template_replacement',
        severity: 'error',
        package: pkg,
        autolinked,
        template,
        replacementTarget: target,
        message,
      });
    }
  }
}

/**
 * The fix for a template doc with no same-stem `.tsx`: rename a same-stem
 * source written in another extension, or add the `.tsx`.
 * @param {string} docPath
 * @param {string} sourcePath the `.tsx` it needs
 */
function missingTemplateSourceFix(docPath, sourcePath) {
  const source = path.basename(sourcePath);
  const stem = source.slice(0, -'.tsx'.length);
  const other = ['.jsx', '.js', '.ts', '.mjs']
    .map(extension => `${stem}${extension}`)
    .find(file => fs.existsSync(path.join(path.dirname(sourcePath), file)));
  return other
    ? `Found ${other}, but a template source must be a .tsx file. Fix: rename ${other} to ${source}.`
    : `Fix: add ${source} beside ${path.basename(docPath)}, with the template as its default export.`;
}

/**
 * Discover the templates contributed by a SINGLE integration. Same per-template
 * rules as {@link discoverIntegrationTemplates} (same-stem source required,
 * page|block type required); broken templates are recorded in `errors` rather
 * than thrown. Exposed for `doctor integration validate` and template authoring checks.
 *
 * @param {{name?: string, __spec?: string, __autolinked?: boolean, templates?: string}} integration
 * @returns {Promise<{templates: DiscoveredTemplate[], errors: TemplateDiscoveryError[]}>}
 */
export async function discoverIntegrationTemplatesForOne(integration) {
  /** @type {DiscoveredTemplate[]} */
  const templates = [];
  /** @type {TemplateDiscoveryError[]} */
  const errors = [];

  const root = integration?.templates;
  const pkgLabel = integration?.name ?? integration?.__spec ?? 'integration';
  if (!root || !fs.existsSync(root)) return {templates, errors};

  for (const docPath of findIntegrationDocFiles(root)) {
    const suffix = matchedTemplateSuffix(docPath);
    if (!suffix) continue;
    const id = path
      .relative(root, docPath)
      .slice(0, -suffix.length)
      .split(path.sep)
      .join('/');

    const sourcePath = docPath.slice(0, -suffix.length) + '.tsx';
    if (!fs.existsSync(sourcePath)) {
      errors.push({
        package: pkgLabel,
        template: id,
        message: `Template "${id}" is missing its same-stem source file ${path.basename(sourcePath)}. ${missingTemplateSourceFix(docPath, sourcePath)}`,
      });
      // A replacement this unusable template declares still counts, so its
      // target fails closed instead of going to a sibling.
      const declared = await declaredReplacement(docPath, id);
      if (declared != null) {
        errors.push({
          code: 'invalid_template_replacement',
          severity: 'error',
          package: pkgLabel,
          autolinked: integration.__autolinked,
          template: id,
          replacementTarget: declared,
          message: `Template "${id}" replaces "${declared}", but it cannot be used: it is missing its same-stem source file ${path.basename(sourcePath)}.`,
        });
      }
      continue;
    }

    let doc;
    try {
      doc = await loadIntegrationDoc(docPath, `Template "${id}"`);
    } catch (err) {
      errors.push({
        package: pkgLabel,
        template: id,
        message: `Template "${id}" failed to load: ${/** @type {any} */ (err).message}`,
      });
      // A replacement this unusable template declares still counts, so its
      // target fails closed instead of going to a sibling (spec:AST-035 FR4).
      const declared = await declaredReplacement(docPath, id);
      if (declared != null) {
        errors.push({
          code: 'invalid_template_replacement',
          severity: 'error',
          package: pkgLabel,
          autolinked: integration.__autolinked,
          template: id,
          replacementTarget: declared,
          message: `Template "${id}" replaces "${declared}", but it cannot be used: its metadata does not load.`,
        });
      }
      continue;
    }

    // loadIntegrationDoc validates against the envelope (incl. a 'page'|'block'
    // type) at the load boundary, so a valid doc always has a type. This guard
    // stays as defense-in-depth.
    const type = doc?.type;
    if (type !== 'page' && type !== 'block') {
      errors.push({
        package: pkgLabel,
        template: id,
        message: `Template "${id}" is missing a "type" of "page" or "block". Stamp the default export with type: 'page' or type: 'block'.`,
      });
      const declared =
        doc?.replaces ?? (await declaredReplacement(docPath, id));
      if (declared != null) {
        errors.push({
          code: 'invalid_template_replacement',
          severity: 'error',
          package: pkgLabel,
          autolinked: integration.__autolinked,
          template: id,
          replacementTarget: declared,
          message: `Template "${id}" replaces "${declared}", but it cannot be used: it has no "type".`,
        });
      }
      continue;
    }

    templates.push({
      type,
      dirName: id,
      name: doc?.name || id,
      displayName: doc?.displayName,
      description: doc?.description || '',
      keywords: doc?.keywords ?? [],
      category: doc?.category || '',
      isReady: doc?.isReady ?? true,
      scaffold: doc?.scaffold ?? false,
      aspectRatio: doc?.type === 'block' ? doc.aspectRatio : undefined,
      exampleFor: doc?.type === 'block' ? doc.exampleFor : undefined,
      alsoExampleFor:
        doc?.type === 'block' ? (doc.alsoExampleFor ?? []) : undefined,
      alsoShowcaseFor:
        doc?.type === 'block' ? (doc.alsoShowcaseFor ?? []) : undefined,
      isShowcase: doc?.type === 'block' ? (doc.isShowcase ?? false) : undefined,
      // The integration envelope carries `componentsUsed` for both page and
      // block templates; the rich TemplateDoc union only declares it on blocks,
      // so read it off the envelope shape here.
      componentsUsed:
        /** @type {{componentsUsed?: string[]}} */ (doc).componentsUsed ?? [],
      ...(doc?.icons ? {icons: doc.icons} : {}),
      filePath: sourcePath,
      docPath,
      package: pkgLabel,
      autolinked: integration.__autolinked,
      replaces: doc?.replaces,
    });
  }

  reportSamePackageReplacements(
    pkgLabel,
    integration.__autolinked,
    templates,
    errors,
  );
  return {templates, errors};
}

/**
 * The replacement a template doc declares, even when the doc does not validate
 * or load: an unusable template's declaration still counts, so its target
 * fails closed (spec:AST-035 FR4). Null when it declares none.
 * @param {string} docPath
 * @param {string} id
 * @returns {Promise<string | null>}
 */
async function declaredReplacement(docPath, id) {
  try {
    const doc = await loadIntegrationDoc(docPath, `Template "${id}"`);
    return doc?.replaces ?? null;
  } catch {
    // The doc does not validate; read what it declares without validating.
  }
  try {
    // The guarded importer: anything the doc writes to stdout as it loads
    // goes to stderr, so `--json` output stays clean.
    const raw = (await importDocModule(docPath))?.default;
    if (raw != null && typeof raw === 'object') {
      return typeof raw.replaces === 'string' ? raw.replaces : null;
    }
  } catch {
    // The module does not load at all; its text may still name a target.
  }
  try {
    const match = /\breplaces\s*:\s*['"]([^'"\n]+)['"]/u.exec(
      fs.readFileSync(docPath, 'utf8'),
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} componentName
 * @param {string} [cwd]
 * @returns {Promise<DiscoveredTemplate[]>}
 */
export async function findRelatedBlocks(componentName, cwd) {
  const blocks = await discoverAllBlocks(cwd);
  return blocks.filter(b =>
    (b.componentsUsed ?? []).some(
      c => c.toLowerCase() === componentName.toLowerCase(),
    ),
  );
}

/**
 * @param {string} componentName
 * @param {string} [cwd]
 * @param {{ package?: string }} [options] - When set, only search blocks from this package.
 *   Core blocks have no `package` field; external blocks have `package` set to the npm name.
 */
export async function findShowcase(componentName, cwd, options) {
  const blocks = await discoverAllBlocks(cwd);
  const lc = componentName.toLowerCase();
  const packageFilter = options?.package;

  // When scoped to a package, only consider blocks from that package.
  // Core blocks have no `package` field — filter them out when a package is specified.
  const showcases = blocks.filter(b => {
    if (!b.isShowcase) return false;
    if (packageFilter) return b.package === packageFilter;
    return true;
  });

  const toResult = (/** @type {DiscoveredTemplate} */ b) => ({
    name: b.name,
    aspectRatio: b.aspectRatio,
    filePath: b.filePath,
    docPath: b.docPath,
  });

  // Priority 0: the showcase that names the component (`exampleFor`), the
  // way packages declare it; a category no longer has to carry the name.
  const named = showcases.find(b => (b.exampleFor ?? '').toLowerCase() === lc);
  if (named) return toResult(named);

  // Priority 1: own directory (components/Badge/ for "Badge")
  const dirMatch = showcases.find(b => {
    const catDir = path.basename(b.category ?? '').toLowerCase();
    return catDir === lc;
  });
  if (dirMatch) return toResult(dirMatch);

  // Priority 2: componentsUsed in any directory (ClickableCard in Card/)
  const usedMatch = showcases.find(b =>
    (b.componentsUsed ?? []).some(c => c.toLowerCase() === lc),
  );
  if (usedMatch) return toResult(usedMatch);

  return null;
}

/** The npm scope of every Astryx package. */
const ASTRYX_PACKAGE_SCOPE = '@astryxdesign/';

const UBIQUITOUS = new Set([
  'Text',
  'Heading',
  'Button',
  'HStack',
  'VStack',
  'Link',
  'StackItem',
  'Icon',
]);

/**
 * The top-level bindings of a source. `declared` holds names bound by
 * `function`, `class`, `const`, `let` or `var` declarations (exported or not).
 * `astryxImports` maps each local name of a named Astryx import to the name the
 * package exports, so `Text as AstryxText` maps `AstryxText` to `Text`. Both
 * are empty when the source does not parse, so a parse failure never drops a
 * real component.
 *
 * @param {string} src
 * @returns {{declared: Set<string>, astryxImports: Map<string, string>}}
 */
function topLevelBindings(src) {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Map<string, string>} */
  const astryxImports = new Map();
  let program;
  try {
    program = templateSourceParser().parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    }).program;
  } catch {
    return {declared: names, astryxImports};
  }
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (!statement.source.value.startsWith(ASTRYX_PACKAGE_SCOPE)) continue;
      for (const specifier of statement.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const {imported} = specifier;
        astryxImports.set(
          specifier.local.name,
          imported.type === 'Identifier' ? imported.name : imported.value,
        );
      }
      continue;
    }
    const node =
      statement.type === 'ExportNamedDeclaration' ||
      statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (node == null) continue;
    if (
      (node.type === 'FunctionDeclaration' ||
        node.type === 'ClassDeclaration') &&
      node.id
    ) {
      names.add(node.id.name);
    } else if (node.type === 'VariableDeclaration') {
      for (const declarator of node.declarations) {
        if (declarator.id.type === 'Identifier') {
          names.add(declarator.id.name);
        }
      }
    }
  }
  return {declared: names, astryxImports};
}

/**
 * The components a template file composes, as written in the catalog.
 * @param {string} pagePath
 * @returns {string[]}
 */
export function extractComponents(pagePath) {
  return componentsInSource(fs.readFileSync(pagePath, 'utf-8'));
}

/**
 * The components a template source composes. A surface that returns rewritten
 * source lists the components of that source, so a component the rewrite
 * removed is not listed.
 * @param {string} src
 * @returns {string[]}
 */
export function componentsInSource(src) {
  // Match JSX opening tags, e.g. `<Section` or the legacy `<XDSSection`.
  // Templates author bare component names post un-prefix migration
  // (P2380608025), so the `XDS` prefix is optional. Anchoring on the `<`
  // JSX-tag boundary keeps this precise (avoids matching imports/comments/
  // identifiers) while remaining prefix-agnostic.
  //
  // The lookbehind additionally requires that the `<` NOT follow an identifier
  // character, which is what separates a JSX tag from a TypeScript generic
  // argument list. `return <Dialog` and `rows.map(r => <ListItem` match;
  // `useState<ReadonlySet<string>>`, `ComponentType<SVGProps<SVGSVGElement>>`
  // and `Record<string, Phase>` no longer do. Those were being indexed as
  // rendered components, putting type names like `Record`, `SVGProps` and
  // `ReadonlySet` into template keyword and "components used" output.
  const tagRegex = /(?<![\w$.])<(XDS)?([A-Z]\w+)/g;
  /** @type {string[]} */
  const matches = [];
  let m;
  while ((m = tagRegex.exec(src)) !== null) {
    matches.push(m[2]);
  }

  // Exclude names bound by a top-level declaration in the same file: those are
  // page-local helpers (e.g. `function TimelineSection()`), not components a
  // builder can import. Read real bindings from the syntax tree so comments,
  // strings and type annotations cannot add or hide a name.
  const {declared: localDeclNames, astryxImports} = topLevelBindings(src);

  return [
    ...new Set(
      matches
        .filter(n => !localDeclNames.has(n))
        .map(n => astryxImports.get(n) ?? n)
        .filter(n => !['Theme', 'ThemeProvider'].includes(n))
        .filter(n => !UBIQUITOUS.has(n))
        .map(n =>
          n.replace(
            // Strip only when a stem remains, so a bare `<Section>` keeps its
            // own name instead of emptying out.
            /(?<=.)(Item|Section|Header|Content|Footer|Panel|Heading|CollapseButton|Column|Sortable|Selection|Group|Source)$/,
            '',
          ),
        )
        .filter(Boolean),
    ),
  ].sort();
}
