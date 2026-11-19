// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The public type surface of `@astryxdesign/cli/authoring`, and whether
 *   a reader of `astryx docs authoring` can reach the doc for each type in it.
 *
 * @input authoring/index.d.ts and the type modules it re-exports, parsed with
 *   jscodeshift and never imported or type-checked (consumer installs have no
 *   TypeScript); the self-docs on disk and in AUTHORING_SELF_DOCS; and the
 *   section keys `astryx docs authoring/field-reference --index` lists.
 * @output {@link tracePublicAuthoringTypes}: each exported type and the module
 *   that declares it. {@link auditAuthoringSurface}: each module whose exported
 *   types a reader cannot reach and why, each export that cannot be traced,
 *   and each registered self-doc that documents nothing the surface exports.
 * @position Read by Doctor's authoring-docs check. A type's doc is the self-doc
 *   beside the module that declares it, so a new public type needs a
 *   `*.doc.mjs` in its folder, listed in AUTHORING_SELF_DOCS. The barrel's
 *   parsers read those types and are not a shape anyone writes, so they need
 *   no section of their own.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import jscodeshift from 'jscodeshift';
import {
  AUTHORING_ROOT,
  AUTHORING_SELF_DOCS,
  isExperimentalSelfDoc,
  selfDocSection,
  discoverAuthoringSelfDocSources,
  loadAuthoringSelfDocs,
} from './authoring-self-docs.mjs';
import {sectionKey} from './docs-section-key.mjs';

const j = jscodeshift.withParser('ts');

/** The barrel the `types` condition of `@astryxdesign/cli/authoring` names. */
export const AUTHORING_SURFACE = 'index.d.ts';

/** Modules read by parsing. Anything else is runtime JavaScript. */
const TYPE_MODULE_RE = /\.(?:ts|tsx|mts|cts)$/u;

/** A title only a declaration of that name can match. */
const IDENTIFIER_RE = /^[A-Za-z_$][\w$]*$/u;

/**
 * @typedef {object} Tracer
 * @property {string} root
 * @property {Map<string, any[]>} parsed top-level statements by absolute path
 */

/**
 * @typedef {'no-self-doc' | 'unregistered' | 'failed' | 'missing-section'} UnreadableReason
 */

/**
 * @param {string} root
 * @param {string} file
 * @returns {string} `file` relative to `root`, with `/` separators
 */
function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

/**
 * @param {string} source a `/`-separated path relative to the root
 * @returns {string}
 */
function folderOf(source) {
  return path.posix.dirname(source);
}

/** @param {any} node @returns {string | undefined} */
function nameOf(node) {
  return node?.name ?? node?.value;
}

/**
 * Names a top-level statement declares, exported or not.
 * @param {any} node
 * @returns {string[]}
 */
function declaredNames(node) {
  if (node?.type === 'VariableDeclaration') {
    return node.declarations.flatMap((/** @type {any} */ d) =>
      d.id?.type === 'Identifier' ? [d.id.name] : [],
    );
  }
  return node?.id?.type === 'Identifier' ? [node.id.name] : [];
}

/**
 * @param {Tracer} t
 * @param {string} file
 * @returns {any[]}
 */
function statementsOf(t, file) {
  let body = t.parsed.get(file);
  if (!body) {
    try {
      body = j(fs.readFileSync(file, 'utf8')).get().node.program.body;
    } catch (error) {
      throw new Error(
        `${relative(t.root, file)} could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
        {cause: error},
      );
    }
    t.parsed.set(/** @type {string} */ (file), /** @type {any[]} */ (body));
  }
  return /** @type {any[]} */ (body);
}

/**
 * The file a relative specifier names, resolved as TypeScript resolves an ESM
 * import in a type module: `./x.js` is `./x.ts` when that exists.
 * @param {Tracer} t
 * @param {string} from absolute path of the importing module
 * @param {string} specifier
 * @returns {string} absolute path
 * @throws {Error} for a bare specifier, one that leaves the root, or one that
 *   names no file
 */
function resolveModule(t, from, specifier) {
  const base = path.resolve(path.dirname(from), specifier);
  const inside = relative(t.root, base);
  const candidates = !specifier.startsWith('.')
    ? []
    : inside === '..' || inside.startsWith('../') || path.isAbsolute(inside)
      ? []
      : /\.js$/u.test(base)
        ? [base.replace(/\.js$/u, '.ts'), base.replace(/\.js$/u, '.d.ts'), base]
        : /\.[cm]js$/u.test(base) || TYPE_MODULE_RE.test(base)
          ? [base]
          : [
              `${base}.ts`,
              `${base}.d.ts`,
              path.join(base, 'index.ts'),
              path.join(base, 'index.d.ts'),
            ];
  const found = candidates.find(file => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  });
  if (found == null) {
    throw new Error(
      `${relative(t.root, from)} names "${specifier}", which is not a file in ${path.basename(t.root)}/`,
    );
  }
  return found;
}

/**
 * The module that declares what `file` exports as `name`, following
 * re-exports. A JavaScript module declares what it exports (its JSDoc
 * typedefs included), so a trace stops there.
 * @param {Tracer} t
 * @param {string} file
 * @param {string} name
 * @param {Set<string>} [seen] `file\0name` pairs already on this trace
 * @returns {string | null} absolute path, or null when `file` does not export
 *   `name`
 */
function declaringModule(t, file, name, seen = new Set()) {
  if (!TYPE_MODULE_RE.test(file)) return file;
  const visit = `${file}\u0000${name}`;
  if (seen.has(visit)) return null;
  seen.add(visit);
  const body = statementsOf(t, file);
  for (const statement of body) {
    if (
      statement.type === 'ExportNamedDeclaration' &&
      declaredNames(statement.declaration).includes(name)
    ) {
      return file;
    }
  }
  for (const statement of body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration)
      continue;
    for (const specifier of statement.specifiers ?? []) {
      if (nameOf(specifier.exported) !== name) continue;
      const source = statement.source?.value;
      if (specifier.type === 'ExportNamespaceSpecifier') {
        return resolveModule(t, file, source);
      }
      const local = nameOf(specifier.local) ?? name;
      const found =
        source == null
          ? localBinding(t, file, body, local, seen)
          : declaringModule(t, resolveModule(t, file, source), local, seen);
      if (found == null) {
        throw new Error(
          `${relative(t.root, file)} exports ${name}${source == null ? '' : ` from "${source}"`}, which does not declare it`,
        );
      }
      return found;
    }
  }
  for (const statement of body) {
    if (statement.type !== 'ExportAllDeclaration') continue;
    const from = resolveModule(t, file, statement.source.value);
    if (statement.exported != null) {
      if (nameOf(statement.exported) === name) return from;
      continue;
    }
    // What a JavaScript module exports cannot be listed by parsing, so a star
    // through one never answers for a type.
    if (!TYPE_MODULE_RE.test(from)) continue;
    const found = declaringModule(t, from, name, seen);
    if (found != null) return found;
  }
  return null;
}

/**
 * The module that declares a binding local to `file`: `file` itself, or the
 * one its import of that name traces to.
 * @param {Tracer} t
 * @param {string} file
 * @param {any[]} body
 * @param {string} local
 * @param {Set<string>} seen
 * @returns {string | null}
 */
function localBinding(t, file, body, local, seen) {
  for (const statement of body) {
    const declared =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (declaredNames(declared).includes(local)) return file;
    if (statement.type !== 'ImportDeclaration') continue;
    for (const specifier of statement.specifiers ?? []) {
      if (nameOf(specifier.local) !== local) continue;
      const from = resolveModule(t, file, statement.source.value);
      if (specifier.type === 'ImportNamespaceSpecifier') return from;
      const imported =
        specifier.type === 'ImportDefaultSpecifier'
          ? 'default'
          : (nameOf(specifier.imported) ?? local);
      return declaringModule(t, from, imported, seen);
    }
  }
  return null;
}

/**
 * Every name a type module exports, stars included.
 * @param {Tracer} t
 * @param {string} file
 * @param {Set<string>} [seen]
 * @returns {string[]}
 * @throws {Error} when a star passes through a JavaScript module, whose types
 *   cannot be listed by parsing
 */
function exportedNames(t, file, seen = new Set()) {
  /** @type {Set<string>} */
  const names = new Set();
  if (seen.has(file)) return [];
  seen.add(file);
  for (const statement of statementsOf(t, file)) {
    if (statement.type === 'ExportNamedDeclaration') {
      for (const name of declaredNames(statement.declaration)) names.add(name);
      for (const specifier of statement.specifiers ?? []) {
        const name = nameOf(specifier.exported);
        if (name != null) names.add(name);
      }
    } else if (statement.type === 'ExportAllDeclaration') {
      const from = resolveModule(t, file, statement.source.value);
      if (statement.exported != null) {
        const name = nameOf(statement.exported);
        if (name != null) names.add(name);
      } else if (TYPE_MODULE_RE.test(from)) {
        for (const name of exportedNames(t, from, seen)) {
          if (name !== 'default') names.add(name);
        }
      } else {
        throw new Error(
          `${relative(t.root, file)} re-exports every type of "${statement.source.value}", a JavaScript module whose types cannot be listed`,
        );
      }
    }
  }
  return [...names];
}

/**
 * Every type `@astryxdesign/cli/authoring` exports, in the order index.d.ts
 * lists them, each traced to the module that declares it. A value export that
 * traces to a JavaScript module (a parser) is not a type and is left out;
 * anything else that cannot be traced is reported, never dropped.
 * @param {string} [root]
 * @returns {{
 *   types: {name: string, module: string}[],
 *   untraced: {name: string, reason: string}[],
 * }} `module` is relative to `root`
 */
export function tracePublicAuthoringTypes(root = AUTHORING_ROOT) {
  return traceSurface({root, parsed: new Map()});
}

/**
 * @param {Tracer} t
 * @returns {ReturnType<typeof tracePublicAuthoringTypes>}
 */
function traceSurface(t) {
  const surface = path.join(t.root, AUTHORING_SURFACE);
  /** @type {{name: string, module: string}[]} */
  const types = [];
  /** @type {{name: string, reason: string}[]} */
  const untraced = [];
  /**
   * @param {string} name
   * @param {() => string | null} trace
   * @param {boolean} typeOnly exported with `export type`
   */
  const add = (name, trace, typeOnly) => {
    let module;
    try {
      module = trace();
    } catch (error) {
      untraced.push({
        name,
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (module == null) {
      untraced.push({
        name,
        reason: `${AUTHORING_SURFACE} exports it, but no module declares it`,
      });
    } else if (typeOnly || TYPE_MODULE_RE.test(module)) {
      types.push({name, module: relative(t.root, module)});
    }
  };

  for (const statement of statementsOf(t, surface)) {
    const typeOnly = statement.exportKind === 'type';
    if (statement.type === 'ExportNamedDeclaration') {
      for (const name of declaredNames(statement.declaration)) {
        add(name, () => surface, true);
      }
      for (const specifier of statement.specifiers ?? []) {
        const name = nameOf(specifier.exported) ?? '(unnamed)';
        add(
          name,
          () => declaringModule(t, surface, name),
          typeOnly || specifier.exportKind === 'type',
        );
      }
    } else if (statement.type === 'ExportAllDeclaration') {
      const source = statement.source.value;
      if (statement.exported != null) {
        const name = nameOf(statement.exported) ?? '(unnamed)';
        add(name, () => resolveModule(t, surface, source), typeOnly);
        continue;
      }
      let names;
      try {
        const from = resolveModule(t, surface, source);
        if (!TYPE_MODULE_RE.test(from)) {
          throw new Error(
            `${AUTHORING_SURFACE} re-exports everything "${source}" exports, and what a JavaScript module exports cannot be listed`,
          );
        }
        names = exportedNames(t, from);
      } catch (error) {
        untraced.push({
          name: `* from "${source}"`,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      for (const name of names) {
        if (name === 'default') continue;
        add(name, () => declaringModule(t, surface, name), typeOnly);
      }
    }
  }
  return {types, untraced};
}

/**
 * Whether an authored type module in `folder` (relative to the root) declares
 * `name`. Declaration files are skipped: beside a self-doc they are generated
 * from the JavaScript next to them, declare no authored type, and use syntax
 * the parser reads only in declaration mode.
 * @param {Tracer} t
 * @param {string} folder
 * @param {string} name
 * @returns {boolean}
 */
function declaredIn(t, folder, name) {
  const dir = path.join(t.root, folder);
  let entries;
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return false;
  }
  return entries.some(
    entry =>
      entry.isFile() &&
      TYPE_MODULE_RE.test(entry.name) &&
      !/\.d\.[cm]?ts$|\.test\.[cm]?tsx?$/u.test(entry.name) &&
      statementsOf(t, path.join(dir, entry.name)).some(statement =>
        declaredNames(
          statement.type === 'ExportNamedDeclaration'
            ? statement.declaration
            : statement,
        ).includes(name),
      ),
  );
}

/**
 * What stands between each type `@astryxdesign/cli/authoring` exports and a
 * reader of `astryx docs authoring`. A type is readable when a self-doc beside
 * the module that declares it is listed in AUTHORING_SELF_DOCS, loads, and
 * renders a section the topic's index lists. A registered self-doc must
 * document something public: a public type declared beside it, and, when its
 * title is the name of a type declared beside it, that type.
 * @param {{root?: string, sources?: string[], topicKeys?: Set<string> | null}} [options]
 *   `topicKeys` are the keys `astryx docs authoring/field-reference --index` lists; null skips
 *   that comparison.
 * @returns {Promise<{
 *   types: number,
 *   unreadable: {module: string, names: string[], reason: UnreadableReason, source?: string, key?: string}[],
 *   untraced: {name: string, reason: string}[],
 *   unmatched: {source: string, key?: string, subject?: string}[],
 * }>}
 */
export async function auditAuthoringSurface({
  root = AUTHORING_ROOT,
  sources = AUTHORING_SELF_DOCS,
  topicKeys = null,
} = {}) {
  /** @type {Tracer} */
  const t = {root, parsed: new Map()};
  const {types, untraced} = traceSurface(t);

  /** @type {Map<string, string[]>} folder -> self-docs on disk in it */
  const beside = new Map();
  for (const source of discoverAuthoringSelfDocSources(root)) {
    const folder = folderOf(source);
    beside.set(folder, [...(beside.get(folder) ?? []), source]);
  }
  const registered = new Set(sources);
  const {loaded, failed} = await loadAuthoringSelfDocs(sources, root);
  const failedSources = new Set(failed.map(entry => entry.source));
  /** @type {Map<string, string>} */
  const keyOf = new Map(
    loaded.map(entry => [entry.source, sectionKey(selfDocSection(entry.doc))]),
  );
  // An experimental self-doc is a section of the experimental route, never
  // of `astryx docs authoring`, so the topic index is not asked for it.
  const experimental = new Set(
    loaded
      .filter(entry => isExperimentalSelfDoc(entry.doc))
      .map(entry => entry.source),
  );

  /**
   * @param {string} source
   * @returns {UnreadableReason | null}
   */
  const blocked = source => {
    if (!registered.has(source)) return 'unregistered';
    if (failedSources.has(source) || !keyOf.has(source)) return 'failed';
    const key = /** @type {string} */ (keyOf.get(source));
    return topicKeys != null && !experimental.has(source) && !topicKeys.has(key)
      ? 'missing-section'
      : null;
  };

  /** @type {Map<string, string[]>} declaring module -> its public types */
  const byModule = new Map();
  for (const {name, module} of types) {
    byModule.set(module, [...(byModule.get(module) ?? []), name]);
  }
  /** @type {{module: string, names: string[], reason: UnreadableReason, source?: string, key?: string}[]} */
  const unreadable = [];
  for (const [module, names] of byModule) {
    const docs = beside.get(folderOf(module)) ?? [];
    if (docs.length === 0) {
      unreadable.push({module, names, reason: 'no-self-doc'});
      continue;
    }
    const reasons = docs.map(blocked);
    if (reasons.includes(null)) continue;
    const source = docs[0];
    const key = keyOf.get(source);
    unreadable.push({
      module,
      names,
      reason: /** @type {UnreadableReason} */ (reasons[0]),
      source,
      ...(key != null ? {key} : {}),
    });
  }

  const publicFolders = new Set(types.map(({module}) => folderOf(module)));
  const publicNames = new Set(types.map(({name}) => name));
  /** @type {Map<string, any>} */
  const docOf = new Map(loaded.map(entry => [entry.source, entry.doc]));
  /** @type {{source: string, key?: string, subject?: string}[]} */
  const unmatched = [];
  for (const source of sources) {
    const key = keyOf.get(source);
    const keyed = key != null ? {key} : {};
    const folder = folderOf(source);
    if (!publicFolders.has(folder)) {
      unmatched.push({source, ...keyed});
      continue;
    }
    const subject = docOf.get(source)?.displayName;
    if (
      typeof subject === 'string' &&
      IDENTIFIER_RE.test(subject) &&
      !publicNames.has(subject) &&
      declaredIn(t, folder, subject)
    ) {
      unmatched.push({source, ...keyed, subject});
    }
  }

  return {types: types.length, unreadable, untraced, unmatched};
}
