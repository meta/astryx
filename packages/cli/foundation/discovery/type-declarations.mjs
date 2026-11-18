// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The declarations of the named types a package exports, read from its
 * published `.d.ts` files without a compiler.
 *
 * @input A package's root declaration file and the type names to find
 * @output For each name the root exports as a type alias, an interface, or an
 *   enum: the name and its declaration text, with comments removed
 * @position Foundation discovery, used by `component <Name> --props`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {babelParse} from '../runtime/lazy-dependencies.mjs';

const EXPORT_FROM_RE =
  /export\s+(?:type\s+)?(\*|\{([^}]*)\})\s+from\s+['"]([^'"]+)['"]/g;
const EXPORT_LIST_RE = /export\s+(?:type\s+)?\{([^}]*)\}\s*;/g;
const DECLARATION_RE =
  /(?:^|\n)[ \t]*(export\s+)?(?:declare\s+)?(?:type|interface|enum|const\s+enum|class|abstract\s+class|function|const|let|namespace)\s+([A-Za-z_$][\w$]*)/g;
const TYPE_NODES = new Set([
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
]);

/**
 * @typedef {object} FileExports
 * @property {Map<string, boolean>} declared Each top-level name the file
 *   declares, and whether the declaration itself is exported.
 * @property {Map<string, {file: string, local: string}>} named Each name an
 *   export list gives, with the file and the name it has there.
 * @property {string[]} stars The files `export *` reaches.
 */

/** @type {Map<string, FileExports>} */
const fileExportsCache = new Map();
/** @type {Map<string, {text: string, ast: any} | null>} */
const parsedCache = new Map();

/**
 * The declaration file a relative specifier names; null for a package
 * specifier or a file that does not exist.
 * @param {string} specifier
 * @param {string} fromFile
 * @returns {string | null}
 */
function declarationFileOf(specifier, fromFile) {
  if (!specifier.startsWith('.')) return null;
  const base = path
    .resolve(path.dirname(fromFile), specifier)
    .replace(/\.(?:m|c)?js$/, '');
  for (const candidate of [
    `${base}.d.ts`,
    `${base}.d.mts`,
    path.join(base, 'index.d.ts'),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * The `local as exported` pairs of an export list.
 * @param {string} list
 * @returns {[string, string][]}
 */
function exportPairs(list) {
  return list
    .split(',')
    .map(part => part.replace(/^\s*type\s+/, '').trim())
    .filter(Boolean)
    .map(part => {
      const [local, exported] = part.split(/\s+as\s+/);
      return [local.trim(), (exported ?? local).trim()];
    });
}

/**
 * What a declaration file declares and exports. Declaration files hold only
 * declarations and exports, so their text is read with patterns, and a file
 * is parsed only when a declaration in it is printed.
 * @param {string} file
 * @returns {FileExports}
 */
function fileExports(file) {
  const cached = fileExportsCache.get(file);
  if (cached) return cached;
  const text = fs.readFileSync(file, 'utf8');
  /** @type {FileExports} */
  const exports = {declared: new Map(), named: new Map(), stars: []};
  for (const match of text.matchAll(DECLARATION_RE)) {
    if (!exports.declared.has(match[2])) {
      exports.declared.set(match[2], Boolean(match[1]));
    }
  }
  for (const match of text.matchAll(EXPORT_LIST_RE)) {
    for (const [local, exported] of exportPairs(match[1])) {
      exports.named.set(exported, {file, local});
    }
  }
  for (const match of text.matchAll(EXPORT_FROM_RE)) {
    const target = declarationFileOf(match[3], file);
    if (!target) continue;
    if (match[1] === '*') {
      exports.stars.push(target);
    } else {
      for (const [local, exported] of exportPairs(match[2])) {
        exports.named.set(exported, {file: target, local});
      }
    }
  }
  fileExportsCache.set(file, exports);
  return exports;
}

/**
 * Where the name `file` exports is declared, following export lists and
 * `export *`; null when the file does not export it.
 * @param {string} file
 * @param {string} name
 * @param {Set<string>} seen
 * @returns {{file: string, local: string} | null}
 */
function exportedDeclaration(file, name, seen) {
  const key = `${file}\0${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const exports = fileExports(file);
  if (exports.declared.get(name) === true) return {file, local: name};
  const named = exports.named.get(name);
  if (named) {
    if (fileExports(named.file).declared.has(named.local)) return named;
    return exportedDeclaration(named.file, named.local, seen);
  }
  for (const star of exports.stars) {
    const found = exportedDeclaration(star, name, seen);
    if (found) return found;
  }
  return null;
}

/**
 * The text of one declaration node, with its comments removed and its lines
 * moved left by the indent of its first line.
 * @param {string} text
 * @param {any} node
 * @param {any[]} comments
 * @returns {string}
 */
function declarationText(text, node, comments) {
  let result = '';
  let at = node.start;
  for (const comment of comments) {
    if (comment.start < node.start || comment.end > node.end) continue;
    result += text.slice(at, comment.start);
    at = comment.end;
  }
  result += text.slice(at, node.end);
  const lines = result
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.trim() !== '');
  const indent = Math.min(
    ...lines.slice(1).map(line => line.length - line.trimStart().length),
  );
  return lines
    .map((line, index) =>
      index === 0 || !Number.isFinite(indent) ? line : line.slice(indent),
    )
    .join('\n');
}

/**
 * The type declaration named `local` in `file`; null when the name is not a
 * type alias, an interface, or an enum there.
 * @param {string} file
 * @param {string} local
 * @returns {string | null}
 */
function typeDeclarationIn(file, local) {
  if (!parsedCache.has(file)) {
    const text = fs.readFileSync(file, 'utf8');
    try {
      const ast = babelParse(text, {
        sourceType: 'module',
        plugins: [['typescript', {dts: true}]],
      });
      parsedCache.set(file, {text, ast});
    } catch {
      parsedCache.set(file, null);
    }
  }
  const parsed = parsedCache.get(file);
  if (!parsed) return null;
  const {text, ast} = parsed;
  for (const statement of ast.program.body) {
    const node =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (node && TYPE_NODES.has(node.type) && node.id?.name === local) {
      return declarationText(text, node, ast.comments ?? []);
    }
  }
  return null;
}

/**
 * The declaration of each name the package's root declaration file exports as
 * a type, in the order of `names`, then of each exported type those
 * declarations name. A name the root does not export as a type (a component,
 * a function, a React or DOM type) is left out. The types that `names` name
 * always carry their declaration. A type found one level down carries its
 * declaration while the declarations of that level stay within `nestedChars`
 * characters; after that it carries only its name, so a long answer stays
 * short.
 * @param {string} rootDeclarationFile
 * @param {readonly string[]} names
 * @param {{nestedChars?: number}} [options]
 * @returns {{name: string, declaration?: string, via: string[]}[]} `via` is
 *   every name in `names` that the type was reached from, so a type that
 *   two names reach belongs to both
 */
export function exportedTypeDeclarations(
  rootDeclarationFile,
  names,
  {nestedChars = 1200} = {},
) {
  /** @type {Map<string, {declaration: string, inner: string[]} | null>} */
  const looked = new Map();
  /** @param {string} name */
  const lookUp = name => {
    if (!looked.has(name)) {
      let found = null;
      try {
        const source = exportedDeclaration(
          rootDeclarationFile,
          name,
          new Set(),
        );
        const declaration = source
          ? typeDeclarationIn(source.file, source.local)
          : null;
        if (declaration) {
          found = {
            declaration,
            inner: typeNamesIn(declaration).filter(inner => inner !== name),
          };
        }
      } catch {
        found = null;
      }
      looked.set(name, found);
    }
    return looked.get(name) ?? null;
  };

  /** @type {Map<string, {name: string, declaration?: string, via: string[]}>} */
  const byName = new Map();
  const roots = [...new Set(names)].filter(name => lookUp(name) !== null);
  for (const root of roots) {
    byName.set(root, {
      name: root,
      declaration: lookUp(root)?.declaration,
      via: [root],
    });
  }
  let nestedLeft = nestedChars;
  for (const root of roots) {
    for (const inner of lookUp(root)?.inner ?? []) {
      const found = lookUp(inner);
      if (!found) continue;
      let entry = byName.get(inner);
      if (!entry) {
        if (found.declaration.length <= nestedLeft) {
          nestedLeft -= found.declaration.length;
          entry = {name: inner, declaration: found.declaration, via: []};
        } else {
          nestedLeft = 0;
          entry = {name: inner, via: []};
        }
        byName.set(inner, entry);
      }
      if (!entry.via.includes(root)) entry.via.push(root);
    }
  }
  return [...byName.values()];
}

/**
 * The type names a type text refers to by a bare name: each identifier that
 * starts with a capital letter and is not a member of a qualified name such
 * as `React.ReactNode`.
 * @param {string} typeText
 * @returns {string[]}
 */
export function typeNamesIn(typeText) {
  const names = [];
  for (const match of typeText.matchAll(/(?<![\w$.])[A-Z][\w$]*(?![\w$.])/g)) {
    names.push(match[0]);
  }
  return names;
}

/**
 * The root declaration file of the package in `packageDir`: the `types` of
 * its `exports['.']`, else its `types` or `typings`; null when it has none.
 * @param {string} packageDir
 * @returns {string | null}
 */
export function packageRootDeclarationFile(packageDir) {
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
    );
  } catch {
    return null;
  }
  const rootExport = manifest?.exports?.['.'];
  const relative =
    (rootExport && typeof rootExport === 'object' ? rootExport.types : null) ??
    manifest?.types ??
    manifest?.typings;
  if (typeof relative !== 'string') return null;
  const file = path.resolve(packageDir, relative);
  return fs.existsSync(file) ? file : null;
}
