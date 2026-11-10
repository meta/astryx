// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Say whether the project installs TypeScript, and open the compiler
 * the type checks run on.
 *
 * @input Directories to resolve `typescript` from, in order.
 * @output The version of the project's `typescript`, or null when none is
 *   installed; and `openTypeScript`, a session on this CLI's own TypeScript 7
 *   compiler (`typescript-native`), read through its API.
 * @position Shared by the author checks that read types. A project without
 *   TypeScript is not checked, and each check says so the same way. A project
 *   with any TypeScript is checked with this CLI's own TypeScript 7, so every
 *   project reads the same types the same way, whatever version it installs.
 */

import * as path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The version of the project's own `typescript`, trying each directory in
 * order, or null when none of them installs it.
 * @param {Array<string | null | undefined>} dirs
 * @returns {{version: string} | null}
 */
export function resolveProjectTypeScript(dirs) {
  for (const dir of dirs) {
    if (!dir) continue;
    const from = createRequire(path.join(path.resolve(dir), 'package.json'));
    try {
      const {version} = from('typescript/package.json');
      if (typeof version === 'string' && version !== '') return {version};
    } catch {
      // Not installed from here; try the next directory.
    }
  }
  return null;
}

/** What to do when the project installs no TypeScript. */
export const TYPESCRIPT_FIX =
  'Install TypeScript in this project (`npm install -D typescript`), then run this check again.';

/** @type {{sync: any, ast: any, version: string} | null} */
let loaded = null;

/** This CLI's own TypeScript 7: its API, its syntax tree, and its version. */
function load() {
  loaded ??= {
    sync: require('typescript-native/unstable/sync'),
    ast: require('typescript-native/unstable/ast'),
    version: String(require('typescript-native/package.json').version),
  };
  return loaded;
}

/** The version of the compiler the checks run on. */
export function nativeTypeScriptVersion() {
  return load().version;
}

/** @type {any} */
let facade = null;

/**
 * TypeScript 7's syntax tree helpers, under the names the checks use: its own
 * node tests and enums, and the few helpers TypeScript 7 names differently or
 * leaves to the node.
 */
export function typeScriptSyntax() {
  if (facade) return facade;
  const {ast, sync} = load();
  const K = ast.SyntaxKind;
  facade = {
    ...ast,
    SymbolFlags: sync.SymbolFlags,
    TypeFlags: sync.TypeFlags,
    ObjectFlags: sync.ObjectFlags,
    SignatureKind: sync.SignatureKind,
    DiagnosticCategory: sync.DiagnosticCategory,
    forEachChild: (/** @type {any} */ node, /** @type {any} */ visit) =>
      node.forEachChild(visit),
    isStringLiteralLike: (/** @type {any} */ node) =>
      node?.kind === K.StringLiteral ||
      node?.kind === K.NoSubstitutionTemplateLiteral,
    isMethodSignature: ast.isMethodSignatureDeclaration,
    isPropertySignature: ast.isPropertySignatureDeclaration,
    isParameter: ast.isParameterDeclaration,
    isTypeAssertionExpression: ast.isTypeAssertion,
    isTypeElement: (/** @type {any} */ node) =>
      TYPE_ELEMENTS.has(node?.kind),
    isFunctionLike: (/** @type {any} */ node) =>
      FUNCTION_LIKE.has(node?.kind),
    isClassLike: (/** @type {any} */ node) =>
      node?.kind === K.ClassDeclaration || node?.kind === K.ClassExpression,
    isEntityNameExpression: function isEntityName(/** @type {any} */ node) {
      return (
        node?.kind === K.Identifier ||
        (node?.kind === K.PropertyAccessExpression &&
          node.name?.kind === K.Identifier &&
          isEntityName(node.expression))
      );
    },
    isExternalModule: (/** @type {any} */ sf) =>
      sf.externalModuleIndicator !== undefined &&
      sf.externalModuleIndicator !== null,
    isConstTypeReference: (/** @type {any} */ node) =>
      node?.kind === K.TypeReference &&
      node.typeName?.kind === K.Identifier &&
      node.typeName.text === 'const' &&
      !node.typeArguments,
    // `declare global { … }`: a module declaration named by the `global`
    // keyword, not a string.
    isGlobalScopeAugmentation: (/** @type {any} */ node) =>
      node?.kind === K.ModuleDeclaration &&
      node.name?.kind === K.Identifier &&
      node.name.text === 'global',
  };
  const TYPE_ELEMENTS = new Set([
    K.PropertySignature,
    K.MethodSignature,
    K.CallSignature,
    K.ConstructSignature,
    K.IndexSignature,
  ]);
  const FUNCTION_LIKE = new Set(
    [
      K.MethodSignature,
      K.CallSignature,
      K.JSDocSignature,
      K.ConstructSignature,
      K.IndexSignature,
      K.FunctionType,
      K.ConstructorType,
      K.FunctionDeclaration,
      K.MethodDeclaration,
      K.Constructor,
      K.GetAccessor,
      K.SetAccessor,
      K.FunctionExpression,
      K.ArrowFunction,
    ].filter(kind => kind !== undefined),
  );
  return facade;
}

/**
 * Flatten a TypeScript 7 diagnostic's message and its chain the way
 * TypeScript's `flattenDiagnosticMessageText` does: each chained message on
 * its own `newLine`, indented two spaces a level.
 * @param {{text: string, messageChain?: any[]}} diagnostic
 * @param {string} newLine
 */
export function flattenDiagnostic(diagnostic, newLine) {
  /** @param {any} d @param {number} indent @returns {string} */
  const visit = (d, indent) => {
    let out = '';
    if (indent) out += newLine + '  '.repeat(indent);
    out += d.text;
    for (const kid of d.messageChain ?? []) out += visit(kid, indent + 1);
    return out;
  };
  return visit(diagnostic, 0);
}

/**
 * The messages of a diagnostic's chain, outermost first, following each
 * level's first chained message.
 * @param {{text: string, messageChain?: any[]}} diagnostic
 * @returns {string[]}
 */
export function diagnosticChain(diagnostic) {
  /** @type {string[]} */
  const out = [];
  /** @type {any} */
  let d = diagnostic;
  while (d) {
    out.push(d.text);
    d = d.messageChain?.[0];
  }
  return out;
}

let configCount = 0;

/**
 * Why a check did not run when this CLI's own TypeScript 7 cannot start (its
 * compiler for this platform is missing), and what to do.
 * @param {unknown} error
 * @param {string} outcome what was not done, such as `docs were not checked`
 */
export function nativeTypeScriptFailedReason(error, outcome) {
  const detail = error instanceof Error ? error.message : String(error);
  return `This CLI's TypeScript 7 compiler could not start (${detail}), so ${outcome}. Reinstall @astryxdesign/cli for this platform and run this check again.`;
}

/**
 * A session on this CLI's own TypeScript 7 compiler. Files set with `set`
 * replace the file at that path for the compiler (a virtual file); every
 * other file is read from disk. `project` opens a program over the given
 * files with the given options, through a virtual tsconfig. `update` reads
 * changed virtual files again. `syntax` holds the syntax helpers, with
 * `createSourceFile` parsing text through the compiler. Call `close` when
 * done: it stops the compiler process.
 * @param {{cwd: string}} options
 */
export function openTypeScript({cwd}) {
  const {sync, version} = load();
  /** @type {Map<string, string>} */
  const files = new Map();
  const api = new sync.API({
    cwd,
    fs: {
      readFile: (/** @type {string} */ file) => files.get(file),
      fileExists: (/** @type {string} */ file) =>
        files.has(file) ? true : undefined,
    },
  });
  /** @type {any[]} */
  const snapshots = [];
  /** @type {Map<string, any>} parsed text, by extension and text */
  const parsedTexts = new Map();
  /** @type {WeakMap<object, any[]>} */
  const parseDiagnostics = new WeakMap();
  /** @type {string | null} */
  let parseConfig = null;
  let parseCount = 0;

  /**
   * The virtual tsconfig for a program: `config` (tsconfig JSON) at
   * `dir/__astryx_check_<n>.tsconfig.json`.
   * @param {string} dir
   * @param {Record<string, unknown>} config
   */
  const writeConfig = (dir, config) => {
    const file = path.join(dir, `__astryx_check_${++configCount}.tsconfig.json`);
    files.set(file, JSON.stringify(config));
    return file;
  };

  /**
   * Parse texts, each alone, through one throwaway program; kept by text.
   * @param {Array<{fileName: string, text: string}>} entries
   */
  const parse = entries => {
    /** @type {Array<{key: string, file: string}>} */
    const todo = [];
    const keys = new Set();
    for (const {fileName, text} of entries) {
      const ext = /\.[cm]?[jt]sx?$/.exec(fileName)?.[0] ?? '.ts';
      const key = `${ext}\0${text}`;
      if (parsedTexts.has(key) || keys.has(key)) continue;
      keys.add(key);
      const file = path.join(cwd, `__astryx_text_${++parseCount}${ext}`);
      files.set(file, text);
      todo.push({key, file});
    }
    if (todo.length === 0) return;
    const config = writeConfig(cwd, {
      compilerOptions: {
        noLib: true,
        noResolve: true,
        allowJs: true,
        noEmit: true,
        types: [],
      },
      files: todo.map(entry => entry.file),
    });
    const snapshot = api.updateSnapshot({
      openProjects: [config],
      ...(parseConfig ? {closeProjects: [parseConfig]} : {}),
    });
    snapshots.push(snapshot);
    parseConfig = config;
    const project = snapshot.getProject(config);
    for (const {key, file} of todo) {
      const sf = project.program.getSourceFile(file);
      parseDiagnostics.set(sf, project.program.getSyntacticDiagnostics(file));
      parsedTexts.set(key, sf);
    }
  };

  const syntax = Object.create(typeScriptSyntax());
  /**
   * TypeScript's `createSourceFile`, through the compiler: the file's kind
   * comes from `fileName`'s extension. The tree's `fileName` is a virtual
   * one.
   * @param {string} fileName
   * @param {string} text
   */
  syntax.createSourceFile = (fileName, text) => {
    parse([{fileName, text}]);
    const ext = /\.[cm]?[jt]sx?$/.exec(fileName)?.[0] ?? '.ts';
    return parsedTexts.get(`${ext}\0${text}`);
  };
  /** Parse several texts in one request, ahead of `createSourceFile`. */
  syntax.prefetchSourceFiles = parse;
  /** @param {any} sf a tree `createSourceFile` returned */
  syntax.parseDiagnosticsOf = sf => parseDiagnostics.get(sf) ?? [];

  return {
    version,
    syntax,
    /** @param {string} file @param {string} text */
    set(file, text) {
      files.set(file, text);
    },
    /**
     * Open a program: `rootNames` with `compilerOptions` (tsconfig JSON
     * form), its virtual tsconfig in `dir`. `more` adds `extends` (first)
     * and `include` (last) to the tsconfig.
     * @param {string} dir
     * @param {string[]} rootNames
     * @param {Record<string, unknown>} compilerOptions
     * @param {string[]} [changed] virtual files set again since the last
     *   snapshot
     * @param {{extends?: string, include?: string[]}} [more]
     */
    project(dir, rootNames, compilerOptions, changed = [], more = {}) {
      const config = writeConfig(dir, {
        ...(more.extends ? {extends: more.extends} : {}),
        compilerOptions,
        files: rootNames,
        ...(more.include ? {include: more.include} : {}),
      });
      const snapshot = api.updateSnapshot({
        openProjects: [config],
        ...(changed.length ? {fileChanges: {changed}} : {}),
      });
      snapshots.push(snapshot);
      return snapshot.getProject(config);
    },
    /**
     * A new snapshot after `changed` virtual files were set again; the
     * project for `config` in it.
     * @param {any} project
     * @param {string[]} changed
     */
    update(project, changed) {
      const snapshot = api.updateSnapshot({fileChanges: {changed}});
      snapshots.push(snapshot);
      return snapshot.getProject(project.configFileName);
    },
    /** @param {string} file a tsconfig */
    parseConfigFile(file) {
      return api.parseConfigFile(file);
    },
    close() {
      // Killed before its input closes: on end of input the compiler writes
      // `context canceled` to the stderr it shares with this process. The
      // API's own `close` would first ask it to release each snapshot.
      const channel = api.client?.channel;
      if (!channel?.child) {
        api.close();
        return;
      }
      try {
        channel.child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
      channel.close();
    },
  };
}
