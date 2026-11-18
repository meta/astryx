// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `Fix:` advice for contribution metadata that no root reads, or
 * that the wrong root reads.
 *
 * A fix must hold when followed literally. It never names a path outside the
 * package, never makes the package root a root, and names only the offending
 * file plus the same-stem source that moves with it. It offers a folder as a
 * root only when that root would read nothing but this kind of metadata,
 * overlap no other root, and orphan nothing the current root holds. Metadata
 * is read statically: nothing here runs package code.
 *
 * @input a package directory, its resolved roots, and one misplaced file
 * @output the `Fix: ...` sentence for that file
 * @position packages/cli/foundation/integrations — shared by the unreachable
 *   scan in api/integration/validate-integration.mjs and the component checks
 *   in validate-contributions.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {isValidSemver} from '../env/semver.mjs';
import {
  isThemeFolder as readsAsTheme,
  THEME_DOC_SUFFIX,
  THEME_MODULE_EXTENSIONS,
  THEME_SLUG_RE,
} from '../discovery/theme-discovery.mjs';
import {jscodeshift} from '../runtime/lazy-dependencies.mjs';

/** @typedef {'components' | 'templates' | 'docs' | 'themes'} MetadataRoot */

/**
 * @typedef {object} ContributionStamp
 * @property {string} type
 * @property {string | null} name the static `name`, when it has one
 */

/**
 * @typedef {object} FixContext
 * @property {string} packageDir
 * @property {string} manifest file name of the package's manifest
 * @property {Partial<Record<MetadataRoot | 'codemods', string>>} roots
 *   declared roots, absolute
 * @property {Map<string, ContributionStamp | null>} stamps
 * @property {Map<string, string[] | null>} candidates
 */

export const DOC_CANDIDATE_RE = /\.doc\.(?:ts|mjs|js)$/u;
export const TEMPLATE_CANDIDATE_RE = /\.template\.(?:ts|mjs|js)$/u;
const STATIC_DOC_TYPES = new Set([
  'component',
  'generic',
  'page',
  'block',
  'theme',
]);
const STATIC_TEMPLATE_TYPES = new Set(['page', 'block']);
/** Stray-codemod and version-folder rules, shared with the codemod checks. */
export const CODEMOD_FILE_RE = /\.(?:ts|mjs|js)$/u;
export const CODEMOD_TEST_RE = /\.(?:test|spec|fixture)\.(?:ts|mjs|js)$/u;
export const CODEMOD_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__tests__',
  '__fixtures__',
]);
/** @type {MetadataRoot[]} */
const METADATA_ROOTS = ['components', 'templates', 'docs', 'themes'];
/** Past this many entries a folder's contents count as unknown. */
const FOLDER_SCAN_LIMIT = 5_000;

/** The manifest root that reads each kind of contribution metadata. */
export const ROOT_FOR_TYPE = /** @type {Record<string, MetadataRoot>} */ ({
  component: 'components',
  generic: 'docs',
  page: 'templates',
  block: 'templates',
  theme: 'themes',
});

/** What a root holds, as a fix names it. */
const ROOT_HOLDS = /** @type {Record<MetadataRoot, string>} */ ({
  components: 'components',
  docs: 'topics',
  templates: 'templates',
  themes: 'themes',
});

/** @type {ReturnType<typeof import('jscodeshift').default['withParser']> | undefined} */
let tsxParser;

/** jscodeshift with the TypeScript parser, made once. */
function tsx() {
  tsxParser ??= jscodeshift().withParser('tsx');
  return tsxParser;
}

/** @param {any} node @returns {any} */
function unwrapStaticExpression(node) {
  let current = node;
  while (
    current &&
    [
      'TSSatisfiesExpression',
      'TSAsExpression',
      'TypeCastExpression',
      'ParenthesizedExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  if (current?.type === 'CallExpression' && current.arguments.length > 0) {
    current = unwrapStaticExpression(current.arguments[0]);
  }
  return current;
}

/** @param {any} property @param {string} name */
function staticPropertyNamed(property, name) {
  if (
    !property ||
    !['ObjectProperty', 'Property'].includes(property.type) ||
    property.computed
  ) {
    return false;
  }
  return (
    (property.key?.type === 'Identifier' && property.key.name === name) ||
    (['Literal', 'StringLiteral'].includes(property.key?.type) &&
      property.key.value === name)
  );
}

/**
 * Identify contribution metadata without importing it. Doctor scans files that
 * the manifest does not declare, so executing those files would run code the
 * package never asked Astryx to load.
 *
 * @param {string} file
 * @param {boolean} templateOnly
 * @returns {ContributionStamp | null} null when it is not contribution metadata
 */
export function readContributionStamp(file, templateOnly) {
  const j = tsx();
  let ast;
  try {
    ast = j(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
  /** @type {any[]} */
  const candidates = [];
  ast
    .find(j.ExportDefaultDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      candidates.push(exportPath.value.declaration);
    });
  ast
    .find(j.ExportNamedDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      const declaration = exportPath.value.declaration;
      if (declaration?.type !== 'VariableDeclaration') return;
      for (const declarator of declaration.declarations) {
        if (
          declarator.id?.type === 'Identifier' &&
          declarator.id.name === 'docs'
        ) {
          candidates.push(declarator.init);
        }
      }
    });

  const allowedTypes = templateOnly ? STATIC_TEMPLATE_TYPES : STATIC_DOC_TYPES;
  for (const candidate of candidates) {
    const object = unwrapStaticExpression(candidate);
    if (object?.type !== 'ObjectExpression') continue;
    /** @param {string} name @returns {unknown} */
    const field = name =>
      unwrapStaticExpression(
        object.properties.find((/** @type {any} */ property) =>
          staticPropertyNamed(property, name),
        )?.value,
      );
    const type = /** @type {any} */ (field('type'));
    if (
      ['Literal', 'StringLiteral'].includes(type?.type) &&
      allowedTypes.has(type.value)
    ) {
      const name = /** @type {any} */ (field('name'));
      return {
        type: type.value,
        name: typeof name?.value === 'string' ? name.value : null,
      };
    }
  }
  return null;
}

/** @param {string} candidate @param {string} root */
export function pathIsInside(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/**
 * @param {string} packageDir
 * @param {{components?: string, templates?: string, codemods?: string, docs?: string, themes?: string, __manifestFile?: string}} integration
 * @returns {FixContext}
 */
export function createFixContext(packageDir, integration) {
  return {
    packageDir,
    manifest: integration.__manifestFile
      ? path.basename(integration.__manifestFile)
      : 'astryx.integration.mjs',
    roots: {
      components: integration.components,
      templates: integration.templates,
      codemods: integration.codemods,
      docs: integration.docs,
      themes: integration.themes,
    },
    stamps: new Map(),
    candidates: new Map(),
  };
}

/**
 * The static stamp of a candidate metadata file, read once per context.
 * @param {FixContext} context
 * @param {string} file
 * @returns {ContributionStamp | null}
 */
export function stampOf(context, file) {
  if (!context.stamps.has(file)) {
    context.stamps.set(
      file,
      readContributionStamp(file, TEMPLATE_CANDIDATE_RE.test(file)),
    );
  }
  return context.stamps.get(file) ?? null;
}

/** @param {FixContext} context @param {string} file */
function shown(context, file) {
  return path.relative(context.packageDir, file).split(path.sep).join('/');
}

/** @param {FixContext} context */
function declaredRoots(context) {
  return /** @type {string[]} */ (Object.values(context.roots).filter(Boolean));
}

/** @param {string} file */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Every doc or template file under `dir`, or null when there are too many
 * entries to know.
 * @param {FixContext} context
 * @param {string} dir
 * @returns {string[] | null}
 */
function candidatesUnder(context, dir) {
  if (context.candidates.has(dir)) {
    return context.candidates.get(dir) ?? null;
  }
  /** @type {string[] | null} */
  let found = [];
  let seen = 0;
  /** @param {string} current */
  const walk = current => {
    let entries;
    try {
      entries = fs.readdirSync(current, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found == null) return;
      if (entry.name === '.git') continue;
      seen += 1;
      if (seen > FOLDER_SCAN_LIMIT) {
        found = null;
        return;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        (DOC_CANDIDATE_RE.test(entry.name) ||
          TEMPLATE_CANDIDATE_RE.test(entry.name))
      ) {
        found.push(full);
      }
    }
  };
  walk(dir);
  context.candidates.set(dir, found);
  return found;
}

/**
 * A folder inside the package, not its root, that neither holds nor sits in a
 * declared root.
 * @param {FixContext} context
 * @param {string} dir
 */
function isFreeFolder(context, dir) {
  return (
    dir !== context.packageDir &&
    pathIsInside(dir, context.packageDir) &&
    !declaredRoots(context).some(
      root => pathIsInside(root, dir) || pathIsInside(dir, root),
    )
  );
}

/**
 * Whether `dir` is one complete theme: a slug folder whose only metadata is
 * its theme descriptor, naming that folder, beside exactly one source that
 * imports nothing outside the folder. The descriptor being fixed may lack its
 * source or import from outside; the fix asks for both.
 * @param {FixContext} context
 * @param {string} dir
 * @param {string} [fixing]
 */
function isCompleteTheme(context, dir, fixing) {
  const found = candidatesUnder(context, dir);
  if (found?.length !== 1) return false;
  const [descriptor] = found;
  const stamp = stampOf(context, descriptor);
  const slug = path.basename(dir);
  return (
    THEME_SLUG_RE.test(slug) &&
    path.dirname(descriptor) === dir &&
    descriptor.endsWith(THEME_DOC_SUFFIX) &&
    stamp?.type === 'theme' &&
    stamp.name === slug &&
    (descriptor === fixing ||
      (sourcesBeside(descriptor, 'theme').length === 1 &&
        importsOutside(descriptor)?.length === 0))
  );
}

/**
 * Whether `dir` reads cleanly as a themes root: every folder in it that
 * discovery reads as a theme is one complete theme, and no metadata sits
 * directly in it.
 * @param {FixContext} context
 * @param {string} dir
 * @param {{except?: string, ignore?: string, fixing?: string}} [options] a
 *   theme folder moving out of `dir`, a descriptor moving away, and the
 *   descriptor being fixed
 */
function readsAsThemesRoot(context, dir, {except, ignore, fixing} = {}) {
  if (!fs.existsSync(dir)) return true;
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return false;
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return false;
  }
  return entries.every(entry => {
    const full = path.join(dir, entry.name);
    if (entry.name.startsWith('.')) return true;
    if (entry.isSymbolicLink()) return false;
    if (entry.isDirectory()) {
      return (
        full === except ||
        !readsAsTheme(full) ||
        isCompleteTheme(context, full, fixing)
      );
    }
    return (
      full === ignore ||
      !(
        DOC_CANDIDATE_RE.test(entry.name) ||
        TEMPLATE_CANDIDATE_RE.test(entry.name)
      )
    );
  });
}

/**
 * Whether declaring `dir` as the `key` root reads only complete metadata of
 * that kind, overlaps no root, and stays inside the package below its root.
 * The file being fixed may lack its source; the fix asks for it.
 * @param {FixContext} context
 * @param {string} dir
 * @param {MetadataRoot} key
 * @param {string} fixing
 */
function canBeRoot(context, dir, key, fixing) {
  if (!isFreeFolder(context, dir)) return false;
  if (key === 'themes') return readsAsThemesRoot(context, dir, {fixing});
  const found = candidatesUnder(context, dir);
  if (found == null) return false;
  const complete = found.every(file => {
    const stamp = stampOf(context, file);
    return (
      stamp != null &&
      ROOT_FOR_TYPE[stamp.type] === key &&
      (file === fixing ||
        stamp.type === 'generic' ||
        sourcesBeside(file, stamp.type).length > 0)
    );
  });
  const names = found.map(file => identity(context, file, key));
  const unique = new Set(names).size === names.length;
  return (
    complete &&
    unique &&
    (key !== 'components' || uncoveredSources(dir, found).length === 0)
  );
}

/**
 * The name a root knows a contribution by, and must hold only once: a
 * component's stem, a topic's lower-cased \`name\`, a template's path without
 * its suffix. A file with no static name gets its path, which never repeats.
 * @param {FixContext} context
 * @param {string} file
 * @param {MetadataRoot} key
 */
function identity(context, file, key) {
  if (key === 'components') return docStem(file);
  if (key === 'docs')
    return stampOf(context, file)?.name?.toLowerCase() ?? file;
  return path.join(path.dirname(file), docStem(file).toLowerCase());
}

/**
 * The PascalCase \`.tsx\` files directly in a folder that no doc under it
 * covers. A components root there warns that Astryx ignores each one.
 * @param {string} dir
 * @param {string[]} found the doc and template files under it
 * @returns {string[]} their file names
 */
function uncoveredSources(dir, found) {
  const covered = new Set(
    found.filter(file => DOC_CANDIDATE_RE.test(file)).map(docStem),
  );
  try {
    return fs
      .readdirSync(dir, {withFileTypes: true})
      .filter(entry => entry.isFile() || entry.isSymbolicLink())
      .map(entry => entry.name)
      .filter(name => {
        const match = /^([A-Z][A-Za-z0-9]+)\.tsx$/u.exec(name);
        return match != null && !covered.has(match[1]);
      });
  } catch {
    return [];
  }
}

/**
 * Whether a folder holds an entry by this name, compared the way a
 * case-insensitive file system would.
 * @param {string} dir
 * @param {string} name
 */
function hasEntry(dir, name) {
  const wanted = name.toLowerCase();
  try {
    return fs.readdirSync(dir).some(entry => entry.toLowerCase() === wanted);
  } catch {
    return false;
  }
}

/**
 * What already holds the name \`file\` would take once moved to the top of
 * \`root\`, or null when the name is free.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @param {string} root
 * @returns {string | null} e.g. \`a topic named "guide" (docs/guide.doc.mjs)\`
 */
function takenIn(context, file, stamp, root) {
  const key = ROOT_FOR_TYPE[stamp.type];
  const stem = docStem(file);
  const name = identity(context, path.join(root, path.basename(file)), key);
  const same = (candidatesUnder(context, root) ?? []).find(
    other =>
      (key === 'templates' || DOC_CANDIDATE_RE.test(other)) &&
      (key === 'docs'
        ? stamp.name != null &&
          stampOf(context, other)?.name?.toLowerCase() ===
            stamp.name.toLowerCase()
        : identity(context, other, key) === name),
  );
  if (same) {
    const kind = {
      components: 'component',
      docs: 'topic',
      templates: 'template',
    }[/** @type {'components' | 'docs' | 'templates'} */ (key)];
    const called = key === 'docs' ? `"${stamp.name}"` : stem;
    return `a ${kind} named ${called} (${shown(context, same)})`;
  }
  const clash = [path.basename(file), ...sourcesBeside(file, stamp.type)].find(
    entry => hasEntry(root, entry),
  );
  return clash ? `a file named ${clash}` : null;
}

/**
 * The local modules a theme source reaches, read statically the way theme
 * discovery reads them. Null when a file in the graph cannot be parsed.
 * @param {string} entry
 * @returns {Array<{importer: string, specifier: string, target: string}> | null}
 */
function localImports(entry) {
  /** @type {Array<{importer: string, specifier: string, target: string}>} */
  const edges = [];
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    /** @type {string[]} */
    const specifiers = [];
    try {
      const js = jscodeshift().withParser(
        /\.(?:ts|tsx|mts)$/u.test(file) ? 'tsx' : 'babel',
      );
      const ast = js(fs.readFileSync(file, 'utf-8'));
      /** @param {any} node */
      const add = node => {
        if (typeof node?.value === 'string') specifiers.push(node.value);
      };
      for (const type of [
        js.ImportDeclaration,
        js.ExportNamedDeclaration,
        js.ExportAllDeclaration,
        js.ImportExpression,
      ]) {
        ast.find(type).forEach((/** @type {any} */ found) => {
          add(found.node.source);
        });
      }
      ast.find(js.CallExpression).forEach((/** @type {any} */ call) => {
        if (call.node.callee?.type === 'Import') add(call.node.arguments?.[0]);
      });
    } catch {
      return null;
    }
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      const base = path.resolve(path.dirname(file), specifier);
      const target = [
        base,
        ...THEME_MODULE_EXTENSIONS.map(extension => `${base}${extension}`),
        ...THEME_MODULE_EXTENSIONS.map(extension =>
          path.join(base, `index${extension}`),
        ),
      ].find(isFile);
      if (!target) continue;
      edges.push({importer: file, specifier, target});
      if (THEME_MODULE_EXTENSIONS.includes(path.extname(target))) {
        queue.push(target);
      }
    }
  }
  return edges;
}

/**
 * A theme's imports that reach outside the folder its descriptor is in. Null
 * when unknown.
 * @param {string} file the theme descriptor
 */
function importsOutside(file) {
  const [source] = sourcesBeside(file, 'theme');
  if (!source) return [];
  const home = path.dirname(file);
  const edges = localImports(path.join(home, source));
  return edges && edges.filter(edge => !pathIsInside(edge.target, home));
}

/**
 * The sentence that brings the files a theme imports from outside its folder
 * into the folder: discovery rejects any import that leaves it. Files move
 * with the folder keep their paths; outside files are copied to its top.
 * @param {FixContext} context
 * @param {string} file the theme descriptor
 * @param {string} destination the theme folder, as the fix names it
 * @returns {string} a sentence with a leading space, or ''
 */
function themeImportNote(context, file, destination) {
  const [source] = sourcesBeside(file, 'theme');
  if (!source) return '';
  const home = path.dirname(file);
  const edges = localImports(path.join(home, source));
  if (!edges) return '';
  const copies = [
    ...new Set(
      edges
        .map(edge => edge.target)
        .filter(target => !pathIsInside(target, home)),
    ),
  ];
  if (
    copies.length === 0 ||
    copies.some(target => !pathIsInside(target, context.packageDir))
  ) {
    return '';
  }
  const why = ': a theme can import only files inside its own folder.';
  const listed = copies.map(target => shown(context, target));
  const list =
    listed.length === 1
      ? listed[0]
      : `${listed.slice(0, -1).join(', ')} and ${listed.at(-1)}`;
  const names = copies.map(target => path.basename(target).toLowerCase());
  if (
    new Set(names).size !== names.length ||
    copies.some(target => hasEntry(home, path.basename(target)))
  ) {
    return ` Also copy ${list} into ${destination} and point the imports of ${copies.length === 1 ? 'it at the copy' : 'them at the copies'}${why}`;
  }
  /** @param {string} target where a file ends up, relative to the theme folder */
  const inTheme = target =>
    (pathIsInside(target, home)
      ? path.relative(home, target)
      : path.basename(target)
    )
      .split(path.sep)
      .join('/');
  /** @type {string[]} */
  const changes = [];
  for (const {importer, specifier, target} of edges) {
    const extension = path.extname(specifier);
    let next = inTheme(target);
    if (!(extension && target.endsWith(extension))) {
      next = next.slice(0, next.length - path.extname(next).length);
    }
    next = path.posix.relative(path.posix.dirname(inTheme(importer)), next);
    if (!next.startsWith('.')) next = `./${next}`;
    const change = `of ${specifier} in ${path.basename(importer)} to ${next}`;
    if (next !== specifier && !changes.includes(change)) changes.push(change);
  }
  const changed =
    changes.length === 1
      ? `the import ${changes[0]}`
      : `the imports ${changes.slice(0, -1).join(', ')} and ${changes.at(-1)}`;
  return ` Also copy ${list} into ${destination} and change ${changed}${why}`;
}

/**
 * The same-stem sources beside a doc: a component's or template's `.tsx`, or
 * a theme's entry modules (a theme needs exactly one).
 * @param {string} file
 * @param {string} type
 * @returns {string[]} their file names
 */
function sourcesBeside(file, type) {
  if (type === 'generic') return [];
  const dir = path.dirname(file);
  const stem = docStem(file);
  const names =
    type === 'theme'
      ? THEME_MODULE_EXTENSIONS.map(extension => `${stem}${extension}`)
      : [`${stem}.tsx`];
  return names.filter(name => isFile(path.join(dir, name)));
}

/** @param {string} file */
function docStem(file) {
  return path
    .basename(file)
    .replace(DOC_CANDIDATE_RE, '')
    .replace(TEMPLATE_CANDIDATE_RE, '');
}

/**
 * The sentences asking for what the doc needs wherever it ends up: a missing
 * same-stem source, and for a theme, the descriptor's `.doc.mjs` name.
 * @param {string} file
 * @param {string} type
 * @returns {string} a sentence with a leading space, or ''
 */
function sourceNote(file, type) {
  // Theme discovery reads only `.doc.mjs` descriptors.
  const rename =
    type === 'theme' && !file.endsWith(THEME_DOC_SUFFIX)
      ? ` Also rename ${path.basename(file)} to ${docStem(file)}${THEME_DOC_SUFFIX}: a theme descriptor is a ${THEME_DOC_SUFFIX} file.`
      : '';
  if (type === 'generic' || sourcesBeside(file, type).length > 0) return rename;
  return type === 'theme'
    ? `${rename} Also add its same-stem theme source, such as ${docStem(file)}.ts, beside it.`
    : ` Also add ${docStem(file)}.tsx beside it.`;
}

/**
 * How a fix names a folder.
 * @param {FixContext} context
 * @param {string} dir
 */
function place(context, dir) {
  return dir === context.packageDir
    ? 'the package root'
    : `${shown(context, dir)}/`;
}

/** @param {string} text */
function capitalize(text) {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * Whether codemods can move into `dir`: it is missing, or holds nothing the
 * codemod checks would read as a stray codemod or a mis-named version.
 * @param {string} dir
 */
function holdsOnlyVersions(dir) {
  if (!fs.existsSync(dir)) return true;
  try {
    return fs
      .readdirSync(dir, {withFileTypes: true})
      .every(entry =>
        entry.isDirectory()
          ? isValidSemver(entry.name) || CODEMOD_SKIP_DIRS.has(entry.name)
          : !CODEMOD_FILE_RE.test(entry.name) ||
            CODEMOD_TEST_RE.test(entry.name),
      );
  } catch {
    return false;
  }
}

/**
 * The step that gives codemods a folder of their own, and the folder it names
 * (null when codemods/ is taken and the author picks one).
 * @param {FixContext} context
 * @returns {{step: string, folder: string | null}}
 */
function ownCodemodsFolder(context) {
  const target = path.join(context.packageDir, 'codemods');
  return context.roots.codemods !== target && holdsOnlyVersions(target)
    ? {
        step: `create codemods/, move each version folder into it, and set \`codemods: './codemods'\` in ${context.manifest}`,
        folder: 'codemods',
      }
    : {
        step: `move each version folder into a new folder of their own, and set \`codemods\` to that folder in ${context.manifest}`,
        folder: null,
      };
}

/**
 * Declared roots other than codemods at or inside `dir`.
 * @param {FixContext} context
 * @param {string} dir
 * @returns {Array<{kind: MetadataRoot, root: string}>}
 */
function metadataRootsIn(context, dir) {
  /** @type {Array<{kind: MetadataRoot, root: string}>} */
  const found = [];
  for (const kind of METADATA_ROOTS) {
    const root = context.roots[kind];
    if (root && pathIsInside(root, dir)) found.push({kind, root});
  }
  return found;
}

/**
 * The fix for every codemods entry when the codemods root also holds the rest
 * of the package: it is the package root, or it holds another root. No
 * per-entry move or rename helps then.
 * @param {FixContext} context
 * @param {string} [stray] a stray file's name, which may itself be a codemod
 * @returns {string | null}
 */
export function sharedCodemodsRootFix(context, stray) {
  const root = context.roots.codemods;
  if (!root) return null;
  const {step, folder} = ownCodemodsFolder(context);
  const also =
    stray == null
      ? ''
      : ` If it is a codemod, move it into the folder named for the version it migrates to, for example ${folder ? `${folder}/1.2.0/${stray}` : `1.2.0/${stray} in that folder`}.`;
  if (root === context.packageDir) {
    return `Fix: the codemods root is the package root, so everything in the package is read as a codemod or a version folder. ${capitalize(step)}.${also}`;
  }
  // codemods/ holding another root is fixed by moving that root out.
  if (root === path.join(context.packageDir, 'codemods')) return null;
  const [held] = metadataRootsIn(context, root);
  if (!held) return null;
  const relation =
    held.root === root
      ? `is also the ${held.kind} root`
      : `also holds the ${held.kind} root ${place(context, held.root)}`;
  return `Fix: the codemods root ${place(context, root)} ${relation}. ${capitalize(step)}.${also}`;
}

/**
 * The fix for a codemods folder that holds another root, which a rename would
 * break.
 * @param {FixContext} context
 * @param {string} folder
 * @returns {string | null}
 */
export function heldRootFix(context, folder) {
  const [held] = metadataRootsIn(context, folder);
  const codemods = context.roots.codemods;
  if (!held || !codemods) return null;
  return `Fix: it holds the ${held.kind} root ${place(context, held.root)}; move that root out of ${place(context, codemods)} and update \`${held.kind}\` in ${context.manifest}.`;
}

/**
 * The step that stops another root from also reading `dir`, the folder a fix
 * puts `key` metadata in. `dir` is undefined for a folder the author picks,
 * which only a root at the package root is sure to cover.
 * @param {FixContext} context
 * @param {string | undefined} dir
 * @param {MetadataRoot} key
 * @returns {string} a sentence with a leading space, or ''
 */
function overlapNote(context, dir, key) {
  /** @param {string | undefined} root */
  const covers = root =>
    root != null &&
    (dir === undefined ? root === context.packageDir : pathIsInside(dir, root));
  const at = dir === undefined ? 'that folder' : place(context, dir);
  let note = '';
  const codemods = context.roots.codemods;
  if (covers(codemods)) {
    if (
      dir !== undefined &&
      codemods === path.join(context.packageDir, 'codemods')
    ) {
      return ` The codemods root codemods/ also reads ${at}; move ${at} out of codemods/ and set \`${key}\` to its new path in ${context.manifest}.`;
    }
    const which =
      codemods === context.packageDir
        ? 'is the package root, so it'
        : place(context, /** @type {string} */ (codemods));
    note = ` The codemods root ${which} also reads ${at}; ${ownCodemodsFolder(context).step}.`;
  }
  const own = path.join(context.packageDir, key);
  const free = !fs.existsSync(own) && isFreeFolder(context, own);
  for (const kind of METADATA_ROOTS) {
    const other = context.roots[kind];
    if (kind === key || other == null || !covers(other)) continue;
    if (other === context.packageDir) {
      note += ` The ${kind} root is the package root, so it also reads ${at}; create ${kind}/, move the ${ROOT_HOLDS[kind]} into it, and set \`${kind}: './${kind}'\` in ${context.manifest}.`;
      continue;
    }
    // Moving this root out of the outermost root clears every root around it.
    if (other === dir) {
      return free
        ? `${note} The ${kind} root is also ${at}; move the ${ROOT_HOLDS[key]} there into ${key}/ and set \`${key}: './${key}'\` in ${context.manifest}.`
        : `${note} The ${kind} root is also ${at}; move the ${ROOT_HOLDS[key]} there into a folder of their own and set \`${key}\` to that folder in ${context.manifest}.`;
    }
    return free
      ? `${note} The ${kind} root ${place(context, other)} also reads ${at}; move ${at} to ${key}/ and set \`${key}: './${key}'\` in ${context.manifest}.`
      : `${note} The ${kind} root ${place(context, other)} also reads ${at}; move ${at} out of it and set \`${key}\` to its new path in ${context.manifest}.`;
  }
  return note;
}

/**
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 */
function themeSlug(context, file, stamp) {
  const themeDir = path.dirname(file);
  if (stamp.name) return stamp.name;
  return themeDir === context.packageDir
    ? docStem(file)
    : path.basename(themeDir);
}

/**
 * What to move for a theme: its whole folder when the folder holds only this
 * theme and does not hold the target, else the descriptor and its source.
 * @param {FixContext} context
 * @param {string} file
 * @param {string} [target] the folder it moves to
 * @returns {{what: string, folder: boolean}}
 */
function themeFiles(context, file, target) {
  const themeDir = path.dirname(file);
  if (
    themeDir !== context.packageDir &&
    (target === undefined || !pathIsInside(target, themeDir)) &&
    !declaredRoots(context).some(root => pathIsInside(root, themeDir))
  ) {
    const found = candidatesUnder(context, themeDir);
    if (found?.length === 1 && found[0] === file) {
      return {what: `${shown(context, themeDir)}/`, folder: true};
    }
  }
  const sources = sourcesBeside(file, 'theme');
  const doc = path.basename(file);
  if (sources.length === 0) return {what: doc, folder: false};
  if (sources.length > 1) {
    return {
      what: `${doc} and its same-stem sources (with any local files they import)`,
      folder: false,
    };
  }
  return {
    what: `${doc} and ${sources[0]} (with any local files it imports)`,
    folder: false,
  };
}

/**
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @param {string} root the themes root the theme moves under
 * @param {string} [slug] the folder it takes there
 */
function moveTheme(
  context,
  file,
  stamp,
  root,
  slug = themeSlug(context, file, stamp),
) {
  const {what, folder} = themeFiles(context, file, path.join(root, slug));
  const target = `${root === context.packageDir ? '' : `${shown(context, root)}/`}${slug}/`;
  return folder ? `move ${what} to ${target}` : `move ${what} into ${target}`;
}

/**
 * Moving metadata under its kind's declared root.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @param {string} root
 * @param {string} [destination] the theme folder, as the fix names it
 * @returns {{main: string, notes: string}}
 */
function moveUnder(context, file, stamp, root, destination) {
  const key = ROOT_FOR_TYPE[stamp.type];
  const overlap = overlapNote(context, root, key);
  if (key === 'themes') {
    const slugDir = path.join(root, themeSlug(context, file, stamp));
    const taken = hasEntry(root, path.basename(slugDir));
    const imports = themeImportNote(
      context,
      file,
      destination ??
        (taken ? `${place(context, root)}<slug>/` : place(context, slugDir)),
    );
    const notes = sourceNote(file, stamp.type) + imports + overlap;
    if (taken) {
      return {
        main: `${place(context, slugDir)} is taken, so give this theme a new lower-kebab slug: ${moveTheme(context, file, stamp, root, '<slug>')} and set \`name\` in ${path.basename(file)} to <slug>`,
        notes,
      };
    }
    return {main: moveTheme(context, file, stamp, root), notes};
  }
  const [source] = sourcesBeside(file, stamp.type);
  const taken = takenIn(context, file, stamp, root);
  if (taken) {
    const name = key === 'components' ? '<Name>' : '<name>';
    const suffix = path.basename(file).slice(docStem(file).length);
    const renamed = source
      ? `rename it and ${source} to ${name}${suffix} and ${name}.tsx`
      : `rename it to ${name}${suffix}`;
    const missing =
      stamp.type === 'generic' || source
        ? ''
        : ` Also add ${name}.tsx beside it.`;
    return {
      main: `${place(context, root)} already has ${taken}, so give this one a new name: ${renamed}, set its \`name\` to ${name}, and move ${source ? 'them' : 'it'} under ${place(context, root)} (the ${key} root)`,
      notes: missing + overlap,
    };
  }
  return {
    main: `move ${source ? `it and ${source}` : 'it'} under ${place(context, root)} (the ${key} root)`,
    notes: sourceNote(file, stamp.type) + overlap,
  };
}

/**
 * Moving metadata whose kind has no root yet: into the conventional folder,
 * when that folder would read cleanly as the new root.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @returns {{main: string, notes: string}}
 */
function moveToNewRoot(context, file, stamp) {
  const key = ROOT_FOR_TYPE[stamp.type];
  const target = path.join(context.packageDir, key);
  const declare = `set \`${key}: './${key}'\` in ${context.manifest}`;
  const pointAtIt = `set \`${key}\` to that folder in ${context.manifest}`;
  const notes = sourceNote(file, stamp.type);
  const picked = notes + overlapNote(context, undefined, key);
  if (key === 'themes') {
    const themeDir = path.dirname(file);
    const slug = themeSlug(context, file, stamp);
    const slugDir = path.join(target, slug);
    const clear =
      isFreeFolder(context, target) &&
      readsAsThemesRoot(context, target, {
        except: path.dirname(themeDir) === target ? themeDir : undefined,
        ignore: file,
        fixing: file,
      }) &&
      (slugDir === themeDir || !fs.existsSync(slugDir));
    if (clear && slugDir === themeDir) {
      return {
        main: declare,
        notes: notes + themeImportNote(context, file, place(context, themeDir)),
      };
    }
    if (clear) {
      return {
        main: `${moveTheme(context, file, stamp, target)} and ${declare}`,
        notes: notes + themeImportNote(context, file, place(context, slugDir)),
      };
    }
    const {what, folder} = themeFiles(context, file);
    return {
      main: folder
        ? `move ${what} into a folder that holds only themes, as ${slug}/, and ${pointAtIt}`
        : `move ${what} into a ${slug}/ folder inside a folder that holds only themes, and ${pointAtIt}`,
      notes:
        notes +
        themeImportNote(context, file, 'the theme folder') +
        overlapNote(context, undefined, key),
    };
  }
  const [source] = sourcesBeside(file, stamp.type);
  const what = source ? `it and ${source}` : 'it';
  const clear = fs.existsSync(target)
    ? canBeRoot(context, target, key, file) &&
      takenIn(context, file, stamp, target) == null
    : isFreeFolder(context, target);
  if (clear) return {main: `move ${what} into ${key}/ and ${declare}`, notes};
  return {
    main: `move ${what} into a folder that holds only ${ROOT_HOLDS[key]}, and ${pointAtIt}`,
    notes: picked,
  };
}

/**
 * The fix for contribution metadata that sits outside every declared root.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @returns {string}
 */
export function unreachableFix(context, file, stamp) {
  const key = ROOT_FOR_TYPE[stamp.type];
  const root = context.roots[key];
  // A theme is a directory under the themes root, so the root is its parent.
  const folder = path.dirname(key === 'themes' ? path.dirname(file) : file);
  const declare = `set \`${key}: './${shown(context, folder)}'\` in ${context.manifest}`;
  const folderCanBeRoot = canBeRoot(context, folder, key, file);
  const stays =
    sourceNote(file, stamp.type) +
    (key === 'themes'
      ? themeImportNote(context, file, place(context, path.dirname(file)))
      : '');
  if (root) {
    // Swapping roots would orphan whatever the declared root already reads.
    const swappable =
      folderCanBeRoot && candidatesUnder(context, root)?.length === 0;
    if (swappable && overlapNote(context, root, key) !== '') {
      return `Fix: ${declare}.${stays}`;
    }
    const {main, notes} = moveUnder(
      context,
      file,
      stamp,
      root,
      swappable ? 'the theme folder' : undefined,
    );
    return `Fix: ${main}${swappable ? `, or ${declare}` : ''}.${notes}`;
  }
  if (folderCanBeRoot) return `Fix: ${declare}.${stays}`;
  const {main, notes} = moveToNewRoot(context, file, stamp);
  return `Fix: ${main}.${notes}`;
}

/**
 * Whether the components can move into `dir` out of a components root at the
 * package root: it is missing, or holds only component docs, a doc for every
 * source, and no other root.
 * @param {FixContext} context
 * @param {string} dir
 */
function holdsOnlyComponents(context, dir) {
  if (!fs.existsSync(dir)) return true;
  const found = candidatesUnder(context, dir);
  return (
    found != null &&
    found.every(file => stampOf(context, file)?.type === 'component') &&
    uncoveredSources(dir, found).length === 0 &&
    !METADATA_ROOTS.some(kind => {
      const root = context.roots[kind];
      return kind !== 'components' && root != null && pathIsInside(root, dir);
    })
  );
}

/**
 * The step a component doc added to the components root also needs when
 * another root reads that folder too, and would read the new doc as its own.
 * @param {FixContext} context
 * @returns {string} a sentence with a leading space, or ''
 */
export function newComponentDocNote(context) {
  const components = context.roots.components;
  return components ? overlapNote(context, components, 'components') : '';
}

/**
 * The theme beside \`file\` whose source imports it, if any: such a file is
 * part of that theme, not a codemod.
 * @param {FixContext} context
 * @param {string} file
 * @returns {{doc: string, stamp: ContributionStamp, source: string} | null}
 */
export function themeImporting(context, file) {
  const dir = path.dirname(file);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries.filter(entry => DOC_CANDIDATE_RE.test(entry))) {
    const doc = path.join(dir, name);
    const stamp = stampOf(context, doc);
    const [source] = stamp?.type === 'theme' ? sourcesBeside(doc, 'theme') : [];
    if (!stamp || !source) continue;
    const edges = localImports(path.join(dir, source));
    if (edges?.some(edge => edge.target === file)) return {doc, stamp, source};
  }
  return null;
}

/**
 * The fix for contribution metadata at the top of the codemods root, which
 * the codemod checks read as a stray codemod. `source` names that doc's theme
 * source when the stray file is the source rather than the doc.
 * @param {FixContext} context
 * @param {string} file the metadata doc
 * @param {ContributionStamp} stamp
 * @param {string} [source]
 * @param {string} [stray] a file that source imports, when the stray file is
 *   that one
 * @returns {string}
 */
export function notACodemodFix(context, file, stamp, source, stray) {
  const key = ROOT_FOR_TYPE[stamp.type];
  const root = context.roots[key];
  const codemods = context.roots.codemods;
  let lead = `Fix: ${path.basename(file)} has type: '${stamp.type}', so it is not a codemod`;
  if (source && stray) {
    lead = `Fix: ${stray} is imported by ${source}, the source of ${path.basename(file)}, which has type: '${stamp.type}', so none of them is a codemod`;
  } else if (source) {
    lead = `Fix: ${source} is the source of ${path.basename(file)}, which has type: '${stamp.type}', so neither is a codemod`;
  }
  if (root && codemods && pathIsInside(file, root)) {
    // Its own root reads it already; only the codemods root is in the way.
    const [companion] = sourcesBeside(file, stamp.type);
    return `${lead}; move ${path.basename(file)}${companion ? ` and ${companion}` : ''} out of ${place(context, codemods)} to another folder under ${place(context, root)} (the ${key} root).${sourceNote(file, stamp.type)}${overlapNote(context, root, key)}`;
  }
  const {main, notes} = root
    ? moveUnder(context, file, stamp, root)
    : moveToNewRoot(context, file, stamp);
  return `${lead}; ${main}.${notes}`;
}

/**
 * The fix for a doc that the components root reads although its type says it
 * is another kind of metadata.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp a stamp whose type is not `component`
 * @returns {string}
 */
export function notAComponentFix(context, file, stamp) {
  const components = /** @type {string} */ (context.roots.components);
  const key = ROOT_FOR_TYPE[stamp.type];
  const root = context.roots[key];
  const lead = `Fix: ${path.basename(file)} has type: '${stamp.type}', so it is not a component`;
  if (components === context.packageDir) {
    const why = `${lead}, and the components root is the package root, which reads every doc in the package`;
    const target = path.join(context.packageDir, 'components');
    return holdsOnlyComponents(context, target)
      ? `${why}; create components/, move the components into it, and set \`components: './components'\` in ${context.manifest}.${overlapNote(context, target, 'components')}`
      : `${why}; move the components into a folder that holds only components, and set \`components\` to that folder in ${context.manifest}.${overlapNote(context, undefined, 'components')}`;
  }
  if (root && pathIsInside(root, components)) {
    const {main, notes} = separateRoots(context, file, stamp, root);
    return `${lead}, and ${main}.${sourceNote(file, stamp.type)}${notes}`;
  }
  if (root && pathIsInside(file, root)) {
    return `${lead}; move it out of ${place(context, components)} (the components root) to another folder under ${place(context, root)} (the ${key} root).${sourceNote(file, stamp.type)}${overlapNote(context, root, key)}`;
  }
  const {main, notes} = root
    ? moveUnder(context, file, stamp, root)
    : moveToNewRoot(context, file, stamp);
  return `${lead}; ${main}.${notes}`;
}

/**
 * The fix when a kind's root sits inside the components root, so nothing
 * placed in it escapes the components root.
 * @param {FixContext} context
 * @param {string} file
 * @param {ContributionStamp} stamp
 * @param {string} root the declared root for this kind
 * @returns {{main: string, notes: string}}
 */
function separateRoots(context, file, stamp, root) {
  const components = /** @type {string} */ (context.roots.components);
  const key = ROOT_FOR_TYPE[stamp.type];
  const target = path.join(context.packageDir, key);
  const free = !fs.existsSync(target) && isFreeFolder(context, target);
  const picked = overlapNote(context, undefined, key);
  if (root === components) {
    const both = `the ${key} root and the components root are both ${place(context, root)}`;
    return free
      ? {
          main: `${both}; move the ${ROOT_HOLDS[key]} into ${key}/ and set \`${key}: './${key}'\` in ${context.manifest}`,
          notes: '',
        }
      : {
          main: `${both}; move the ${ROOT_HOLDS[key]} into a folder of their own and set \`${key}\` to that folder in ${context.manifest}`,
          notes: picked,
        };
  }
  const overlap = `the components root ${place(context, components)} also reads the ${key} root ${place(context, root)} inside it`;
  const carried = pathIsInside(file, root);
  // The root's contents move with it, so a name it holds is still taken.
  const slug = themeSlug(context, file, stamp);
  const taken =
    !carried &&
    (key === 'themes'
      ? hasEntry(root, slug)
      : takenIn(context, file, stamp, root) != null);
  const [source] = sourcesBeside(file, stamp.type);
  const name = '<name>';
  const suffix = path.basename(file).slice(docStem(file).length);
  const renamed = `give it a new name: ${source ? `rename it and ${source} to ${name}${suffix} and ${name}.tsx` : `rename it to ${name}${suffix}`}, set its \`name\` to ${name}, and move ${source ? 'them' : 'it'}`;
  const newSlug = taken ? '<slug>' : slug;
  const slugNote = taken
    ? ` and set \`name\` in ${path.basename(file)} to <slug>`
    : '';
  if (free) {
    let then = '';
    if (!carried && key === 'themes') {
      then = `, then ${moveTheme(context, file, stamp, target, newSlug)}${slugNote}`;
    } else if (!carried) {
      then = `, then ${taken ? renamed : 'move it'} into ${key}/`;
    }
    return {
      main: `${overlap}; move ${place(context, root)} to ${key}/ and set \`${key}: './${key}'\` in ${context.manifest}${then}`,
      notes: '',
    };
  }
  let then = '';
  if (!carried && key === 'themes') {
    const {what, folder} = themeFiles(context, file, root);
    then = folder
      ? `, then move ${what} into that root as ${newSlug}/${slugNote}`
      : `, then move ${what} into a ${newSlug}/ folder in that root${slugNote}`;
  } else if (!carried) {
    then = `, then ${taken ? renamed : 'move it'} into that root`;
  }
  return {
    main: `${overlap}; move ${place(context, root)} out of ${place(context, components)} and set \`${key}\` to its new path in ${context.manifest}${then}`,
    notes: picked,
  };
}
