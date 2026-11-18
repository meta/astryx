// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The types a component's documented props, or a hook's parameters
 *   and return, name, read from the declaration files its own package
 *   publishes.
 * @input A package folder, the subpath a component or hook is imported from,
 *   the type texts its doc writes, and for a hook its exported name.
 * @output One entry per type name those texts (and a hook's declared
 *   signature) use that the package itself declares: its name, the public
 *   `import type` line, and its declaration one level deep (members, or the
 *   alias text), each capped in length; a string-literal union is never cut.
 *   A type a prop names only as a callback's parameter, and a brand whose
 *   members are all `never`, get no entry.
 * @position Read by the component adapter (api/component/_adapter.mjs) for
 *   `component.detail` and `component.detail.props`, and by the hook adapter
 *   (api/hook/_adapter.mjs) for `hook.detail` and `hook.detail.params`. The
 *   files are the ones the package's `exports` map names under `types`,
 *   followed through their relative imports and re-exports; a name that comes
 *   from another package, React, the DOM or TypeScript itself is never
 *   declared there, so it gets no entry. Each answer is kept in the user's
 *   cache folder (gather-cache.mjs persistedSummary) while every file it read
 *   is the same.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {babelParser} from '../runtime/lazy-dependencies.mjs';
import {persistedSummary} from '../fs/gather-cache.mjs';
import {fileStamp} from '../fs/read-record.mjs';
import {conditionalExportTarget} from './package-exports.mjs';
import {firstSentence} from '../text/string-utils.mjs';

/** The module's own file: its code decides every kept answer's shape. */
const OWN_FILE = fileURLToPath(import.meta.url);

/** The most members a type lists; the rest are counted in `more`. */
export const MAX_MEMBERS = 24;

/** The longest member type, or alias text, a type prints. */
export const MAX_TYPE_TEXT = 240;

/**
 * A union of string literals: printed whole however long, since a caller
 * picks one of its members by name.
 */
const STRING_UNION =
  /^\s*(?:'[^'\\]*'|"[^"\\]*")(?:\s*\|\s*(?:'[^'\\]*'|"[^"\\]*"))*\s*$/;

/** What marks a type text cut at {@link MAX_TYPE_TEXT}. */
export const CUT_MARK = ' ...';

const DECLARATION_EXTENSIONS = ['.d.ts', '.d.mts', '.d.cts'];

/** @type {import('@babel/parser').ParserOptions} */
const PARSE_OPTIONS = /** @type {any} */ ({
  sourceType: 'module',
  plugins: [['typescript', {dts: true}]],
});

/**
 * Words a type text uses that never name a declared type.
 */
const KEYWORDS = new Set([
  'any',
  'unknown',
  'never',
  'void',
  'null',
  'undefined',
  'string',
  'number',
  'boolean',
  'bigint',
  'symbol',
  'object',
  'true',
  'false',
  'keyof',
  'typeof',
  'infer',
  'extends',
  'readonly',
  'unique',
  'is',
  'asserts',
  'new',
  'in',
  'as',
]);

/**
 * @typedef {object} DeclaredTypeMember
 * @property {string} name
 * @property {string} type
 * @property {boolean} optional
 * @property {string} [description] - The JSDoc's first sentence.
 */

/**
 * @typedef {object} DeclaredType
 * @property {string} name
 * @property {string} [typeParameters] - As written, e.g. `<T>`.
 * @property {string} [import] - `import type {Name} from '<package>/<entry>';`
 * @property {string[]} [extends] - The types an interface extends, as written.
 * @property {DeclaredTypeMember[]} [members] - An interface's or object type's members.
 * @property {number} [more] - Members past {@link MAX_MEMBERS}, not listed.
 * @property {string} [text] - An alias's type, as written.
 */

/**
 * The type names a type text uses, in order, once each: identifiers not
 * inside a string, not after a dot, and not a keyword. With
 * `skipCallbackArgs`, names inside the parameter list of a function type are
 * left out: a prop's callback hands those values to the caller, who writes
 * none of them.
 * @param {string} text
 * @param {{skipCallbackArgs?: boolean}} [options]
 * @returns {string[]}
 */
export function typeNamesIn(text, {skipCallbackArgs = false} = {}) {
  let bare = String(text ?? '').replace(
    /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g,
    "''",
  );
  if (skipCallbackArgs) bare = withoutCallbackArgs(bare);
  /** @type {string[]} */
  const names = [];
  for (const m of bare.matchAll(/(?<![.\w$])[A-Za-z_$][\w$]*/g)) {
    const name = m[0];
    // A key in an object type (`{size: ...}`) names a member, not a type.
    if (/^\??\s*:/.test(bare.slice(m.index + name.length))) continue;
    if (KEYWORDS.has(name) || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

/**
 * A type text with the parameter list of each function type in it blanked:
 * a parenthesized group followed by `=>`.
 * @param {string} text
 * @returns {string}
 */
function withoutCallbackArgs(text) {
  const chars = [...text];
  /** @type {number[]} */
  const open = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '(') open.push(i);
    else if (chars[i] === ')' && open.length) {
      const start = /** @type {number} */ (open.pop());
      if (/^\s*=>/.test(text.slice(i + 1))) {
        for (let j = start + 1; j < i; j++) chars[j] = ' ';
      }
    }
  }
  return chars.join('');
}

/**
 * One package's declaration files, read for one answer: each file's text and
 * tree once, and the stamp of each file taken before it was read.
 */
class DeclarationReader {
  /**
   * @param {string} packageDir
   * @param {string} packageName
   * @param {Record<string, any>} pkg
   * @param {[string, string][]} stamps
   */
  constructor(packageDir, packageName, pkg, stamps) {
    this.packageDir = packageDir;
    this.packageName = packageName;
    this.pkg = pkg;
    this.stamps = stamps;
    /** @type {Map<string, {text: string, ast: any} | null>} */
    this.files = new Map();
  }

  /**
   * The declaration file a subpath's `types` condition names, or null.
   * @param {string} subpath
   * @returns {string | null}
   */
  entryFile(subpath) {
    const {pkg} = this;
    let target =
      pkg.exports === undefined
        ? subpath === '.'
          ? (pkg.types ?? pkg.typings ?? null)
          : null
        : conditionalExportTarget(pkg.exports, subpath, ['types']);
    if (typeof target !== 'string' || !isDeclarationFile(target)) return null;
    target = path.resolve(this.packageDir, target);
    return this.inPackage(target) ? target : null;
  }

  /**
   * Whether a file sits in this package and not in a package it installs.
   * @param {string} file
   */
  inPackage(file) {
    const rel = path.relative(this.packageDir, file);
    return (
      rel !== '' &&
      !rel.startsWith('..') &&
      !path.isAbsolute(rel) &&
      !rel.split(path.sep).includes('node_modules')
    );
  }

  /**
   * A file's text and tree, or null when it is missing or does not parse.
   * @param {string} file
   */
  read(file) {
    if (this.files.has(file)) return this.files.get(file) ?? null;
    /** @type {{text: string, ast: any} | null} */
    let entry = null;
    const stamp = fileStamp(file);
    this.stamps.push([file, stamp]);
    if (stamp !== '-') {
      try {
        const text = fs.readFileSync(file, 'utf8');
        entry = {text, ast: babelParser().parse(text, PARSE_OPTIONS)};
      } catch {
        entry = null;
      }
    }
    this.files.set(file, entry);
    return entry;
  }

  /**
   * The declaration file a specifier names from `fromFile`: a relative path,
   * or the package's own name with a subpath its `exports` map names.
   * @param {unknown} specifier
   * @param {string} fromFile
   * @returns {string | null}
   */
  resolve(specifier, fromFile) {
    if (typeof specifier !== 'string') return null;
    const {packageName} = this;
    if (specifier === packageName || specifier.startsWith(`${packageName}/`)) {
      return this.entryFile(`.${specifier.slice(packageName.length)}`);
    }
    if (!specifier.startsWith('.')) return null;
    const base = path.resolve(path.dirname(fromFile), specifier);
    const stem = base.replace(/\.(?:[mc]?js|[mc]?ts|tsx|jsx)$/, '');
    const candidates = [
      ...(isDeclarationFile(base) ? [base] : []),
      ...DECLARATION_EXTENSIONS.map(ext => `${stem}${ext}`),
      ...DECLARATION_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
    ];
    for (const candidate of candidates) {
      if (!this.inPackage(candidate)) continue;
      if (this.read(candidate)) return candidate;
    }
    return null;
  }

  /**
   * The files reachable from `file` through re-exports, `file` first.
   * @param {string} file
   * @returns {string[]}
   */
  reexportGraph(file) {
    /** @type {string[]} */
    const out = [];
    /** @param {string} at */
    const visit = at => {
      if (out.includes(at)) return;
      const entry = this.read(at);
      if (!entry) return;
      out.push(at);
      for (const node of entry.ast.program.body) {
        if (
          (node.type === 'ExportAllDeclaration' ||
            node.type === 'ExportNamedDeclaration') &&
          node.source
        ) {
          const target = this.resolve(node.source.value, at);
          if (target) visit(target);
        }
      }
    };
    visit(file);
    return out;
  }

  /**
   * The declaration a file's top-level binding `name` leads to: one the file
   * writes, or one an import from this package names, followed.
   * @param {string} file
   * @param {string} name
   * @param {Set<string>} [seen]
   * @param {(node: any, name: string) => any} [match] - the declaration
   *   node a statement holds for `name`, or null; by default a type's
   * @returns {{file: string, node: any} | null}
   */
  binding(file, name, seen = new Set(), match = typeDeclarationNamed) {
    const key = `b\0${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const entry = this.read(file);
    if (!entry) return null;
    for (const statement of entry.ast.program.body) {
      const node =
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration'
          ? statement.declaration
          : statement;
      const found = match(node, name);
      if (found) return {file, node: found};
    }
    for (const statement of entry.ast.program.body) {
      if (statement.type !== 'ImportDeclaration') continue;
      for (const specifier of statement.specifiers ?? []) {
        if (specifier.local?.name !== name) continue;
        if (specifier.type !== 'ImportSpecifier') return null;
        const target = this.resolve(statement.source.value, file);
        if (!target) return null;
        const imported =
          specifier.imported?.name ?? specifier.imported?.value ?? name;
        return this.exported(target, imported, seen, match);
      }
    }
    return null;
  }

  /**
   * The declaration a file's export `name` leads to, through its re-exports.
   * @param {string} file
   * @param {string} name
   * @param {Set<string>} [seen]
   * @param {(node: any, name: string) => any} [match] - as for `binding`
   * @returns {{file: string, node: any} | null}
   */
  exported(file, name, seen = new Set(), match = typeDeclarationNamed) {
    const key = `e\0${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const entry = this.read(file);
    if (!entry) return null;
    const body = entry.ast.program.body;
    for (const statement of body) {
      if (statement.type !== 'ExportNamedDeclaration') continue;
      const found = match(statement.declaration, name);
      if (found) return {file, node: found};
      for (const specifier of statement.specifiers ?? []) {
        const exported = specifier.exported?.name ?? specifier.exported?.value;
        if (exported !== name) continue;
        const local = specifier.local?.name ?? specifier.local?.value ?? name;
        if (!statement.source) return this.binding(file, local, seen, match);
        const target = this.resolve(statement.source.value, file);
        return target ? this.exported(target, local, seen, match) : null;
      }
    }
    for (const statement of body) {
      if (statement.type !== 'ExportAllDeclaration' || statement.exported) {
        continue;
      }
      const target = this.resolve(statement.source?.value, file);
      const found = target ? this.exported(target, name, seen, match) : null;
      if (found) return found;
    }
    return null;
  }

  /**
   * The files a binding's own import of `name` names, in the files given:
   * where the type comes from, for the public entry that exports it.
   * @param {string[]} files
   * @param {string} name
   * @returns {string[]}
   */
  importTargets(files, name) {
    /** @type {string[]} */
    const out = [];
    for (const file of files) {
      const entry = this.read(file);
      if (!entry) continue;
      for (const statement of entry.ast.program.body) {
        const named =
          statement.type === 'ImportDeclaration' ||
          (statement.type === 'ExportNamedDeclaration' && statement.source);
        if (!named) continue;
        const writes = (statement.specifiers ?? []).some(
          (/** @type {any} */ s) =>
            (s.local?.name ?? s.local?.value) === name ||
            (s.exported?.name ?? s.exported?.value) === name,
        );
        if (!writes) continue;
        const target = this.resolve(statement.source.value, file);
        if (target && !out.includes(target)) out.push(target);
      }
    }
    return out;
  }
}

/**
 * Whether a declaration is an alias of `any` or `unknown`: a package's own
 * stand-in for a type it does not describe, which tells a reader nothing.
 * @param {any} node
 */
function isOpaqueAlias(node) {
  return (
    node.type === 'TSTypeAliasDeclaration' &&
    (node.typeAnnotation.type === 'TSAnyKeyword' ||
      node.typeAnnotation.type === 'TSUnknownKeyword')
  );
}

/** @param {string} file */
function isDeclarationFile(file) {
  return DECLARATION_EXTENSIONS.some(ext => file.endsWith(ext));
}

/**
 * A type declaration named `name`, or null.
 * @param {any} node
 * @param {string} name
 */
function typeDeclarationNamed(node, name) {
  return isTypeDeclaration(node) && node.id?.name === name ? node : null;
}

/**
 * A declared function named `name` (`declare function`, or a `declare const`
 * with a function type), or null.
 * @param {any} node
 * @param {string} name
 */
function functionDeclarationNamed(node, name) {
  if (node?.type === 'TSDeclareFunction' && node.id?.name === name) return node;
  if (node?.type === 'VariableDeclaration') {
    return (
      node.declarations.find(
        (/** @type {any} */ d) =>
          d.id?.name === name && d.id.typeAnnotation != null,
      )?.id.typeAnnotation ?? null
    );
  }
  return null;
}

/**
 * Whether a declaration is a brand: an object type whose every member is
 * typed `never`, which a caller never writes or reads.
 * @param {Omit<DeclaredType, 'name' | 'import'>} described
 */
function isBrand(described) {
  return (
    Array.isArray(described.members) &&
    described.members.length > 0 &&
    !described.more &&
    described.members.every(m => m.type === 'never')
  );
}

/** @param {any} node */
function isTypeDeclaration(node) {
  return (
    node?.type === 'TSInterfaceDeclaration' ||
    node?.type === 'TSTypeAliasDeclaration' ||
    node?.type === 'TSEnumDeclaration'
  );
}

/**
 * A declaration file's text and its comments, as one slice reads them.
 * @typedef {{text: string, comments: any[]}} Source
 */

/**
 * A node's source text on one line, its comments left out.
 * @param {Source} src
 * @param {any} node
 */
function sliceOf(src, node) {
  let source = '';
  let at = node.start;
  for (const comment of src.comments) {
    if (comment.start < at || comment.end > node.end) continue;
    source += `${src.text.slice(at, comment.start)} `;
    at = comment.end;
  }
  source += src.text.slice(at, node.end);
  return source
    .replace(/\s+/g, ' ')
    .replace(/([{(<[]) /g, '$1')
    .replace(/ ([})>\]])/g, '$1')
    .replace(/;([}\]])/g, '$1')
    .trim();
}

/** Typographic punctuation a declaration's text writes, in plain ASCII. */
const ASCII_PUNCTUATION = new Map([
  ['\u2014', '-'],
  ['\u2013', '-'],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201c', '"'],
  ['\u201d', '"'],
  ['\u2026', '...'],
  ['\u00a0', ' '],
  ['\u2192', '->'],
]);

/**
 * A text with typographic punctuation spelled in plain ASCII, as the CLI's
 * text output is.
 * @param {string} text
 */
function plain(text) {
  return text.replace(
    /[\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u00a0\u2192]/g,
    c => ASCII_PUNCTUATION.get(c) ?? c,
  );
}

/**
 * A type text cut to {@link MAX_TYPE_TEXT}, the cut marked.
 * @param {string} raw
 */
function capped(raw) {
  const text = plain(raw);
  if (STRING_UNION.test(text)) return text;
  return text.length <= MAX_TYPE_TEXT
    ? text
    : `${text.slice(0, MAX_TYPE_TEXT - CUT_MARK.length).trimEnd()}${CUT_MARK}`;
}

/**
 * The first sentence of the JSDoc block right above a node, tags left out.
 * @param {any} node
 * @returns {string}
 */
function jsdocSentence(node) {
  const block = [...(node.leadingComments ?? [])]
    .reverse()
    .find(c => c.type === 'CommentBlock' && c.value.startsWith('*'));
  if (!block) return '';
  const lines = block.value
    .split('\n')
    .map((/** @type {string} */ line) => line.replace(/^\s*\*?\s?/, ''));
  const prose = [];
  for (const line of lines) {
    if (/^@/.test(line.trim())) break;
    prose.push(line);
  }
  return firstSentence(
    plain(prose.join(' ')).replace(/\{@link\s+([^}|]+)[^}]*\}/g, '$1'),
  );
}

/**
 * A member's name as written in its type.
 * @param {Source} text
 * @param {any} member
 */
function memberName(text, member) {
  const key = member.key;
  if (!key) return '';
  if (member.computed) return `[${sliceOf(text, key)}]`;
  return key.type === 'Identifier' ? key.name : String(key.value ?? '');
}

/**
 * One member of an interface or object type, or null for one this read does
 * not list.
 * @param {Source} text
 * @param {any} member
 * @returns {DeclaredTypeMember | null}
 */
function describeMember(text, member) {
  /** @type {string} */
  let name;
  /** @type {string} */
  let type;
  switch (member.type) {
    case 'TSPropertySignature':
      name = memberName(text, member);
      type = member.typeAnnotation
        ? sliceOf(text, member.typeAnnotation.typeAnnotation)
        : 'any';
      break;
    case 'TSMethodSignature': {
      name = memberName(text, member);
      const params = member.parameters ?? member.params ?? [];
      const generics = member.typeParameters
        ? sliceOf(text, member.typeParameters)
        : '';
      const returns = member.typeAnnotation ?? member.returnType;
      type = `${generics}(${params.map((/** @type {any} */ p) => sliceOf(text, p)).join(', ')}) => ${returns ? sliceOf(text, returns.typeAnnotation) : 'void'}`;
      break;
    }
    case 'TSIndexSignature':
      name = `[${(member.parameters ?? []).map((/** @type {any} */ p) => sliceOf(text, p)).join(', ')}]`;
      type = member.typeAnnotation
        ? sliceOf(text, member.typeAnnotation.typeAnnotation)
        : 'any';
      break;
    case 'TSCallSignatureDeclaration': {
      const params = member.parameters ?? member.params ?? [];
      const returns = member.typeAnnotation ?? member.returnType;
      name = '(call)';
      type = `(${params.map((/** @type {any} */ p) => sliceOf(text, p)).join(', ')}) => ${returns ? sliceOf(text, returns.typeAnnotation) : 'void'}`;
      break;
    }
    default:
      return null;
  }
  if (!name) return null;
  const description = jsdocSentence(member);
  return {
    name,
    type: capped(type),
    optional: member.optional === true,
    ...(description ? {description} : {}),
  };
}

/**
 * A declaration, one level deep: an interface or object type as its members,
 * any other alias or an enum as its text.
 * @param {Source} text
 * @param {any} node
 * @returns {Omit<DeclaredType, 'name' | 'import'>}
 */
function describeDeclaration(text, node) {
  /** @type {Omit<DeclaredType, 'name' | 'import'>} */
  const out = {};
  if (node.typeParameters) {
    out.typeParameters = sliceOf(text, node.typeParameters);
  }
  /** @type {any[] | null} */
  let members = null;
  if (node.type === 'TSInterfaceDeclaration') {
    if (node.extends?.length) {
      out.extends = node.extends.map((/** @type {any} */ e) =>
        sliceOf(text, e),
      );
    }
    members = node.body.body;
  } else if (
    node.type === 'TSTypeAliasDeclaration' &&
    node.typeAnnotation.type === 'TSTypeLiteral'
  ) {
    members = node.typeAnnotation.members;
  } else if (node.type === 'TSTypeAliasDeclaration') {
    out.text = capped(sliceOf(text, node.typeAnnotation).replace(/^[|&] /, ''));
  } else {
    out.text = capped(
      node.members
        .map((/** @type {any} */ m) =>
          m.initializer
            ? sliceOf(text, m.initializer)
            : `${node.id.name}.${memberName(text, {key: m.id})}`,
        )
        .join(' | '),
    );
  }
  if (members) {
    const described = members
      .map((/** @type {any} */ m) => describeMember(text, m))
      .filter(Boolean);
    out.members = /** @type {DeclaredTypeMember[]} */ (
      described.slice(0, MAX_MEMBERS)
    );
    if (described.length > MAX_MEMBERS) {
      out.more = described.length - MAX_MEMBERS;
    }
  }
  return out;
}

/**
 * The types a component's prop type texts name that its own package declares,
 * worked out now.
 * @param {DeclarationReader} reader
 * @param {string} subpath - the entry the component is imported from
 * @param {string[]} names
 * @param {string} [declaredFunction] - a function the entry exports whose
 *   declared parameter and return types add names
 * @returns {DeclaredType[]}
 */
function readDeclaredTypes(reader, subpath, names, declaredFunction) {
  const entry = reader.entryFile(subpath);
  if (!entry) return [];
  const files = reader.reexportGraph(entry);
  if (declaredFunction) {
    for (const name of signatureNames(reader, entry, declaredFunction)) {
      if (!names.includes(name)) names.push(name);
    }
  }
  /** @type {DeclaredType[]} */
  const out = [];
  for (const name of names) {
    let found = null;
    for (const file of files) {
      found = reader.binding(file, name) ?? reader.exported(file, name);
      if (found) break;
    }
    if (!found || isOpaqueAlias(found.node)) continue;
    const declared = found;
    const read = reader.read(declared.file);
    const src = {text: read?.text ?? '', comments: read?.ast.comments ?? []};
    const same = (/** @type {{file: string, node: any} | null} */ other) =>
      other?.file === declared.file && other.node === declared.node;
    /** @type {string | null} */
    let from = same(reader.exported(entry, name)) ? subpath : null;
    if (!from) {
      // The entry the component's own files import the type through.
      const targets = reader.importTargets(files, name);
      for (const sub of entrySubpaths(reader.pkg)) {
        const file = reader.entryFile(sub);
        if (
          file &&
          targets.includes(file) &&
          same(reader.exported(file, name))
        ) {
          from = sub;
          break;
        }
      }
    }
    if (!from) {
      const root = reader.entryFile('.');
      if (root && same(reader.exported(root, name))) from = '.';
    }
    const described = describeDeclaration(src, declared.node);
    if (isBrand(described)) continue;
    out.push({
      name,
      ...(from
        ? {
            import: `import type { ${name} } from '${reader.packageName}${from === '.' ? '' : from.slice(1)}';`,
          }
        : {}),
      ...described,
    });
  }
  return out;
}

/**
 * The type names a declared function's parameters and return type use, as
 * the entry exports it.
 * @param {DeclarationReader} reader
 * @param {string} entry
 * @param {string} name
 * @returns {string[]}
 */
function signatureNames(reader, entry, name) {
  const found = reader.exported(
    entry,
    name,
    new Set(),
    functionDeclarationNamed,
  );
  if (!found) return [];
  const text = reader.read(found.file)?.text ?? '';
  const node = found.node;
  /** @type {any[]} */
  const parts = [];
  if (node.type === 'TSDeclareFunction') {
    for (const param of node.params ?? []) {
      if (param.typeAnnotation) parts.push(param.typeAnnotation);
      if (param.left?.typeAnnotation) parts.push(param.left.typeAnnotation);
    }
    if (node.returnType) parts.push(node.returnType);
  } else {
    parts.push(node);
  }
  return parts.flatMap(part =>
    typeNamesIn(text.slice(part.start, part.end).replace(/^:\s*/, '')),
  );
}

/**
 * The subpaths a package's `exports` map names without a wildcard.
 * @param {Record<string, any>} pkg
 * @returns {string[]}
 */
function entrySubpaths(pkg) {
  const field = pkg.exports;
  if (field == null || typeof field !== 'object' || Array.isArray(field)) {
    return ['.'];
  }
  const keys = Object.keys(field);
  if (!keys.every(k => k.startsWith('.'))) return ['.'];
  return keys.filter(k => !k.includes('*') && !k.endsWith('.json'));
}

/**
 * The types a component's documented props, or a hook's parameters and
 * return, name that its own package declares, from the package's published
 * declaration files. Empty when the package ships none for the entry, or the
 * texts name no type it declares.
 * @param {{packageDir: string, packageName: string, importSpecifier: string, typeTexts?: string[], wholeTexts?: string[], declaredFunction?: string}} input
 *   `importSpecifier`: what the component or hook is imported from, e.g.
 *   `@astryxdesign/core/Table`; `typeTexts`: prop types, whose callback
 *   parameters are left out; `wholeTexts`: types read whole (a hook's
 *   parameters and return); `declaredFunction`: a function the entry
 *   exports, whose declared parameter and return types are read whole too.
 * @returns {DeclaredType[]}
 */
export function declaredTypes({
  packageDir,
  packageName,
  importSpecifier,
  typeTexts = [],
  wholeTexts = [],
  declaredFunction,
}) {
  if (
    !packageDir ||
    !packageName ||
    typeof importSpecifier !== 'string' ||
    (importSpecifier !== packageName &&
      !importSpecifier.startsWith(`${packageName}/`))
  ) {
    return [];
  }
  const subpath = `.${importSpecifier.slice(packageName.length)}`;
  /** @type {string[]} */
  const names = [];
  for (const [texts, skipCallbackArgs] of /** @type {const} */ ([
    [typeTexts, true],
    [wholeTexts, false],
  ])) {
    for (const text of texts) {
      for (const name of typeNamesIn(text, {skipCallbackArgs})) {
        if (!names.includes(name)) names.push(name);
      }
    }
  }
  if (names.length === 0 && !declaredFunction) return [];
  let dir = packageDir;
  try {
    dir = fs.realpathSync(packageDir);
  } catch {
    return [];
  }
  return persistedSummary(
    [
      'declared-types',
      dir,
      packageName,
      subpath,
      names,
      declaredFunction ?? null,
      fileStamp(OWN_FILE),
    ],
    () => {
      /** @type {[string, string][]} */
      const stamps = [];
      const manifest = path.join(dir, 'package.json');
      stamps.push([manifest, fileStamp(manifest)]);
      /** @type {Record<string, any>} */
      let pkg;
      try {
        pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      } catch {
        return {value: {types: []}, stamps};
      }
      const reader = new DeclarationReader(dir, packageName, pkg, stamps);
      return {
        value: {
          types: readDeclaredTypes(
            reader,
            subpath,
            [...names],
            declaredFunction,
          ),
        },
        stamps,
      };
    },
    {accept: isKeptAnswer},
  ).types;
}

/**
 * Whether a kept answer has the shape this module stores: anything else is
 * worked out again and stored over.
 * @param {unknown} value
 * @returns {value is {types: DeclaredType[]}}
 */
function isKeptAnswer(value) {
  const types = /** @type {any} */ (value)?.types;
  return (
    Array.isArray(types) &&
    types.every(
      t =>
        t != null &&
        typeof t === 'object' &&
        typeof t.name === 'string' &&
        (t.members === undefined || Array.isArray(t.members)) &&
        (t.text === undefined || typeof t.text === 'string'),
    )
  );
}
