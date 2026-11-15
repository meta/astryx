// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle.copy module graph — decides, for each module a component
 * reaches, whether the copy imports it from the owner package's public
 * exports or carries it in the output.
 *
 * @input the owner package's source root and `exports` map, the component folder
 * @output the files the copy holds, each with its rewritten source
 * @position api/swizzle adapter helper; the copy leaf reaches it through _adapter.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {isBuiltin} from 'node:module';
import {packageOf} from '../../foundation/render/served-packages.mjs';
import {resolveInstalledPackageDir} from '../../foundation/integrations/installed-package.mjs';
import {babelParse as parse} from '../../foundation/runtime/lazy-dependencies.mjs';
import {
  inspectPackageExport,
  sourceExportTarget,
} from '../../foundation/discovery/package-exports.mjs';
import {
  moduleExportOrigins,
  resolveLocalModule,
} from '../../foundation/discovery/module-exports.mjs';
import {
  allTargets,
  isRecord,
  subpathDeclaration,
} from '../../foundation/integrations/exports-subpaths.mjs';

/** The extensions an extensionless import may name, in resolution order. */
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const STYLEX_FILE = /\.stylex\.[cm]?[jt]sx?$/;

/** @param {string} file */
const toPosix = file => file.split(path.sep).join('/');

/**
 * The file an import names, or null when no file is there.
 * @param {string} fromFile absolute path of the importing file
 * @param {string} specifier a relative specifier
 * @param {Map<string, string|null>} cache resolutions already made in this copy
 * @returns {string|null}
 */
function resolveRelative(fromFile, specifier, cache) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const known = cache.get(base);
  if (known !== undefined) return known;
  const found = resolveLocalModule(specifier, fromFile);
  cache.set(base, found);
  return found;
}

/**
 * @typedef {object} ImportSpecifier
 * @property {string} imported the exported name (`default` for a default import)
 * @property {string} local
 * @property {boolean} typeOnly
 *
 * @typedef {object} ModuleReference
 * @property {'named'|'namespace'|'sideEffect'|'dynamic'|'reexportAll'|'reexportNamed'} kind
 * @property {string} source the specifier as written
 * @property {number} start statement (or, for `import()`, string literal) start
 * @property {number} end
 * @property {boolean} typeOnly the whole statement is `import type` / `export type`
 * @property {ImportSpecifier[]} specifiers
 * @property {string} [namespace] the local name of `* as X`
 *
 * @typedef {object} ParsedModule
 * @property {string} code
 * @property {ModuleReference[]} references
 * @property {Set<string>} declares names the module declares and exports

 */

/**
 * A module's source and every module reference in it: static imports and
 * re-exports, `import()` calls, and `import('…')` types.
 * @param {string} file
 * @returns {ParsedModule}
 */
function parseModule(file) {
  const code = fs.readFileSync(file, 'utf-8');
  /** @type {ParsedModule} */
  const parsed = {code, references: [], declares: new Set()};
  if (!CODE_FILE.test(file)) return parsed;
  const ast = parse(code, {
    sourceType: 'module',
    errorRecovery: true,
    plugins: /\.[cm]?tsx?$/.test(file) ? ['typescript', 'jsx'] : ['jsx'],
  });
  const {references} = parsed;
  // Babel's node types mark positions optional; a parsed file always has them.
  for (const node of /** @type {any[]} */ (ast.program.body)) {
    for (const d of node.declaration?.declarations ?? [node.declaration]) {
      if (node.type === 'ExportNamedDeclaration' && d?.id?.name)
        parsed.declares.add(d.id.name);
    }
    if (node.type === 'ImportDeclaration') {
      const typeOnly = node.importKind === 'type';
      const base = {
        source: node.source.value,
        start: node.start,
        end: node.end,
        typeOnly,
      };
      const namespace = node.specifiers.find(
        (/** @type {any} */ s) => s.type === 'ImportNamespaceSpecifier',
      );
      const named = node.specifiers.filter(
        (/** @type {any} */ s) => s.type !== 'ImportNamespaceSpecifier',
      );
      if (node.specifiers.length === 0) {
        references.push({...base, kind: 'sideEffect', specifiers: []});
      } else if (namespace && named.length === 0) {
        references.push({
          ...base,
          kind: 'namespace',
          specifiers: [],
          namespace: namespace.local.name,
        });
      } else if (!namespace) {
        references.push({
          ...base,
          kind: 'named',
          specifiers: named.map((/** @type {any} */ s) => ({
            imported:
              s.type === 'ImportDefaultSpecifier'
                ? 'default'
                : s.imported.type === 'StringLiteral'
                  ? s.imported.value
                  : s.imported.name,
            local: s.local.name,
            typeOnly: typeOnly || s.importKind === 'type',
          })),
        });
      } else {
        // `import X, * as Y from` names the whole module.
        references.push({...base, kind: 'namespace', specifiers: []});
      }
    } else if (node.type === 'ExportAllDeclaration') {
      references.push({
        kind: 'reexportAll',
        source: node.source.value,
        start: node.start,
        end: node.end,
        typeOnly: node.exportKind === 'type',
        specifiers: [],
      });
    } else if (node.type === 'ExportNamedDeclaration' && node.source) {
      const typeOnly = node.exportKind === 'type';
      references.push({
        kind: 'reexportNamed',
        source: node.source.value,
        start: node.start,
        end: node.end,
        typeOnly,
        specifiers: node.specifiers.map((/** @type {any} */ s) => ({
          imported: s.type === 'ExportNamespaceSpecifier' ? '*' : s.local.name,
          local:
            s.exported.type === 'StringLiteral'
              ? s.exported.value
              : s.exported.name,
          typeOnly: typeOnly || s.exportKind === 'type',
        })),
      });
    }
  }
  visitDynamicReferences(ast.program, literal => {
    references.push({
      kind: 'dynamic',
      source: literal.value,
      start: literal.start,
      end: literal.end,
      typeOnly: false,
      specifiers: [],
    });
  });
  return parsed;
}

/**
 * Call `onLiteral` with the string literal of every `import('…')` call and
 * `import('…')` type under a node.
 * @param {any} node
 * @param {(literal: {value: string, start: number, end: number}) => void} onLiteral
 */
function visitDynamicReferences(node, onLiteral) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) visitDynamicReferences(child, onLiteral);
    return;
  }
  if (
    node.type === 'CallExpression' &&
    node.callee?.type === 'Import' &&
    node.arguments[0]?.type === 'StringLiteral'
  ) {
    onLiteral(node.arguments[0]);
  } else if (
    node.type === 'ImportExpression' &&
    node.source?.type === 'StringLiteral'
  ) {
    onLiteral(node.source);
  } else if (node.type === 'TSImportType') {
    const literal =
      node.argument?.type === 'TSLiteralType'
        ? node.argument.literal
        : node.argument;
    if (literal?.type === 'StringLiteral') onLiteral(literal);
  }
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    )
      continue;
    const value = node[key];
    if (value && typeof value === 'object')
      visitDynamicReferences(value, onLiteral);
  }
}

/**
 * @typedef {'value' | 'type'} ExportKind `value` reads runtime exports only;
 *   `type` reads type-only exports too
 *
 * @typedef {(file: string, kind: ExportKind) => Map<string, {file: string, name: string}>} OriginsOf
 *   every name a module exports, with where it is declared
 *
 * @typedef {Map<string, Array<{subpath: string, name: string}>>} ExportersByOrigin
 *   `file#name` of a declaration -> the subpaths that export it, and as what
 *
 * @typedef {object} PublicSurface
 * @property {Record<ExportKind, ExportersByOrigin>} byOrigin the subpaths
 *   that export each declaration as a value, and as a value or a type
 * @property {Map<string, string>} byFile source file -> the subpath that
 *   exports exactly that file
 * @property {Record<string, unknown>|undefined} exportsField
 */

/**
 * Every public subpath of a package with the source file under `root` that
 * the shared export readers give it. `./internal/*` is never public.
 * @param {{exports?: unknown}} pkg
 * @param {string} packageDir
 * @param {string} root
 * @returns {Array<[string, string]>}
 */
function exportedSourceFiles(pkg, packageDir, root) {
  const exportsField = pkg.exports;
  const subpathMap =
    isRecord(exportsField) &&
    Object.keys(exportsField).some(key => key.startsWith('.'));
  const candidates = new Set(['.']);
  if (subpathMap) {
    for (const [key, value] of Object.entries(exportsField)) {
      if (!key.includes('*')) {
        candidates.add(key);
        continue;
      }
      for (const subpath of wildcardSubpaths(packageDir, root, key, value)) {
        candidates.add(subpath);
      }
    }
  }
  /** @type {Array<[string, string]>} */
  const found = [];
  for (const subpath of candidates) {
    if (/^\.\/internal(\/|$)/.test(subpath)) continue;
    const inspected = inspectPackageExport(pkg, packageDir, subpath);
    if (!inspected.exported) continue;
    const file =
      sourceExportTarget(pkg, packageDir, subpath) ?? inspected.target;
    if (
      file &&
      file.startsWith(root + path.sep) &&
      !DECLARATION_FILE.test(file)
    ) {
      found.push([subpath, file]);
    }
  }
  return found;
}

/**
 * The subpaths a `*` key names: one per file its target patterns match.
 * @param {string} packageDir
 * @param {string} root
 * @param {string} key
 * @param {unknown} value
 * @returns {string[]}
 */
function wildcardSubpaths(packageDir, root, key, value) {
  /** @type {string[]} */
  const subpaths = [];
  for (const pattern of allTargets(value)) {
    if (!pattern.startsWith('./') || !pattern.includes('*')) continue;
    const fixed = pattern.slice(2, pattern.indexOf('*'));
    const base = path.resolve(
      packageDir,
      fixed.slice(0, fixed.lastIndexOf('/') + 1),
    );
    if (!base.startsWith(root) || !fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      if (path.relative(base, file).split(path.sep).includes('node_modules'))
        continue;
      const rel = toPosix(path.relative(packageDir, file));
      if (!rel.startsWith(fixed)) continue;
      const rest = rel.slice(fixed.length);
      for (let end = 1; end <= rest.length; end++) {
        const star = rest.slice(0, end);
        if (pattern.slice(2).replaceAll('*', star) === rel) {
          subpaths.push(key.replace('*', star));
          break;
        }
      }
    }
  }
  return subpaths;
}

/**
 * The owner package's public surface, read from its `exports` map: each
 * subpath with a `source` condition under the source root, and the
 * declarations it exports. `./internal/*` subpaths are not public.
 * @param {string} packageDir
 * @param {string} srcRoot
 * @param {OriginsOf} originsOf
 * @returns {PublicSurface}
 */
function publicSurfaceOf(packageDir, srcRoot, originsOf) {
  /** @type {{exports?: unknown}} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
    );
  } catch {
    pkg = {};
  }
  const exportsField =
    pkg.exports && typeof pkg.exports === 'object'
      ? /** @type {Record<string, unknown>} */ (pkg.exports)
      : undefined;
  /** @type {PublicSurface['byOrigin']} */
  const byOrigin = {value: new Map(), type: new Map()};
  /** @type {PublicSurface['byFile']} */
  const byFile = new Map();
  for (const [subpath, sourceFile] of exportedSourceFiles(
    pkg,
    packageDir,
    srcRoot,
  )) {
    byFile.set(sourceFile, subpath);
    if (!CODE_FILE.test(sourceFile)) continue;
    for (const kind of /** @type {const} */ (['value', 'type'])) {
      for (const [name, origin] of originsOf(sourceFile, kind)) {
        const key = `${origin.file}#${origin.name}`;
        const list = byOrigin[kind].get(key) ?? [];
        list.push({subpath, name});
        byOrigin[kind].set(key, list);
      }
    }
  }
  return {byOrigin, byFile, exportsField};
}

/**
 * A specifier that is either fixed (a public subpath) or computed from where
 * two copied files land.
 * @typedef {string | {from: string, to: string}} SpecifierChoice
 *
 * @typedef {object} PlannedEdit
 * @property {number} start
 * @property {number} end
 * @property {(specifierOf: (choice: SpecifierChoice) => string) => string} render
 *
 * @typedef {object} CopyPlan
 * @property {Map<string, {code: string, edits: PlannedEdit[]}>} files every
 *   file the copy holds (absolute source path), with the edits its imports need
 * @property {Map<string, Set<string>>} dependsOn file -> carried files its
 *   computed specifiers point at
 * @property {Map<string, string>} otherPackages the source root of each other
 *   Astryx package the copy carries modules from, with its package name
 * @property {Record<string, string>} dependencies each npm package the copied
 *   files import, other than the owner package and Node's built-in modules,
 *   with the range the owner package declares
 */

/**
 * Follow a component's module graph from its entry files and decide what the
 * copy holds. A module inside the component folder is copied. A module
 * outside it is reached through the owner package's public exports when every
 * name taken from it is public there; otherwise the module that defines the
 * name is copied, and imported by relative path. Tests, stories and docs are
 * never reached, so they are never copied.
 *
 * @param {object} options
 * @param {string} options.packageDir the owner package root
 * @param {string} options.srcRoot its source root
 * @param {string} options.componentDir
 * @param {string} options.ownerPackage
 * @param {string[]} options.entries absolute entry files of the component
 * @returns {CopyPlan}
 */
export function planCopy({
  packageDir,
  srcRoot,
  componentDir,
  ownerPackage,
  entries,
}) {
  // Every read is cached for this copy only, so a later copy sees the
  // package as it is then.
  const exportMemos = {value: new Map(), type: new Map()};
  /** @type {OriginsOf} */
  const originsOf = (file, kind) =>
    moduleExportOrigins(file, {
      types: kind === 'type',
      memo: exportMemos[kind],
    });
  /** @param {string} file @param {string} name */
  const originOf = (file, name) => originsOf(file, 'type').get(name) ?? null;
  /**
   * The name a module exports one of its own bindings under, or null.
   * @param {{file: string, name: string}} origin
   */
  const exportNameOf = origin => {
    for (const [name, found] of originsOf(origin.file, 'type')) {
      if (found.file === origin.file && found.name === origin.name) return name;
    }
    return null;
  };
  /** @type {Map<string, string|null>} */
  const resolutions = new Map();
  /** @type {CopyPlan['files']} */
  const files = new Map();
  /** @type {CopyPlan['dependsOn']} */
  const dependsOn = new Map();
  /** @type {Set<string>} */
  const packages = new Set();
  const queue = [...entries];
  const queued = new Set(queue);
  /** @param {string} file */
  const enqueue = file => {
    if (!queued.has(file)) {
      queued.add(file);
      queue.push(file);
    }
  };
  /** @param {string} file */
  const inComponent = file => file.startsWith(componentDir + path.sep);

  /**
   * @typedef {ReturnType<typeof makeContext>} PackageContext
   */

  /**
   * How references inside one package's source are planned: its public
   * surface and the subpaths a name or module is imported from.
   * @param {{packageDir: string, srcRoot: string, ownerPackage: string}} pkg
   */
  function makeContext({packageDir, srcRoot, ownerPackage}) {
    const surface = publicSurfaceOf(packageDir, srcRoot, originsOf);
    /** @param {string} file */
    const inSource = file => file.startsWith(srcRoot + path.sep);
    /**
     * The subpaths that export a module's export: as a value when the import
     * takes a value, since a type-only export is erased at runtime.
     * @param {string} file
     * @param {string} name
     * @param {boolean} typeOnly
     */
    const exportersOf = (file, name, typeOnly) => {
      const origin = originOf(file, name);
      if (!origin) return [];
      const kind = typeOnly ? 'type' : 'value';
      return surface.byOrigin[kind].get(`${origin.file}#${origin.name}`) ?? [];
    };
    /**
     * The subpath that exports every name a module exports, with the same
     * definition. An exactly exported file is its own subpath.
     * @param {string} file
     * @returns {string|null}
     */
    const subpathCoveringModule = file => {
      const exact = surface.byFile.get(file);
      if (exact) return exact;
      const names = [...originsOf(file, 'type').keys()];
      if (names.length === 0) return null;
      const values = originsOf(file, 'value');
      const options = names.map(name =>
        exportersOf(file, name, !values.has(name))
          .filter(o => o.name === name)
          .map(o => o.subpath),
      );
      const common = options.reduce((acc, list) =>
        acc.filter(s => list.includes(s)),
      );
      return STYLEX_FILE.test(file) ? null : pickSubpath(common, file);
    };

    /**
     * The public subpath to take a name from. A StyleX module is imported by
     * its own exported path, because the StyleX compiler resolves styles and
     * variables from the real module; when that path is not exported, there is
     * no public import.
     * @param {string[]} subpaths subpaths that export the name
     * @param {string} target the module the import names
     * @param {string} [originFile] the module that defines the name
     * @returns {string|null}
     */
    const choosePublic = (subpaths, target, originFile) => {
      const exact = originFile ? surface.byFile.get(originFile) : undefined;
      if (exact && subpaths.includes(exact)) return exact;
      if (
        STYLEX_FILE.test(target) ||
        (originFile && STYLEX_FILE.test(originFile))
      )
        return null;
      return pickSubpath(subpaths, target);
    };

    /**
     * Prefer the subpath of the module's top folder, then the package root.
     * @param {string[]} subpaths
     * @param {string} file
     * @returns {string|null}
     */
    const pickSubpath = (subpaths, file) => {
      if (subpaths.length === 0) return null;
      const top = `./${toPosix(path.relative(srcRoot, file)).split('/')[0]}`;
      return (
        subpaths.find(s => s === top) ??
        subpaths.find(s => s === '.') ??
        [...subpaths].sort((a, b) => a.length - b.length)[0]
      );
    };

    /** @param {string} subpath */
    const publicSpecifier = subpath =>
      subpath === '.' ? ownerPackage : `${ownerPackage}/${subpath.slice(2)}`;

    return {
      packageDir,
      srcRoot,
      ownerPackage,
      surface,
      inSource,
      exportersOf,
      subpathCoveringModule,
      choosePublic,
      publicSpecifier,
    };
  }
  const owner = makeContext({packageDir, srcRoot, ownerPackage});
  /** @type {Map<string, PackageContext>} other packages' contexts, by source root */
  const others = new Map();
  /** @param {string} file */
  const contextOf = file => {
    if (file.startsWith(srcRoot + path.sep)) return owner;
    for (const [root, context] of others) {
      if (file.startsWith(root + path.sep)) return context;
    }
    return owner;
  };

  /**
   * The source module a bare import of another Astryx package's
   * `./internal/*` path names, or null. That module is carried, and its
   * package gets a context of its own.
   * @param {string} file
   * @param {string} specifier
   * @returns {string|null}
   */
  const internalModuleOf = (file, specifier) => {
    const name = packageOf(specifier);
    const sub = specifier.slice(name.length + 1);
    if (!name.startsWith('@astryxdesign/') || name === ownerPackage)
      return null;
    if (!/^internal(\/|$)/.test(sub)) return null;
    const installed = resolveInstalledPackageDir(name, path.dirname(file));
    if (!installed) return null;
    const dir = fs.realpathSync(installed.packageDir);
    /** @type {{exports?: unknown}} */
    let pkg;
    try {
      pkg = JSON.parse(
        fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
      );
    } catch {
      return null;
    }
    const target = sourceExportTarget(pkg, dir, `./${sub}`);
    // A StyleX module's identity is its path, so the copy keeps importing it
    // by its exported path and agrees with the package on it.
    if (!target || STYLEX_FILE.test(target)) return null;
    const src = path.join(dir, 'src');
    const root = target.startsWith(src + path.sep) ? src : dir;
    if (!others.has(root)) {
      others.set(
        root,
        makeContext({packageDir: dir, srcRoot: root, ownerPackage: name}),
      );
    }
    return target;
  };

  /**
   * Carry a module in the copy.
   * @param {string} from
   * @param {string} to
   * @returns {SpecifierChoice}
   */
  const carry = (from, to) => {
    enqueue(to);
    const deps = dependsOn.get(from) ?? new Set();
    deps.add(to);
    dependsOn.set(from, deps);
    return {from, to};
  };

  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.shift());
    const parsed = parseModule(file);
    /** @type {PlannedEdit[]} */
    const edits = [];
    files.set(file, {code: parsed.code, edits});
    if (!CODE_FILE.test(file)) continue;
    const context = contextOf(file);
    for (const ref of parsed.references) {
      if (!ref.source.startsWith('.')) {
        const internal = internalModuleOf(file, ref.source);
        if (internal) {
          edits.push(sourceEdit(parsed.code, ref, carry(file, internal)));
          continue;
        }
        const builtin = ref.source.startsWith('node:') || isBuiltin(ref.source);
        const name = packageOf(ref.source);
        if (!builtin && name !== ownerPackage) packages.add(name);
        continue;
      }
      const target = resolveRelative(file, ref.source, resolutions);
      // A dangling import is left for the build to report.
      if (!target) continue;
      if (inComponent(target)) {
        // Files of the component keep their relative imports of each other.
        if (inComponent(file)) enqueue(target);
        else edits.push(sourceEdit(parsed.code, ref, carry(file, target)));
        continue;
      }
      if (!CODE_FILE.test(target) || !context.inSource(target)) {
        // An asset, such as `../../locales/en.json` or a stylesheet, that the
        // package exports by its own path is imported from the package.
        const subpath = `./${toPosix(path.relative(context.packageDir, target))}`;
        if (
          subpathDeclaration(context.surface.exportsField, subpath).state ===
          'declared'
        ) {
          if (context !== owner) packages.add(context.ownerPackage);
          edits.push(
            sourceEdit(
              parsed.code,
              ref,
              `${context.ownerPackage}/${subpath.slice(2)}`,
            ),
          );
          continue;
        }
        // An unexported asset in the source is carried; one outside it is
        // left for the build to report.
        if (!context.inSource(target)) continue;
        edits.push(sourceEdit(parsed.code, ref, carry(file, target)));
        continue;
      }
      edits.push(planReference(context, file, parsed.code, ref, target));
    }
  }
  return {
    files,
    dependsOn,
    dependencies: declaredRanges(packageDir, packages),
    otherPackages: new Map(
      [...others].map(([root, c]) => [root, c.ownerPackage]),
    ),
  };

  /**
   * Decide one reference that leaves the component folder.
   * @param {PackageContext} context the package the importing file is in
   * @param {string} file
   * @param {string} code
   * @param {ModuleReference} ref
   * @param {string} target
   * @returns {PlannedEdit}
   */
  function planReference(context, file, code, ref, target) {
    // A carried module of another package imports that package's public names
    // from it, so the copy depends on it.
    if (context !== owner) packages.add(context.ownerPackage);
    if (ref.kind !== 'named' && ref.kind !== 'reexportNamed') {
      const covering = context.subpathCoveringModule(target);
      return sourceEdit(
        code,
        ref,
        covering ? context.publicSpecifier(covering) : carry(file, target),
      );
    }
    /** @type {Array<{choice: SpecifierChoice, specs: ImportSpecifier[]}>} */
    const groups = [];
    /** @param {SpecifierChoice} choice @param {ImportSpecifier} spec */
    const add = (choice, spec) => {
      const same = groups.find(g =>
        typeof choice === 'string'
          ? g.choice === choice
          : typeof g.choice !== 'string' && g.choice.to === choice.to,
      );
      if (same) same.specs.push(spec);
      else groups.push({choice, specs: [spec]});
    };
    for (const spec of ref.specifiers) {
      if (spec.imported === '*') {
        const covering = context.subpathCoveringModule(target);
        add(
          covering ? context.publicSpecifier(covering) : carry(file, target),
          spec,
        );
        continue;
      }
      const origin = originOf(target, spec.imported);
      const publicOptions = context.exportersOf(
        target,
        spec.imported,
        spec.typeOnly,
      );
      const chosen = context.choosePublic(
        publicOptions.map(o => o.subpath),
        target,
        origin?.file,
      );
      if (chosen) {
        const exported = /** @type {{name: string}} */ (
          publicOptions.find(o => o.subpath === chosen)
        ).name;
        add(context.publicSpecifier(chosen), {...spec, imported: exported});
      } else {
        // Take the name from the module that defines it, so the copy carries
        // that module and not a whole barrel. An origin names a binding, so
        // the import uses the name that module exports it under.
        // A module that declares the name itself, even as an alias, is carried.
        const definingExport =
          origin &&
          origin.file !== target &&
          context.inSource(origin.file) &&
          !parseModule(target).declares.has(spec.imported)
            ? exportNameOf(origin)
            : null;
        if (origin && definingExport != null) {
          add(carry(file, origin.file), {...spec, imported: definingExport});
        } else {
          add(carry(file, target), spec);
        }
      }
    }
    // One source and the same names: keep the statement as written and swap
    // only its specifier.
    const unchangedNames =
      groups.length === 1 &&
      groups[0].specs.every(
        (spec, i) => spec.imported === ref.specifiers[i].imported,
      );
    if (unchangedNames) return sourceEdit(code, ref, groups[0].choice);
    return {
      start: ref.start,
      end: ref.end,
      render: specifierOf => renderStatements(ref, groups, specifierOf),
    };
  }
}

/**
 * The version range the owner package declares for each npm package the copy
 * imports, by name; `*` for one it does not declare.
 * @param {string} packageDir
 * @param {Iterable<string>} names
 * @returns {Record<string, string>}
 */
function declaredRanges(packageDir, names) {
  /** @type {Record<string, Record<string, string>>} */
  let manifest = {};
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
    );
  } catch {
    // An unreadable manifest declares nothing.
  }
  /** @type {Record<string, string>} */
  const ranges = {};
  for (const name of [...names].sort()) {
    ranges[name] =
      manifest.dependencies?.[name] ??
      manifest.optionalDependencies?.[name] ??
      manifest.peerDependencies?.[name] ??
      '*';
  }
  return ranges;
}

/**
 * An edit that replaces only the string literal of a reference.
 * @param {string} code
 * @param {ModuleReference} ref
 * @param {SpecifierChoice} choice
 * @returns {PlannedEdit}
 */
function sourceEdit(code, ref, choice) {
  const slice = code.slice(ref.start, ref.end);
  const quoted = new RegExp(
    `(['"])${ref.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`,
  );
  const m = slice.match(quoted);
  const at = m && m.index != null ? ref.start + m.index : ref.start;
  const length = m ? m[0].length : 0;
  const quote = m ? m[1] : "'";
  return {
    start: at,
    end: at + length,
    render: specifierOf =>
      m ? `${quote}${specifierOf(choice)}${quote}` : slice,
  };
}

/**
 * The statements that replace one named import or re-export, one per source.
 * @param {ModuleReference} ref
 * @param {Array<{choice: SpecifierChoice, specs: ImportSpecifier[]}>} groups
 * @param {(choice: SpecifierChoice) => string} specifierOf
 */
function renderStatements(ref, groups, specifierOf) {
  const keyword = ref.kind === 'reexportNamed' ? 'export' : 'import';
  const statements = [];
  for (const {choice, specs} of groups) {
    const specifier = specifierOf(choice);
    const star = specs.find(s => s.imported === '*');
    if (star) statements.push(`export * as ${star.local} from '${specifier}';`);
    const named = specs.filter(s => s.imported !== '*');
    if (named.length === 0) continue;
    const allType = ref.typeOnly || named.every(s => s.typeOnly);
    const parts = named.map(s => {
      const prefix = !allType && s.typeOnly ? 'type ' : '';
      return s.imported === s.local
        ? `${prefix}${s.local}`
        : `${prefix}${s.imported} as ${s.local}`;
    });
    const head = `${keyword} ${allType ? 'type ' : ''}`;
    const oneLine = `${head}{${parts.join(', ')}} from '${specifier}';`;
    statements.push(
      oneLine.length <= 80
        ? oneLine
        : `${head}{\n${parts.map(p => `  ${p},`).join('\n')}\n} from '${specifier}';`,
    );
  }
  return statements.join('\n');
}

/**
 * The source of a planned file with its edits applied.
 * @param {{code: string, edits: PlannedEdit[]}} planned
 * @param {(choice: SpecifierChoice) => string} specifierOf
 */
export function renderFile(planned, specifierOf) {
  let out = planned.code;
  for (const edit of [...planned.edits].sort((a, b) => b.start - a.start)) {
    out =
      out.slice(0, edit.start) + edit.render(specifierOf) + out.slice(edit.end);
  }
  return out;
}

/**
 * The relative specifier from one written file to another.
 * @param {string} fromDest
 * @param {string} toDest
 */
export function relativeSpecifierBetween(fromDest, toDest) {
  let rel = toPosix(path.relative(path.dirname(fromDest), toDest));
  rel = DECLARATION_FILE.test(toDest)
    ? rel.replace(/\.d\.[cm]?ts$/, '')
    : rel.replace(/\.(?:[cm]?[jt]sx?)$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}
