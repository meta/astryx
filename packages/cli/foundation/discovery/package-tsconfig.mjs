// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Read a package's TypeScript project the way `tsc` reads it, so a
 * check that reads the package's types with its own compiler sees what the
 * package compiles against.
 *
 * - The config is the nearest `tsconfig.json`: the package's own, or a
 *   monorepo's root config for a local package. An app's config above an
 *   installed package (one below `node_modules`) is not the package's, and is
 *   not read.
 * - A solution-style config (`"files": []` with `references`) lends the
 *   referenced config, at any depth, that includes the files to read.
 * - The declaration files the config includes, included files that declare
 *   globals or augment a module, and included scripts (no import or export)
 *   join the files to read, so ambient types resolve as `tsc` resolves them.
 * - Without a config, defaults read TSX the way bundlers do. A config with
 *   errors is reported, never read as defaults.
 *
 * @input The project's own `typescript`, the package directory, and the
 *   source files to read.
 * @output Compiler options, the declaration files to add, and the config's
 *   error, if any.
 * @position Foundation discovery, used by the documented-props comparison.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Whether a file the config includes declares types every file sees: a
 * declaration file, a file that declares globals or augments a module, or a
 * script (a `.ts` file that TypeScript reads as no module).
 * @param {any} ts
 * @param {string} file
 */
function isAmbient(ts, file) {
  if (/\.d\.[cm]?ts$/.test(file)) return true;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (/\bdeclare\s+(?:global|module)\b/.test(text)) return true;
  if (!/\.tsx?$/.test(file)) return false;
  // Without the words, no module; with them, TypeScript decides.
  return (
    !/\b(?:import|export)\b/.test(text) ||
    !ts.isExternalModule(
      ts.createSourceFile(file, text, ts.ScriptTarget.Latest),
    )
  );
}

/**
 * Read a config's `files` entries as `tsc` does, and report the first it
 * cannot find. TypeScript itself substitutes `${configDir}` (on a version
 * that has it), resolves each entry against the config that writes it, and
 * tries the TypeScript extensions for one written without its own, so this
 * cannot drift from `tsc`. The parsed file names then hold the files found.
 * A file the `include` matched that is gone by the time it is read was
 * another process's, and is not checked here.
 * @param {any} ts
 * @param {any} raw the config's JSON
 * @param {string} configPath
 * @param {any} config the parsed config, whose file names are updated
 * @returns {string | null} the message `tsc` gives for the first entry it
 *   cannot find (TS6053, or TS6231 for a folder)
 */
function readFilesEntries(ts, raw, configPath, config) {
  const literal = ts.parseJsonConfigFileContent(
    raw,
    {...ts.sys, readDirectory: () => []},
    path.dirname(configPath),
    undefined,
    configPath,
  ).fileNames;
  if (literal.length === 0 || typeof ts.createProgram !== 'function') {
    return null;
  }
  // Only the entries themselves: no library, no types, no imports.
  const program = ts.createProgram({
    rootNames: literal,
    options: {
      ...config.options,
      noLib: true,
      noResolve: true,
      types: [],
      noEmit: true,
    },
  });
  const missing = program
    .getOptionsDiagnostics()
    .find(/** @param {any} d */ d => d.code === 6053 || d.code === 6231);
  if (missing) {
    const text = missing.messageText;
    return typeof text === 'string' ? text : text.messageText;
  }
  const entries = new Set(
    literal.map(/** @param {string} f */ f => path.resolve(f)),
  );
  config.fileNames = [
    ...config.fileNames.filter(
      /** @param {string} f */ f => !entries.has(path.resolve(f)),
    ),
    ...program.getSourceFiles().map(/** @param {any} sf */ sf => sf.fileName),
  ];
  return null;
}

/**
 * @param {any} ts the project's own `typescript`
 * @param {string} packageDir
 * @param {string[]} sources the files to read
 * @returns {{options: any, declarations: string[], error?: string}}
 */
export function readPackageTsconfig(ts, packageDir, sources) {
  const defaults = {
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    allowJs: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    allowImportingTsExtensions: true,
  };
  /** @type {string | undefined} */
  let error;
  /** @type {(configPath: string) => any} */
  const parse = configPath => {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    const config = read.error
      ? {errors: [read.error], fileNames: [], options: {}}
      : ts.parseJsonConfigFileContent(
          read.config,
          ts.sys,
          path.dirname(configPath),
          undefined,
          configPath,
        );
    // "No inputs were found" is how a solution-style config reads.
    const problem = config.errors.find(
      /** @param {any} d */ d => d.code !== 18003,
    );
    const where = path.relative(packageDir, configPath);
    if (problem) {
      config.error = `${where}: ${ts.flattenDiagnosticMessageText(problem.messageText, ' ')}`;
    } else if (!read.error) {
      const missing = readFilesEntries(ts, read.config, configPath, config);
      if (missing) {
        // Paths read from the package, as the config's other errors are.
        const dir = path.dirname(configPath).split(path.sep).join('/');
        const rel = path.relative(packageDir, path.dirname(configPath));
        config.error = `${where}: ${missing
          .split(`${dir}/`)
          .join(rel ? `${rel.split(path.sep).join('/')}/` : '')}`;
      }
    }
    return config;
  };
  /** @type {any} */
  let parsed;
  try {
    const found = ts.findConfigFile(
      packageDir,
      ts.sys.fileExists,
      'tsconfig.json',
    );
    // A config above the package is an app's when the package is installed
    // below it (`node_modules`), and the package's own otherwise (a
    // monorepo's root config, as `tsc` reads it).
    const installed =
      found &&
      path
        .relative(path.dirname(found), packageDir)
        .split(path.sep)
        .includes('node_modules');
    parsed = found && !installed ? parse(found) : null;
    const own = new Set(sources.map(file => path.resolve(file)));
    /** @type {(config: any) => boolean} */
    const includes = config =>
      config.fileNames.some(
        /** @param {string} file */ file => own.has(path.resolve(file)),
      );
    // Every reference, at any depth, each config once (a cycle ends). One
    // that is missing or doesn't parse is the project's error when no config
    // includes the sources, as `tsc` reports it.
    const visited = new Set(found ? [path.resolve(found)] : []);
    /** @type {any} */
    let broken = null;
    /** @type {(config: any) => any} */
    const including = config => {
      if (includes(config)) return config;
      for (const ref of config.projectReferences ?? []) {
        const next = path.resolve(ts.resolveProjectReferencePath(ref));
        if (visited.has(next)) continue;
        visited.add(next);
        const referenced = parse(next);
        if (referenced.error) broken ??= referenced;
        const hit = including(referenced);
        if (hit) return hit;
      }
      return null;
    };
    if (parsed) parsed = including(parsed) ?? broken ?? parsed;
  } catch {
    parsed = null;
  }
  error = parsed?.error;
  const options = parsed ? {...parsed.options} : defaults;
  if (options.jsx == null) options.jsx = defaults.jsx;
  return {
    options: {
      ...options,
      noEmit: true,
      skipLibCheck: true,
      incremental: false,
      composite: false,
    },
    ...(error ? {error} : {}),
    declarations: (parsed?.fileNames ?? []).filter(
      /** @param {string} file */ file => isAmbient(ts, file),
    ),
  };
}
