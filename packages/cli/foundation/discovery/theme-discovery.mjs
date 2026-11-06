// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme descriptor discovery shared by Project, theme list/add/eject, and
 * integration validation.
 *
 * A theme root contains one directory per lower-kebab slug. Each directory has
 * a theme source and mandatory same-stem `.doc.mjs`; the directory is the
 * complete copy and pack boundary. Descriptor metadata is parsed without
 * executing theme source. A dot-folder, or a folder holding neither a
 * descriptor nor a `<name>Theme` source, is not a theme. Dot entries and files
 * npm never publishes belong to no theme.
 *
 * @input a bundled or integration-owned theme root
 * @output validated source-theme records with package ownership
 * @position packages/cli/foundation/discovery — shared theme discovery
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {lowerDoc} from '../doc-compiler/compile.mjs';
import {packageSource} from '../doc-compiler/source.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {formatCliCommand} from '../env/package-manager.mjs';
import {LOCAL_THEME_ROOT} from '../config/theme-state.mjs';
import {assertWithin, PathSafetyError} from '../fs/path-safety.mjs';

export const BUNDLED_THEME_PACKAGE = '@astryxdesign/cli';
export const THEMES_DIR = path.join(CLI_ROOT, 'assets', 'templates', 'themes');
export const THEME_DOC_SUFFIX = '.doc.mjs';

const require = createRequire(import.meta.url);

/** @type {typeof import('@babel/parser') | undefined} */
let babelParser;
/** @type {any} */
let jscodeshiftApi;

/**
 * The descriptor parser, loaded when the first descriptor is read.
 * @returns {typeof import('@babel/parser')}
 */
function descriptorParser() {
  babelParser ??= require('@babel/parser');
  return /** @type {typeof import('@babel/parser')} */ (babelParser);
}

/**
 * The theme source parser, loaded when the first integration theme source is
 * checked. Bundled themes never need it.
 * @returns {any}
 */
function sourceParser() {
  jscodeshiftApi ??= require('jscodeshift');
  return jscodeshiftApi;
}

/**
 * @typedef {object} DiscoveredTheme
 * @property {string} slug
 * @property {string} displayName
 * @property {string} description
 * @property {boolean} maintained
 * @property {string} entry
 * @property {string} exportName
 * @property {string[]} files what `theme eject` copies, relative to sourceDir,
 *   entry first
 * @property {string} package package exposed for discovery and --package selection
 * @property {string} [importPackage] package that owns built imports when it differs from the selector package
 * @property {string} [packageDir] absolute package/project directory
 * @property {Record<string, unknown>|null} [packageExports] parsed package exports
 * @property {'bundled'|'package'|'local'} source
 * @property {string} sourceDir absolute directory holding this theme's files
 * @property {boolean} bundled
 * @property {string} docPath absolute descriptor path
 */

/**
 * The package written to the app record and used for built imports. Bundled
 * themes keep the released CLI package as their selector while importing from
 * their standalone theme package.
 * @param {DiscoveredTheme} theme
 */
export function themeImportPackage(theme) {
  return theme.importPackage ?? theme.package;
}

/**
 * Resolve one authored relative path without allowing POSIX or Windows escape
 * syntax, even when discovery runs on the other platform.
 * @param {string} value
 * @param {string} root
 * @param {string} label
 */
function resolveThemePath(value, root, label) {
  if (
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    value.split(/[\\/]/u).some(segment => segment === '..' || segment === '.')
  ) {
    throw new Error(
      `Invalid ${label} "${value}": it must stay inside the theme directory.`,
    );
  }
  try {
    return assertWithin(value, root, {label});
  } catch (error) {
    if (error instanceof PathSafetyError) {
      throw new Error(error.message, {cause: error});
    }
    throw error;
  }
}

export const THEME_MODULE_EXTENSIONS = [
  '.mjs',
  '.js',
  '.mts',
  '.ts',
  '.tsx',
  '.jsx',
];

/** A theme directory's name: lower-kebab, starting with a letter. */
export const THEME_SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * @param {unknown} specifier
 * @param {string} fromFile
 * @returns {string[]}
 */
function localThemeModuleCandidates(specifier, fromFile) {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) return [];
  const base = path.resolve(path.dirname(fromFile), specifier);
  return [
    base,
    ...THEME_MODULE_EXTENSIONS.map(extension => `${base}${extension}`),
    ...THEME_MODULE_EXTENSIONS.map(extension =>
      path.join(base, `index${extension}`),
    ),
  ];
}

/**
 * Resolve a local theme module only when the target is a listed file confined
 * to the theme directory.
 * @param {unknown} specifier
 * @param {string} fromFile
 * @param {string} themeDir
 * @param {Set<string>} allowedFiles
 */
function resolveLocalThemeModule(specifier, fromFile, themeDir, allowedFiles) {
  const candidates = localThemeModuleCandidates(specifier, fromFile);
  for (const candidate of candidates) {
    try {
      if (!fs.statSync(candidate).isFile()) continue;
      const confined = assertWithin(candidate, themeDir, {
        allowAbsolute: true,
        label: 'theme module',
      });
      if (allowedFiles.has(confined)) return confined;
    } catch {
      // Missing, non-file, escaped, and unlisted candidates are not reachable.
    }
  }
  return null;
}

class ThemeModuleReferenceError extends Error {}
class ThemeRuntimeExportError extends Error {}

/**
 * Every string specifier a module imports, re-exports, or imports dynamically.
 * @param {string} file
 * @param {any} jscodeshift
 * @returns {string[]}
 */
function moduleSpecifiers(file, jscodeshift) {
  const parser = /\.(?:ts|tsx|mts|cts)$/u.test(file) ? 'tsx' : 'babel';
  const j = jscodeshift.withParser(parser);
  const root = j(fs.readFileSync(file, 'utf-8'));
  /** @type {string[]} */
  const specifiers = [];
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ importPath) => {
    if (typeof importPath.node.source?.value === 'string') {
      specifiers.push(importPath.node.source.value);
    }
  });
  root
    .find(j.ExportNamedDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      if (typeof exportPath.node.source?.value === 'string') {
        specifiers.push(exportPath.node.source.value);
      }
    });
  root.find(j.ExportAllDeclaration).forEach((/** @type {any} */ exportPath) => {
    if (typeof exportPath.node.source?.value === 'string') {
      specifiers.push(exportPath.node.source.value);
    }
  });
  root.find(j.CallExpression).forEach((/** @type {any} */ callPath) => {
    if (
      callPath.node.callee?.type === 'Import' &&
      typeof callPath.node.arguments?.[0]?.value === 'string'
    ) {
      specifiers.push(callPath.node.arguments[0].value);
    }
  });
  root.find(j.ImportExpression).forEach((/** @type {any} */ importPath) => {
    if (typeof importPath.node.source?.value === 'string') {
      specifiers.push(importPath.node.source.value);
    }
  });

  return specifiers;
}

/**
 * Every module a theme source file imports or re-exports, as written.
 * @param {string} file
 * @returns {string[]}
 */
export function themeFileImports(file) {
  return moduleSpecifiers(file, sourceParser());
}

/**
 * Validate that every local static dependency is copied with the theme.
 * @param {string} file
 * @param {any} jscodeshift
 * @param {string} themeDir
 * @param {Set<string>} allowedFiles
 * @param {string} owner
 * @param {string} entry
 * @param {string} descriptorPath
 * @param {Set<string>} [seen]
 */
function validateThemeModuleGraph(
  file,
  jscodeshift,
  themeDir,
  allowedFiles,
  owner,
  entry,
  descriptorPath,
  seen = new Set(),
) {
  if (seen.has(file)) return;
  seen.add(file);

  for (const specifier of moduleSpecifiers(file, jscodeshift)) {
    if (!specifier.startsWith('.')) continue;
    const target = resolveLocalThemeModule(
      specifier,
      file,
      themeDir,
      allowedFiles,
    );
    if (!target) {
      const referencesDescriptor = localThemeModuleCandidates(
        specifier,
        file,
      ).some(
        candidate => path.resolve(candidate) === path.resolve(descriptorPath),
      );
      if (referencesDescriptor) {
        throw new ThemeModuleReferenceError(
          `Theme entry "${entry}" from ${owner} must not import its descriptor "${path.basename(descriptorPath)}". Theme descriptors are authoring metadata, not runtime modules.`,
        );
      }
      throw new ThemeModuleReferenceError(
        `Theme entry "${entry}" from ${owner} references local module "${specifier}" that must resolve to a file inside the theme directory.`,
      );
    }
    if (THEME_MODULE_EXTENSIONS.includes(path.extname(target))) {
      validateThemeModuleGraph(
        target,
        jscodeshift,
        themeDir,
        allowedFiles,
        owner,
        entry,
        descriptorPath,
        seen,
      );
    }
  }
}

/** @param {any} declaration @param {string} exportName */
function declarationExportsName(declaration, exportName) {
  if (!declaration || declaration.declare === true) return false;
  if (
    (declaration.type === 'FunctionDeclaration' ||
      declaration.type === 'ClassDeclaration') &&
    declaration.id?.name === exportName
  ) {
    return true;
  }
  return (
    declaration.type === 'VariableDeclaration' &&
    declaration.declarations.some(
      (/** @type {any} */ declarationItem) =>
        declarationItem.id?.type === 'Identifier' &&
        declarationItem.id.name === exportName,
    )
  );
}

/**
 * Resolve a source-less export specifier to a real top-level runtime binding.
 * @param {any[]} statements
 * @param {string} localName
 * @param {string} file
 * @param {any} jscodeshift
 * @param {string} themeDir
 * @param {Set<string>} allowedFiles
 * @param {Set<string>} seen
 */
function hasRuntimeBinding(
  statements,
  localName,
  file,
  jscodeshift,
  themeDir,
  allowedFiles,
  seen,
) {
  if (
    statements.some((/** @type {any} */ statement) =>
      declarationExportsName(statement, localName),
    )
  ) {
    return true;
  }

  for (const statement of statements) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type'
    ) {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier.local?.name !== localName ||
        specifier.importKind === 'type'
      ) {
        continue;
      }
      const source = statement.source?.value;
      if (typeof source !== 'string') return false;
      if (!source.startsWith('.')) return true;
      const target = resolveLocalThemeModule(
        source,
        file,
        themeDir,
        allowedFiles,
      );
      if (!target) return false;
      if (specifier.type === 'ImportNamespaceSpecifier') return true;
      const importedName =
        specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : (specifier.imported?.name ?? specifier.imported?.value);
      return (
        typeof importedName === 'string' &&
        moduleExportsName(
          target,
          importedName,
          jscodeshift,
          themeDir,
          allowedFiles,
          seen,
        )
      );
    }
  }
  return false;
}

/** @param {any} declaration */
function isRuntimeDefaultDeclaration(declaration) {
  return (
    declaration != null &&
    declaration.declare !== true &&
    ![
      'TSDeclareFunction',
      'TSInterfaceDeclaration',
      'TSTypeAliasDeclaration',
    ].includes(declaration.type)
  );
}

/**
 * Prove a named runtime export without executing the module. Local ESM
 * re-exports are followed recursively.
 * @param {string} file
 * @param {string} exportName
 * @param {any} jscodeshift
 * @param {string} themeDir
 * @param {Set<string>} allowedFiles
 * @param {Set<string>} [seen]
 */
function moduleExportsName(
  file,
  exportName,
  jscodeshift,
  themeDir,
  allowedFiles,
  seen = new Set(),
) {
  const identity = `${file}\0${exportName}`;
  if (seen.has(identity) || !allowedFiles.has(file) || !fs.existsSync(file)) {
    return false;
  }
  seen.add(identity);

  const parser = /\.(?:ts|tsx|mts)$/u.test(file) ? 'tsx' : 'babel';
  const j = jscodeshift.withParser(parser);
  const root = j(fs.readFileSync(file, 'utf-8'));
  const statements = root.find(j.Program).nodes()[0]?.body ?? [];
  let found = false;
  root
    .find(j.ExportNamedDeclaration)
    .forEach((/** @type {any} */ exportPath) => {
      if (found || exportPath.node.exportKind === 'type') return;
      if (declarationExportsName(exportPath.node.declaration, exportName)) {
        found = true;
        return;
      }
      for (const specifier of exportPath.node.specifiers ?? []) {
        if (
          specifier.type !== 'ExportSpecifier' ||
          specifier.exportKind === 'type' ||
          (specifier.exported?.name ?? specifier.exported?.value) !== exportName
        ) {
          continue;
        }
        if (!exportPath.node.source) {
          const localName = specifier.local?.name ?? specifier.local?.value;
          if (
            typeof localName === 'string' &&
            hasRuntimeBinding(
              statements,
              localName,
              file,
              jscodeshift,
              themeDir,
              allowedFiles,
              seen,
            )
          ) {
            found = true;
            return;
          }
          continue;
        }
        const target = resolveLocalThemeModule(
          exportPath.node.source.value,
          file,
          themeDir,
          allowedFiles,
        );
        const imported =
          specifier.local?.name ?? specifier.local?.value ?? exportName;
        if (
          target &&
          moduleExportsName(
            target,
            imported,
            jscodeshift,
            themeDir,
            allowedFiles,
            seen,
          )
        ) {
          found = true;
          return;
        }
      }
    });
  if (found) return true;
  if (
    exportName === 'default' &&
    statements.some(
      (/** @type {any} */ statement) =>
        statement.type === 'ExportDefaultDeclaration' &&
        isRuntimeDefaultDeclaration(statement.declaration),
    )
  ) {
    return true;
  }

  root.find(j.ExportAllDeclaration).forEach((/** @type {any} */ exportPath) => {
    if (found || exportPath.node.exportKind === 'type') return;
    const target = resolveLocalThemeModule(
      exportPath.node.source?.value,
      file,
      themeDir,
      allowedFiles,
    );
    if (
      target &&
      moduleExportsName(
        target,
        exportName,
        jscodeshift,
        themeDir,
        allowedFiles,
        seen,
      )
    ) {
      found = true;
    }
  });
  return found;
}

/**
 * An expression without the parentheses around it.
 * @param {any} node
 * @returns {any}
 */
function unparenthesized(node) {
  let current = node;
  while (current?.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return current;
}

/**
 * Convert one static literal used by ThemeDoc. Theme descriptors intentionally
 * contain data only so synchronous bundled-theme APIs stay synchronous.
 * @param {any} node
 * @param {string} label
 * @returns {string | boolean}
 */
function staticThemeValue(node, label) {
  if (node?.type === 'StringLiteral' || node?.type === 'BooleanLiteral') {
    return node.value;
  }
  throw new Error(
    `${label} must use static string and boolean values in its default export.`,
  );
}

/**
 * Convert one static literal of a data descriptor (an icon definition): a
 * string, a boolean, or an array or plain object of those.
 * @param {any} node
 * @param {string} label
 * @returns {unknown}
 */
function staticDataValue(node, label) {
  if (node?.type === 'StringLiteral' || node?.type === 'BooleanLiteral') {
    return node.value;
  }
  if (node?.type === 'ArrayExpression') {
    return node.elements.map((/** @type {any} */ element) =>
      staticDataValue(unparenthesized(element), label),
    );
  }
  if (node?.type === 'ObjectExpression') {
    return staticObject(node, label, staticDataValue);
  }
  throw new Error(
    `${label} must use static strings, booleans, arrays, and objects in its default export.`,
  );
}

/**
 * A static object literal, every value converted by `convert`.
 * @param {any} object
 * @param {string} label
 * @param {(node: any, label: string) => unknown} convert
 * @returns {Record<string, any>}
 */
function staticObject(object, label, convert) {
  /** @type {Record<string, any>} */
  const value = {};
  for (const property of object.properties) {
    if (property.type !== 'ObjectProperty' || property.computed) {
      throw new Error(`${label} must contain only static object properties.`);
    }
    const key =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'StringLiteral'
          ? property.key.value
          : null;
    if (key === null) {
      throw new Error(`${label} has an invalid property name.`);
    }
    if (Object.hasOwn(value, key)) {
      throw new Error(`${label} declares "${key}" more than once.`);
    }
    // Defined, not assigned, so `__proto__` stays a key the parser rejects.
    Object.defineProperty(value, key, {
      value: convert(unparenthesized(property.value), label),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return value;
}

/**
 * How messages about a theme descriptor name it.
 * @param {string} docPath
 * @param {string} owner
 */
export function themeDescriptorLabel(docPath, owner) {
  return `Theme descriptor ${path.basename(docPath)} for ${owner}`;
}

/**
 * Read one strongly typed theme descriptor without executing it, and compile
 * it.
 * @param {string} docPath
 * @param {string} owner
 * @returns {import('../../authoring/doctypes/theme/type').ThemeDoc}
 */
function readThemeDoc(docPath, owner) {
  const label = themeDescriptorLabel(docPath, owner);
  const value = readThemeDescriptorValue(docPath, label);
  // Read statically, never executed, then compiled like every other doc.
  const {node, failed, failure} = lowerDoc({
    id: `${owner}:themes:${path.basename(docPath)}`,
    root: 'themes',
    provider: owner,
    source: packageSource(docPath),
    lang: null,
    file: {file: path.basename(docPath), doc: value},
    label,
  });
  if (!node || failed) throw failure;
  return node.doc;
}

/**
 * Descriptor reads in this process, by path and label, reused while the file
 * keeps its size and mtime.
 * @type {Map<string, {size: number, mtimeMs: number, read: {value: Record<string, any>} | {error: unknown}}>}
 */
const descriptorReads = new Map();

/**
 * The static value a theme descriptor default-exports, read from its source
 * without executing it. Throws when the file is not one static ThemeDoc
 * object.
 * @param {string} docPath
 * @param {string} label
 * @returns {Record<string, string | boolean>}
 */
export function readThemeDescriptorValue(docPath, label) {
  return readStaticDescriptorValue(docPath, label, 'ThemeDoc');
}

/**
 * The static value a typed descriptor default-exports, read from its source
 * without executing it. Throws when the file is not one static object typed
 * with `typeName` from `@astryxdesign/cli/authoring`. Theme and icon-set
 * descriptors share this reader.
 * @param {string} docPath
 * @param {string} label
 * @param {string} typeName the public authoring type, such as `ThemeDoc`
 * @param {{data?: boolean}} [options] `data`: also accept arrays and plain
 *   objects of static values (icon definitions)
 * @returns {Record<string, any>}
 */
export function readStaticDescriptorValue(
  docPath,
  label,
  typeName,
  {data = false} = {},
) {
  const {size, mtimeMs} = fs.statSync(docPath);
  const key = `${docPath}\0${label}\0${typeName}\0${data}`;
  let cached = descriptorReads.get(key);
  if (!cached || cached.size !== size || cached.mtimeMs !== mtimeMs) {
    /** @type {{value: Record<string, any>} | {error: unknown}} */
    let read;
    try {
      read = {
        value: readDescriptorSource(
          fs.readFileSync(docPath, 'utf-8'),
          label,
          typeName,
          data,
        ),
      };
    } catch (error) {
      read = {error};
    }
    cached = {size, mtimeMs, read};
    descriptorReads.set(key, cached);
  }
  if ('error' in cached.read) throw cached.read.error;
  return data ? structuredClone(cached.read.value) : {...cached.read.value};
}

/**
 * @param {string} source
 * @param {string} label
 * @param {string} typeName
 * @param {boolean} [data]
 * @returns {Record<string, any>}
 */
function readDescriptorSource(source, label, typeName, data = false) {
  /** @type {any} */
  let ast;
  try {
    ast = descriptorParser().parse(source, {
      sourceType: 'module',
      tokens: true,
      createParenthesizedExpressions: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be parsed: ${message}`, {cause: error});
  }

  const statements = ast.program.body;
  const defaults = statements.filter(
    (/** @type {any} */ statement) =>
      statement.type === 'ExportDefaultDeclaration',
  );
  const unsupported = statements.filter(
    (/** @type {any} */ statement) =>
      statement.type !== 'ExportDefaultDeclaration' &&
      statement.type !== 'EmptyStatement',
  );
  if (unsupported.length > 0 || ast.program.directives.length > 0) {
    throw new Error(
      `${label} must contain only its static default-exported ${typeName} object.`,
    );
  }
  const object =
    defaults.length === 1 && unparenthesized(defaults[0].declaration);
  if (object?.type !== 'ObjectExpression') {
    throw new Error(
      `${label} must default-export one static ${typeName} object.`,
    );
  }
  if (!declaresDocType(ast, defaults[0], typeName)) {
    throw new Error(
      `${label} must declare its public ${typeName} type from @astryxdesign/cli/authoring.`,
    );
  }

  return staticObject(object, label, data ? staticDataValue : staticThemeValue);
}

/**
 * `import('@astryxdesign/cli/authoring').<typeName>`, without whitespace.
 * @param {string} typeName
 */
const authoringTypeRe = typeName =>
  new RegExp(
    String.raw`^import\((['"])@astryxdesign\/cli\/authoring\1\)\.${typeName}$`,
    'u',
  );

/** @param {any} comment */
function isJsdoc(comment) {
  return comment.type === 'CommentBlock' && comment.value.startsWith('*');
}

/** @param {string} ch */
const isSpace = ch => ch === ' ' || ch === '\t';

/**
 * The tags of one JSDoc comment, found the way TypeScript's JSDoc scanner
 * finds them: an `@` starts a tag at the start of a line (after the margin
 * `*`), or after a space and before a non-space, never inside a backtick span
 * of a tag's text. Each tag's text runs to the next tag, margins removed.
 * @param {string} value the comment's body, as Babel gives it
 * @returns {{name: string, text: string}[]}
 */
function jsdocTags(value) {
  const body = value.slice(1);
  /** @type {number[]} */
  const starts = [];
  let lineStart = true;
  let sawAsterisk = true;
  let inTag = false;
  let backticks = false;
  for (let index = 0; index < body.length; index++) {
    const ch = body[index];
    if (ch === '\n' || ch === '\r') {
      lineStart = true;
      sawAsterisk = false;
      backticks = false;
      continue;
    }
    if (lineStart) {
      if (isSpace(ch)) continue;
      if (ch === '*' && !sawAsterisk) {
        sawAsterisk = true;
        continue;
      }
      lineStart = false;
      if (ch === '@') {
        starts.push(index);
        inTag = true;
        continue;
      }
    }
    if (ch === '`' && inTag) {
      backticks = !backticks;
    } else if (
      ch === '@' &&
      !backticks &&
      isSpace(body[index - 1] ?? '') &&
      !/\s/u.test(body[index + 1] ?? ' ')
    ) {
      starts.push(index);
      inTag = true;
      backticks = false;
    }
  }
  return starts.map((start, position) => {
    const raw = body.slice(start + 1, starts[position + 1] ?? body.length);
    const name = /^[\w$]*/u.exec(raw)?.[0] ?? '';
    const text = raw.slice(name.length).replace(/(\r?\n)[ \t]*\*?/gu, '$1');
    return {name, text};
  });
}

/**
 * The braced type at the start of a tag's text, and what follows it.
 * @param {string} text
 * @returns {{type: string, rest: string} | null}
 */
function bracedType(text) {
  const open = text.search(/\S/u);
  if (open === -1 || text[open] !== '{') return null;
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  for (let index = open; index < text.length; index++) {
    const ch = text[index];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}' && --depth === 0) {
      return {
        type: text.slice(open + 1, index).replace(/\s+/gu, ''),
        rest: text.slice(index + 1),
      };
    }
  }
  return null;
}

/**
 * Split a type at top-level occurrences of one operator.
 * @param {string} type
 * @param {string} operator
 */
function splitType(type, operator) {
  /** @type {string[]} */
  const parts = [];
  let depth = 0;
  /** @type {string | null} */
  let quote = null;
  let last = 0;
  for (let index = 0; index < type.length; index++) {
    const ch = type[index];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
    } else if ('([{<'.includes(ch)) {
      depth++;
    } else if (')]}>'.includes(ch)) {
      depth--;
    } else if (ch === operator && depth === 0) {
      parts.push(type.slice(last, index));
      last = index + 1;
    }
  }
  parts.push(type.slice(last));
  return parts;
}

/** @param {string} type */
function wrappedInParens(type) {
  if (!type.startsWith('(') || !type.endsWith(')')) return false;
  let depth = 0;
  for (let index = 0; index < type.length; index++) {
    if (type[index] === '(') depth++;
    else if (type[index] === ')' && --depth === 0) {
      return index === type.length - 1;
    }
  }
  return false;
}

/**
 * Whether a JSDoc type, whitespace removed, checks an object literal exactly
 * as `typeName` does: the type or one of its aliases, optionally
 * parenthesized, marked `!`, `?` or `=`, joined with `null` or `undefined`, or
 * intersected with `{}`.
 * @param {string} type
 * @param {Map<string, string>} aliases alias name to the type it names
 * @param {string} typeName
 * @param {Set<string>} [seen]
 * @returns {boolean}
 */
function isDocType(type, aliases, typeName, seen = new Set()) {
  let current = type;
  for (;;) {
    if (/^[!?]/u.test(current)) current = current.slice(1);
    else if (current.endsWith('=')) current = current.slice(0, -1);
    else if (wrappedInParens(current)) current = current.slice(1, -1);
    else break;
  }
  const members = splitType(current, '|').filter(
    member => member !== 'null' && member !== 'undefined',
  );
  if (members.length !== 1) return false;
  if (members[0] !== current) {
    return isDocType(members[0], aliases, typeName, seen);
  }
  const parts = splitType(current, '&').filter(part => part !== '{}');
  if (parts.length !== 1) return false;
  if (parts[0] !== current) return isDocType(parts[0], aliases, typeName, seen);
  if (authoringTypeRe(typeName).test(current)) return true;
  const named = aliases.get(current);
  if (named === undefined || seen.has(current)) return false;
  seen.add(current);
  return isDocType(named, aliases, typeName, seen);
}

const AUTHORING = String.raw`(['"])@astryxdesign\/cli\/authoring\2`;

/**
 * The type names the file's JSDoc binds with `@typedef` or `@import`, from any
 * JSDoc comment in the module, as TypeScript reads them.
 * @param {any[]} comments
 * @param {string} typeName
 * @returns {Map<string, string>}
 */
function jsdocAliases(comments, typeName) {
  /** @type {Map<string, string>} */
  const aliases = new Map();
  const theme = `import('@astryxdesign/cli/authoring').${typeName}`;
  for (const comment of comments.filter(isJsdoc)) {
    for (const tag of jsdocTags(comment.value)) {
      if (tag.name === 'typedef') {
        const typed = bracedType(tag.text);
        const name = typed && /^\s*([$A-Z_a-z][$\w]*)/u.exec(typed.rest)?.[1];
        if (typed && name) aliases.set(name, typed.type);
      } else if (tag.name === 'import') {
        const named = new RegExp(
          String.raw`^\s*\{([^{}]*)\}\s*from\s*${AUTHORING}`,
          'u',
        ).exec(tag.text);
        for (const specifier of named?.[1].split(',') ?? []) {
          const match = new RegExp(
            String.raw`^\s*(?:type\s+)?${typeName}(?:\s+as\s+([$A-Z_a-z][$\w]*))?\s*$`,
            'u',
          ).exec(specifier);
          if (match) aliases.set(match[1] ?? typeName, theme);
        }
        const namespace = new RegExp(
          String.raw`^\s*\*\s*as\s+([$A-Z_a-z][$\w]*)\s+from\s*${AUTHORING}`,
          'u',
        ).exec(tag.text)?.[1];
        if (namespace) aliases.set(`${namespace}.${typeName}`, theme);
      }
    }
  }
  return aliases;
}

/**
 * Whether the JSDoc TypeScript reads for the default export types it as the
 * public `typeName` (such as ThemeDoc): `@type` in the last JSDoc comment between the previous
 * token and `export`, or `@type` or `@satisfies` in the last one between the
 * previous token and the opening parenthesis of a JSDoc cast of the object.
 * Line comments, strings, code spans, and JSDoc anywhere else never type it.
 * @param {any} ast parsed with tokens and parenthesized expressions
 * @param {any} exportDefault
 * @param {string} typeName
 */
function declaresDocType(ast, exportDefault, typeName) {
  const tokens = ast.tokens.filter(
    (/** @type {any} */ token) => typeof token.type !== 'string',
  );
  const comments = ast.comments ?? [];
  /** @param {number} start */
  const jsdocBefore = start => {
    const after =
      tokens.filter((/** @type {any} */ token) => token.end <= start).at(-1)
        ?.end ?? 0;
    return comments
      .filter(
        (/** @type {any} */ comment) =>
          isJsdoc(comment) && comment.start >= after && comment.end <= start,
      )
      .at(-1);
  };
  /** @type {Array<{comment: any, tags: string[]}>} */
  const attached = [
    {comment: jsdocBefore(exportDefault.start), tags: ['type']},
  ];
  for (
    let node = exportDefault.declaration;
    node.type === 'ParenthesizedExpression';
    node = node.expression
  ) {
    attached.push({
      comment: jsdocBefore(node.start),
      tags: ['type', 'satisfies'],
    });
  }
  const aliases = jsdocAliases(comments, typeName);
  return attached.some(({comment, tags}) => {
    if (!comment) return false;
    const found = jsdocTags(comment.value);
    return tags.some(name => {
      const tag = found.find(candidate => candidate.name === name);
      const typed = tag && bracedType(tag.text);
      return typed != null && isDocType(typed.type, aliases, typeName);
    });
  });
}

/**
 * Whether a file is the module `astryx theme build` writes rather than a
 * theme source: plain JavaScript that carries the build's generated header
 * and never calls defineTheme.
 * @param {string} file
 */
function isBuiltThemeModule(file) {
  if (!/\.m?js$/u.test(file)) return false;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  return (
    /@generated by `astryx theme build`/u.test(text) &&
    !/\bdefineTheme\b/u.test(text)
  );
}

/**
 * The fix when a descriptor's stem names both a theme source and the module
 * `astryx theme build` writes beside it (`brand.ts` and its built `brand.js`):
 * the build names its output after the theme, so the source and descriptor
 * take the `<name>Theme` stem instead. Null when no built module is among
 * the matches, or the stem already ends in `Theme`.
 * @param {string} sourceDir
 * @param {string[]} sources same-stem module file names
 * @param {string} doc the descriptor's file name
 * @param {string} exportName the descriptor's stem
 * @returns {string | null}
 */
function builtThemeSourceFix(sourceDir, sources, doc, exportName) {
  if (exportName.endsWith('Theme')) return null;
  const built = sources.filter(file =>
    isBuiltThemeModule(path.join(sourceDir, file)),
  );
  const source = sources.filter(file => !built.includes(file));
  if (built.length === 0 || source.length !== 1) return null;
  const extension = source[0].slice(exportName.length);
  const stem = `${exportName}Theme`;
  return `Fix: ${built.map(file => `"${file}"`).join(', ')} is the module \`${formatCliCommand('theme build', sourceDir)}\` writes, which takes the theme's name; rename ${source[0]} to ${stem}${extension} and ${doc} to ${stem}${THEME_DOC_SUFFIX}, export \`${stem}\` from it, and build again.`;
}

/**
 * Why a descriptor pairs with the built module and the built module lacks
 * the export the descriptor's stem names (`ocean.doc.mjs` beside a built
 * `ocean.js` that exports `oceanTheme`): the descriptor is named for the
 * build's output, not the theme's source. The source is named only when the
 * built module's `Source:` header, or a source whose defineTheme gives the
 * theme's name, confirms it; otherwise the message stays generic. Null when
 * the entry is not a built module.
 * @param {string} label the descriptor, as messages name it
 * @param {string} sourceDir
 * @param {string} entry the file the descriptor pairs with
 * @param {string} exportName the descriptor's stem
 * @param {string} doc the descriptor's file name
 * @param {string} slug the theme's name
 * @param {string[]} files the theme folder's files
 * @returns {string | null}
 */
function builtModuleDescriptorMessage(
  label,
  sourceDir,
  entry,
  exportName,
  doc,
  slug,
  files,
) {
  if (!isBuiltThemeModule(path.join(sourceDir, entry))) return null;
  const source = confirmedThemeSource(sourceDir, entry, slug, files);
  const head = `${label} shares its stem with the built module "${entry}", which does not export "${exportName}": a descriptor must share its stem with the source that calls defineTheme.`;
  if (source == null) {
    return `${head} Fix: rename ${doc} to share its stem with the theme's source (the module that calls defineTheme, such as ${exportName}Theme.ts).`;
  }
  const stem = source.replace(/\.[^.]+$/u, '');
  return `${head} The theme's source is "${source}". Fix: rename ${doc} to ${stem}${THEME_DOC_SUFFIX}.`;
}

/**
 * The theme's source, when something confirms it: the file the built
 * module's `Source:` header names, if it is in the folder, else the one
 * module in the folder whose defineTheme gives the theme's name as a
 * literal. Null otherwise: a `<name>Theme` file alone may be a helper.
 * @param {string} sourceDir
 * @param {string} built the built module's file name
 * @param {string} slug
 * @param {string[]} files
 * @returns {string | null}
 */
function confirmedThemeSource(sourceDir, built, slug, files) {
  const own = files.filter(
    file =>
      !file.includes('/') &&
      file !== built &&
      THEME_MODULE_EXTENSIONS.some(extension => file.endsWith(extension)),
  );
  /** @param {string} file */
  const read = file => {
    try {
      return fs.readFileSync(path.join(sourceDir, file), 'utf8');
    } catch {
      return '';
    }
  };
  const header = /^\s*\*?\s*Source:\s*(\S+)\s*$/mu.exec(read(built));
  if (header) {
    const named = path.posix.basename(header[1].replace(/\\/gu, '/'));
    if (own.includes(named)) return named;
  }
  const quoted = slug.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const naming = new RegExp(
    `\\bdefineTheme\\s*\\(\\s*\\{[^}]*\\bname\\s*:\\s*['"\`]${quoted}['"\`]`,
    'u',
  );
  const matches = own.filter(file => naming.test(read(file)));
  return matches.length === 1 ? matches[0] : null;
}

/** A module named for the theme it exports, such as `oceanTheme.ts`. */
const THEME_SOURCE_RE = /^[$A-Z_a-z][$\w]*Theme\.(?:mjs|js|mts|ts|tsx|jsx)$/u;

/**
 * Whether an entry at any depth of a themes root is outside every theme: a dot
 * entry, or a name npm never publishes (npm-packlist's defaults).
 * @param {string} name
 */
export function isIgnoredThemeEntry(name) {
  return (
    name.startsWith('.') ||
    name === 'node_modules' ||
    name === 'CVS' ||
    name === 'npm-debug.log' ||
    name.endsWith('.orig')
  );
}

/**
 * Every entry below one folder of a theme root, without following symlinks
 * and without {@link isIgnoredThemeEntry} entries.
 * @param {string} folder
 * @returns {{files: string[], symlinks: string[]}} sorted POSIX paths
 *   relative to the folder
 */
function listThemeFolder(folder) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const symlinks = [];
  /** @param {string} directory */
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
      if (isIgnoredThemeEntry(entry.name)) continue;
      const full = path.join(directory, entry.name);
      const relative = path.relative(folder, full).split(path.sep).join('/');
      if (entry.isSymbolicLink()) symlinks.push(relative);
      else if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(relative);
    }
  }
  walk(folder);
  return {files: files.sort(), symlinks: symlinks.sort()};
}

/**
 * The first entry that makes a folder a theme: a `.doc.mjs` descriptor or a
 * `<name>Theme` source, at any depth, linked or not.
 * @param {{files: string[], symlinks: string[]}} listing
 * @returns {string | undefined}
 */
function themeEvidence({files, symlinks}) {
  return [...files, ...symlinks].sort().find(file => {
    const name = path.posix.basename(file);
    return name.endsWith(THEME_DOC_SUFFIX) || THEME_SOURCE_RE.test(name);
  });
}

/**
 * Whether discovery reads a folder under a theme root as a theme. Dot-folders
 * and folders with neither a descriptor nor a `<name>Theme` source are not.
 * @param {string} folder absolute path
 */
export function isThemeFolder(folder) {
  return (
    !isIgnoredThemeEntry(path.basename(folder)) &&
    themeEvidence(listThemeFolder(folder)) !== undefined
  );
}

/**
 * The files one theme folder ships: every regular file below it except
 * {@link isIgnoredThemeEntry} entries. What pack-check requires and what
 * `theme eject` copies.
 * @param {string} folder absolute path
 * @returns {string[]} sorted POSIX paths relative to the folder
 */
export function listThemeFiles(folder) {
  return listThemeFolder(folder).files;
}

/**
 * @typedef {object} UnmigratedThemeCopy
 * @property {string} slug
 * @property {string} sourceDir
 * @property {string} entry
 * @property {string} exportName
 * @property {string} descriptor
 */

/**
 * Recognize the shape released `theme add` copied before local descriptors
 * existed. Keep this narrow so an unrelated broken folder still follows the
 * ordinary discovery error path.
 * @param {string} folder
 * @returns {UnmigratedThemeCopy|null}
 */
function unmigratedThemeCopy(folder) {
  const slug = path.basename(folder);
  if (!THEME_SLUG_RE.test(slug)) return null;
  const listing = listThemeFolder(folder);
  if (
    listing.symlinks.length > 0 ||
    listing.files.some(file => file.endsWith(THEME_DOC_SUFFIX))
  ) {
    return null;
  }
  const sources = listing.files.filter(
    file => !file.includes('/') && THEME_SOURCE_RE.test(file),
  );
  if (sources.length !== 1) return null;
  const entry = sources[0];
  const exportName = entry.replace(/\.(?:mjs|js|mts|ts|tsx|jsx)$/u, '');
  return {
    slug,
    sourceDir: folder,
    entry,
    exportName,
    descriptor: `${exportName}${THEME_DOC_SUFFIX}`,
  };
}

/**
 * Source copies left by the released `theme add`, before it copied a
 * descriptor. Commands skip these until the next-release project codemod adds
 * the same-stem descriptor.
 * @param {string} projectDir
 * @param {string} [owner]
 * @returns {UnmigratedThemeCopy[]}
 */
export function discoverUnmigratedThemeCopies(
  projectDir,
  owner = LOCAL_THEME_ROOT,
) {
  const root = path.resolve(projectDir, owner);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return fs
    .readdirSync(root, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && !isIgnoredThemeEntry(entry.name))
    .map(entry => unmigratedThemeCopy(path.join(root, entry.name)))
    .filter(copy => copy !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** @param {string[]} files */
function quoted(files) {
  return files.map(file => `"${file}"`).join(', ');
}

/**
 * The files `theme eject` copies after a bundled theme's entry, in copy order. SYNC: scripts/generate-cli-themes.mjs bundles these.
 * @param {string} id the theme's export name without `Theme`
 */
function bundledThemeArtifacts(id) {
  return [
    'icons.tsx',
    `${id}Palettes.ts`,
    `${id}Palettes.generated.ts`,
    `${id}PaletteRefs.generated.ts`,
    `${id}Palettes.generated.receipt.json`,
    'palette.config.json',
  ];
}

/**
 * The files `theme eject` copies, entry first. Every ejected theme keeps its
 * same-stem descriptor so the local themes root remains discoverable without a
 * catalog. An integration theme copies its complete directory.
 * @param {string[]} files every regular file in the theme directory, sorted
 * @param {string} entry
 * @param {string} descriptor
 * @param {string} exportName
 * @param {boolean} bundled
 */
function copiedThemeFiles(files, entry, descriptor, exportName, bundled) {
  const rest = files.filter(file => file !== entry && file !== descriptor);
  if (!bundled) return [entry, descriptor, ...rest];
  const order = bundledThemeArtifacts(exportName.replace(/Theme$/u, ''));
  return [
    entry,
    descriptor,
    ...order.filter(file => rest.includes(file)),
    ...rest.filter(file => !order.includes(file)),
  ];
}

/**
 * Discover and validate one theme root.
 * @param {string} themeRoot absolute root containing one directory per slug
 * @param {string} owner package that owns the root
 * @param {{bundled?: boolean, allowUnmigrated?: boolean}} [options] a bundled root is the CLI's own; its
 *   sources are checked by the CLI's tests rather than on every read. A local
 *   root may skip released source copies until `astryx upgrade` adds descriptors.
 * @returns {DiscoveredTheme[]}
 */
export function discoverThemeDirectory(
  themeRoot,
  owner,
  {bundled = false, allowUnmigrated = false} = {},
) {
  if (!fs.existsSync(themeRoot) || !fs.statSync(themeRoot).isDirectory()) {
    throw new Error(
      `Declared themes root does not exist on disk: ${themeRoot}`,
    );
  }
  if (fs.existsSync(path.join(themeRoot, 'manifest.json'))) {
    throw new Error(
      `Theme root for ${owner} contains manifest.json, the theme catalog Astryx 0.6 wrote; each theme now carries a strongly typed same-stem .doc.mjs descriptor instead. To convert it, run \`astryx upgrade --from 0.6.3 --path . --apply\` in the package, or add each theme's descriptor and delete manifest.json.`,
    );
  }

  /** @type {DiscoveredTheme[]} */
  const themes = [];
  const slugs = new Set();
  const rootEntries = fs
    .readdirSync(themeRoot, {withFileTypes: true})
    .filter(entry => !isIgnoredThemeEntry(entry.name));
  const rootDescriptor = rootEntries.find(
    entry => entry.isFile() && entry.name.endsWith(THEME_DOC_SUFFIX),
  );
  if (rootDescriptor) {
    throw new Error(
      `Theme descriptor "${rootDescriptor.name}" for ${owner} must be inside a lower-kebab theme directory.`,
    );
  }
  const rootSymlink = rootEntries.find(entry => entry.isSymbolicLink());
  if (rootSymlink) {
    throw new Error(
      `Theme root for ${owner} contains symlink "${rootSymlink.name}"; theme directories must stay inside the declared root.`,
    );
  }
  const directories = rootEntries
    .filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const directory of directories) {
    const slug = directory.name;
    const listing = listThemeFolder(path.join(themeRoot, slug));
    const evidence = themeEvidence(listing);
    if (evidence === undefined) continue;
    if (!THEME_SLUG_RE.test(slug)) {
      throw new Error(
        `Theme root for ${owner} has invalid directory "${slug}"; use lowercase kebab-case starting with a letter.`,
      );
    }
    const normalizedSlug = slug.toLowerCase();
    if (slugs.has(normalizedSlug)) {
      throw new Error(
        `Theme root for ${owner} declares duplicate slug "${slug}".`,
      );
    }
    slugs.add(normalizedSlug);

    const sourceDir = resolveThemePath(
      slug,
      themeRoot,
      `theme "${slug}" directory`,
    );
    const theme = `Theme "${slug}" for ${owner}`;
    if (listing.symlinks.length > 0) {
      throw new Error(
        `${theme} contains symlink "${listing.symlinks[0]}"; theme files must be regular files inside the theme directory.`,
      );
    }
    const descriptors = listing.files.filter(file =>
      file.endsWith(THEME_DOC_SUFFIX),
    );
    const docs = descriptors.filter(file => !file.includes('/'));
    if (
      allowUnmigrated &&
      descriptors.length === 0 &&
      unmigratedThemeCopy(sourceDir)
    ) {
      continue;
    }
    if (docs.length !== 1) {
      const detail =
        docs.length > 1
          ? `: ${quoted(docs)}`
          : evidence.includes('/')
            ? `; "${evidence}" is in a subfolder`
            : ` beside "${evidence}"`;
      const themeDoc = formatCliCommand('docs authoring theme-doc', sourceDir);
      const fix =
        docs.length > 1
          ? `Fix: keep the one descriptor that shares its stem with the theme's source and delete the rest.`
          : evidence.includes('/')
            ? `Fix: move "${evidence}" up into ${slug}/, beside where its descriptor goes.`
            : THEME_SOURCE_RE.test(evidence)
              ? `Fix: add ${evidence.replace(/\.[^.]+$/u, '')}${THEME_DOC_SUFFIX} beside it with type: 'theme' and name: '${slug}'; \`${themeDoc}\` lists its fields.`
              : `Fix: add a descriptor that shares its stem with the theme's source, with type: 'theme' and name: '${slug}'; \`${themeDoc}\` lists its fields.`;
      throw new Error(
        `${theme} must contain exactly one same-stem .doc.mjs descriptor; found ${docs.length}${detail}. ${fix}`,
      );
    }
    const nested = descriptors.find(file => file.includes('/'));
    if (nested) {
      throw new Error(
        `${theme} contains more than one .doc.mjs descriptor: "${docs[0]}" and "${nested}".`,
      );
    }

    const docPath = resolveThemePath(
      docs[0],
      sourceDir,
      `theme "${slug}" descriptor`,
    );
    const label = themeDescriptorLabel(docPath, owner);
    const exportName = docs[0].slice(0, -THEME_DOC_SUFFIX.length);
    if (!/^[$A-Z_a-z][$\w]*$/u.test(exportName)) {
      throw new Error(
        `${label} has stem "${exportName}", which is not a valid runtime export name.`,
      );
    }
    const sources = THEME_MODULE_EXTENSIONS.map(
      extension => `${exportName}${extension}`,
    ).filter(file => listing.files.includes(file));
    if (sources.length !== 1) {
      const fix =
        sources.length > 1
          ? (builtThemeSourceFix(sourceDir, sources, docs[0], exportName) ??
            `Fix: keep one of them; the theme's source is a single module.`)
          : `Fix: add ${exportName}.ts beside ${docs[0]}, exporting \`${exportName}\` from defineTheme.`;
      throw new Error(
        `${theme} must contain exactly one same-stem source for ${docs[0]}; found ${sources.length}${sources.length > 1 ? `: ${quoted(sources)}` : ''}. ${fix}`,
      );
    }

    const doc = readThemeDoc(docPath, owner);
    if (doc.name !== slug) {
      throw new Error(
        `${label} names "${doc.name}" but its directory is "${slug}".`,
      );
    }
    const entry = sources[0];
    const entryPath = resolveThemePath(
      entry,
      sourceDir,
      `theme "${slug}" entry`,
    );

    if (!bundled) {
      const allowedFiles = new Set(
        listing.files
          .map(file =>
            resolveThemePath(file, sourceDir, `theme "${slug}" file`),
          )
          .filter(file => file !== docPath),
      );
      const jscodeshift = sourceParser();
      try {
        validateThemeModuleGraph(
          entryPath,
          jscodeshift,
          sourceDir,
          allowedFiles,
          owner,
          entry,
          docPath,
        );
        if (
          !moduleExportsName(
            entryPath,
            exportName,
            jscodeshift,
            sourceDir,
            allowedFiles,
          )
        ) {
          throw new ThemeRuntimeExportError(
            builtModuleDescriptorMessage(
              label,
              sourceDir,
              entry,
              exportName,
              docs[0],
              slug,
              listing.files,
            ) ??
              `Theme "${slug}" for ${owner} entry "${entry}" does not export "${exportName}".`,
          );
        }
      } catch (error) {
        if (
          error instanceof ThemeModuleReferenceError ||
          error instanceof ThemeRuntimeExportError
        ) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Theme "${slug}" for ${owner} entry "${entry}" could not be parsed: ${message}`,
          {cause: error},
        );
      }
    }

    themes.push({
      slug,
      displayName: doc.displayName,
      description: doc.description,
      maintained: doc.maintained,
      entry,
      exportName,
      files: copiedThemeFiles(
        listing.files,
        entry,
        docs[0],
        exportName,
        bundled,
      ),
      package: owner,
      source: bundled ? 'bundled' : 'package',
      sourceDir,
      bundled,
      docPath,
    });
  }

  return themes;
}

/** A JavaScript or TypeScript module. */
const MODULE_FILE_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;

/**
 * Whether a folder's files look like an attempt at a theme: a doc file of any
 * suffix, a file named for a theme, an index module, or a module named for
 * the folder.
 * @param {string} folder
 * @param {string[]} files
 */
function looksLikeTheme(folder, files) {
  const own = path.basename(folder).toLowerCase();
  return files.some(file => {
    const name = path.posix.basename(file).toLowerCase();
    const stem = name.replace(/\.[^.]+$/u, '');
    return (
      /\.doc\.[^.]+$/u.test(name) ||
      /theme/u.test(name) ||
      (MODULE_FILE_RE.test(name) && (stem === 'index' || stem === own))
    );
  });
}

/**
 * Folders under a themes root that look like themes (see looksLikeTheme)
 * but that discovery does not read as themes, and that no module elsewhere
 * under the root imports, by a relative path or through the package's own
 * name. Discovery skips them silently, as the released catalog skipped
 * unlisted folders; doctor warns.
 * @param {string} themeRoot
 * @param {{packageDir?: string, packageName?: string}} [owner]
 * @returns {string[]} absolute folder paths, sorted
 */
export function unreadThemeFolders(themeRoot, {packageDir, packageName} = {}) {
  if (!fs.existsSync(themeRoot) || !fs.statSync(themeRoot).isDirectory()) {
    return [];
  }
  const folders = fs
    .readdirSync(themeRoot, {withFileTypes: true})
    .filter(entry => entry.isDirectory() && !isIgnoredThemeEntry(entry.name))
    .map(entry => path.join(themeRoot, entry.name))
    .sort();
  const unread = folders.filter(folder => {
    if (isThemeFolder(folder)) return false;
    const {files} = listThemeFolder(folder);
    return (
      files.some(file => MODULE_FILE_RE.test(file)) &&
      looksLikeTheme(folder, files)
    );
  });
  if (unread.length === 0) return [];

  const modules = [
    ...fs
      .readdirSync(themeRoot, {withFileTypes: true})
      .filter(
        entry =>
          entry.isFile() &&
          !isIgnoredThemeEntry(entry.name) &&
          MODULE_FILE_RE.test(entry.name),
      )
      .map(entry => path.join(themeRoot, entry.name)),
    ...folders.flatMap(folder =>
      listThemeFolder(folder)
        .files.filter(file => MODULE_FILE_RE.test(file))
        .map(file => path.join(folder, file)),
    ),
  ];
  const self = packageName ? `${packageName}/` : null;
  /** @type {string[]} */
  const imported = [];
  for (const file of modules) {
    let specifiers;
    try {
      specifiers = moduleSpecifiers(file, sourceParser());
    } catch {
      continue;
    }
    for (const specifier of specifiers) {
      if (specifier.startsWith('.')) {
        imported.push(path.resolve(path.dirname(file), specifier));
      } else if (self && packageDir && specifier.startsWith(self)) {
        imported.push(path.resolve(packageDir, specifier.slice(self.length)));
      }
    }
  }
  return unread.filter(
    folder =>
      !imported.some(
        target => target === folder || target.startsWith(folder + path.sep),
      ),
  );
}

/** @type {DiscoveredTheme[] | null} */
let bundledThemeCache = null;

/** @returns {DiscoveredTheme[]} */
export function discoverBundledThemes() {
  bundledThemeCache ??= discoverThemeDirectory(
    THEMES_DIR,
    BUNDLED_THEME_PACKAGE,
    {bundled: true},
  ).map(theme => ({
    ...theme,
    importPackage: `@astryxdesign/theme-${theme.slug}`,
    source: /** @type {const} */ ('bundled'),
  }));
  return bundledThemeCache.map(theme => ({...theme, files: [...theme.files]}));
}

/**
 * Discover authored themes in the app's conventional local themes root.
 * @param {string} projectDir
 * @param {string} [owner]
 * @returns {DiscoveredTheme[]}
 */
export function discoverLocalThemes(projectDir, owner = LOCAL_THEME_ROOT) {
  const root = path.resolve(projectDir, owner);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
  return discoverThemeDirectory(root, owner, {allowUnmigrated: true}).map(
    theme => ({
      ...theme,
      package: owner,
      packageDir: projectDir,
      packageExports: null,
      source: /** @type {const} */ ('local'),
    }),
  );
}

/**
 * @param {import('../integrations/integrations.mjs').LoadedIntegration} integration
 * @returns {Promise<DiscoveredTheme[]>}
 */
export async function discoverIntegrationThemes(integration) {
  if (!integration.themes) return [];
  return discoverThemeDirectory(integration.themes, integration.name).map(
    theme => ({
      ...theme,
      packageDir: integration.__packageDir,
      packageExports: integration.__packageExports,
      source: /** @type {const} */ ('package'),
    }),
  );
}
