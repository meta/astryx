// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Open a package's TypeScript project the way `tsc` reads it, so a
 * check that reads the package's types sees what the package compiles
 * against.
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
 * The program is TypeScript 7's: a virtual tsconfig beside the config that
 * extends it, lists the files to read (and the config's own `files`
 * entries, so a missing one is reported as `tsc` reports it), and turns off
 * emit.
 *
 * @input A TypeScript 7 session (./project-typescript.mjs), the package
 *   directory, and the source files to read.
 * @output The project, its compiler options, the declaration files added,
 *   and the config's error, if any.
 * @position Foundation discovery, used by the documented-props comparison.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {recordContentRead} from '../fs/read-record.mjs';
import {flattenDiagnostic} from './project-typescript.mjs';

/** Options for a package without a config, as bundlers read TSX. */
const DEFAULTS = {
  jsx: 'react-jsx',
  target: 'es2022',
  module: 'esnext',
  moduleResolution: 'bundler',
  strict: true,
  allowJs: true,
  resolveJsonModule: true,
  allowImportingTsExtensions: true,
};

/** What every program here sets on top of the package's options. */
const CHECK_ONLY = {
  noEmit: true,
  skipLibCheck: true,
  incremental: false,
  composite: false,
};

/**
 * A tsconfig's JSON, comments and trailing commas allowed, or null when it
 * is not JSON.
 * @param {string} text
 * @returns {any}
 */
function readJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      out += ' ';
    } else {
      out += c;
    }
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}

/**
 * Whether a file the config includes may declare types every file sees: a
 * declaration file, a file that declares globals or augments a module, or a
 * TypeScript file without the words a module needs (a script). `maybe`: a
 * TypeScript file with them, which only its syntax tree decides.
 * @param {string} file
 * @returns {'yes' | 'no' | 'maybe'}
 */
function ambientCandidate(file) {
  if (/\.d\.[cm]?ts$/.test(file)) return 'yes';
  recordContentRead(file);
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return 'no';
  }
  if (/\bdeclare\s+(?:global|module)\b/.test(text)) return 'yes';
  if (!/\.tsx?$/.test(file)) return 'no';
  return /\b(?:import|export)\b/.test(text) ? 'maybe' : 'yes';
}

/**
 * The `files` a config reads, through its `extends` chain (the nearest that
 * writes them), each as an entry relative to `dir`, the folder of the
 * config that uses them. `${configDir}` stays for TypeScript to substitute.
 * @param {string} configPath
 * @param {string} dir
 * @returns {string[]}
 */
function filesEntries(configPath, dir) {
  const seen = new Set();
  for (let at = configPath; at && !seen.has(at); ) {
    seen.add(at);
    let raw;
    try {
      raw = readJsonc(fs.readFileSync(at, 'utf8'));
    } catch {
      return [];
    }
    if (!raw || typeof raw !== 'object') return [];
    if (Array.isArray(raw.files)) {
      return raw.files
        .filter(/** @param {unknown} f */ f => typeof f === 'string')
        .map(
          /** @param {string} f */ f =>
            f.startsWith('${configDir}')
              ? f
              : path
                  .relative(dir, path.resolve(path.dirname(at), f))
                  .split(path.sep)
                  .join('/') || '.',
        );
    }
    const base = typeof raw.extends === 'string' ? raw.extends : null;
    if (!base || !/^\.{1,2}[\\/]/.test(base)) return [];
    at = path.resolve(path.dirname(at), base);
    if (!/\.json$/.test(at)) at += '.json';
  }
  return [];
}

/**
 * The nearest `tsconfig.json` from a folder up, or null.
 * @param {string} dir
 */
function findConfig(dir) {
  for (let at = path.resolve(dir); ; ) {
    const file = path.join(at, 'tsconfig.json');
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(at);
    if (parent === at) return null;
    at = parent;
  }
}

/**
 * Open the package's project with the files to read.
 * @param {ReturnType<typeof import('./project-typescript.mjs').openTypeScript>} session
 * @param {string} packageDir
 * @param {string[]} sources the files to read
 * @param {Record<string, unknown>} [extra] compiler options to add (tsconfig
 *   JSON form)
 * @returns {{project: any, options: any, declarations: string[], configPath: string | null, error?: string}}
 *   `project` is null when a referenced config's error stops the read
 */
export function openPackageProject(session, packageDir, sources, extra = {}) {
  const where = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');
  /** @type {Map<string, {fileNames: string[], options: any, references: string[], unreadable: boolean}>} */
  const parsed = new Map();
  /** @type {(configPath: string) => {fileNames: string[], options: any, references: string[], unreadable: boolean}} */
  const parse = configPath => {
    const known = parsed.get(configPath);
    if (known) return known;
    let text = null;
    try {
      text = fs.readFileSync(configPath, 'utf8');
    } catch {
      // Reported as unreadable.
    }
    const raw = text == null ? null : readJsonc(text);
    let result = {fileNames: [], options: {}, references: [], unreadable: text == null};
    if (text != null) {
      try {
        const config = session.parseConfigFile(configPath);
        result = {
          fileNames: config?.fileNames ?? [],
          options: config?.options ?? {},
          references: [],
          unreadable: false,
        };
      } catch {
        // Its error comes from the program.
      }
      for (const ref of Array.isArray(raw?.references) ? raw.references : []) {
        if (typeof ref?.path !== 'string') continue;
        let next = path.resolve(path.dirname(configPath), ref.path);
        if (!/\.json$/.test(next)) next = path.join(next, 'tsconfig.json');
        result.references.push(next);
      }
    }
    parsed.set(configPath, result);
    return result;
  };

  const found = findConfig(packageDir);
  // A config above the package is an app's when the package is installed
  // below it (`node_modules`), and the package's own otherwise (a
  // monorepo's root config, as `tsc` reads it).
  const installed =
    found &&
    path
      .relative(path.dirname(found), packageDir)
      .split(path.sep)
      .includes('node_modules');
  let chosen = found && !installed ? found : null;
  const own = new Set(sources.map(file => path.resolve(file)));
  /** @type {(configPath: string) => boolean} */
  const includes = configPath =>
    parse(configPath).fileNames.some(file => own.has(path.resolve(file)));
  /** @type {string[]} references visited, in order */
  const visitedRefs = [];
  if (chosen) {
    // Every reference, at any depth, each config once (a cycle ends).
    const visited = new Set([path.resolve(chosen)]);
    /** @type {(configPath: string) => string | null} */
    const including = configPath => {
      if (includes(configPath)) return configPath;
      for (const next of parse(configPath).references) {
        if (visited.has(next)) continue;
        visited.add(next);
        visitedRefs.push(next);
        const hit = including(next);
        if (hit) return hit;
      }
      return null;
    };
    const hit = including(chosen);
    if (hit) {
      chosen = hit;
    } else {
      // A reference that is missing or doesn't parse is the project's
      // error when no config includes the sources, as `tsc` reports it.
      for (const ref of visitedRefs) {
        const problem = configProblem(session, ref, parse(ref).unreadable);
        if (problem) {
          return {
            project: null,
            options: {},
            declarations: [],
            configPath: null,
            error: `${where(ref)}: ${problem}`,
          };
        }
      }
    }
  }
  return openWith(session, packageDir, sources, chosen, undefined, parse, extra);
}

/**
 * The first error reading a config, or null.
 * @param {any} session
 * @param {string} configPath
 * @param {boolean} unreadable
 */
function configProblem(session, configPath, unreadable) {
  if (unreadable) return `Cannot read file '${configPath}'.`;
  const project = session.project(
    path.dirname(configPath),
    [],
    {noLib: true, noResolve: true, types: []},
    [],
    {extends: configPath, include: []},
  );
  const problem = project.program
    .getConfigFileParsingDiagnostics()
    .find((/** @type {any} */ d) => ![18002, 18003].includes(d.code));
  return problem ? flattenDiagnostic(problem, ' ') : null;
}

/**
 * @param {any} session
 * @param {string} packageDir
 * @param {string[]} sources
 * @param {string | null} configPath
 * @param {string} [error] an error already found
 * @param {(configPath: string) => {fileNames: string[], options: any}} [parse]
 * @param {Record<string, unknown>} [extra]
 */
function openWith(
  session,
  packageDir,
  sources,
  configPath,
  error,
  parse,
  extra = {},
) {
  const where = (/** @type {string} */ file) =>
    path.relative(packageDir, file).split(path.sep).join('/');
  const config = configPath && parse ? parse(configPath) : null;
  // A `files` entry written without its extension names the file `tsc`
  // finds with one.
  const candidates = (config?.fileNames ?? []).map(name => {
    const file = fs.existsSync(name)
      ? name
      : (['.ts', '.tsx', '.d.ts', '.cts', '.d.cts', '.mts', '.d.mts']
          .map(ext => name + ext)
          .find(withExt => fs.existsSync(withExt)) ?? name);
    return {file, ambient: ambientCandidate(file)};
  });
  const dir = configPath ? path.dirname(configPath) : path.resolve(packageDir);
  const entries = configPath ? filesEntries(configPath, dir) : [];
  const rootNames = [
    ...new Set([
      ...entries,
      ...sources.map(file => path.resolve(file)),
      ...candidates.filter(c => c.ambient !== 'no').map(c => c.file),
    ]),
  ];
  const compilerOptions =
    configPath && !error
      ? {
          ...CHECK_ONLY,
          ...(config?.options?.jsx == null ? {jsx: DEFAULTS.jsx} : {}),
          ...extra,
        }
      : {...DEFAULTS, ...CHECK_ONLY, ...extra};
  const project = session.project(
    dir,
    rootNames,
    compilerOptions,
    [],
    configPath && !error ? {extends: configPath, include: []} : {include: []},
  );
  if (configPath && !error) {
    const problem = project.program
      .getConfigFileParsingDiagnostics()
      .find((/** @type {any} */ d) => ![18002, 18003].includes(d.code));
    if (problem) {
      error = `${where(configPath)}: ${flattenDiagnostic(problem, ' ')}`;
    } else {
      // A `files` entry `tsc` can't find (TS6053, or TS6231 for a folder),
      // with its path read from the package, as the config's other errors
      // are.
      const missing = project.program
        .getProgramDiagnostics()
        .find((/** @type {any} */ d) => d.code === 6053 || d.code === 6231);
      if (missing) {
        const abs = dir.split(path.sep).join('/');
        const rel = path.relative(packageDir, dir);
        error = `${where(configPath)}: ${missing.text
          .split(`${abs}/`)
          .join(rel ? `${rel.split(path.sep).join('/')}/` : '')}`;
      }
    }
  }
  const declarations = candidates
    .filter(
      c =>
        c.ambient === 'yes' ||
        (c.ambient === 'maybe' &&
          isScript(project.program.getSourceFile(c.file))),
    )
    .map(c => c.file);
  return {
    project,
    options: project.compilerOptions,
    declarations,
    configPath: configPath && !error ? configPath : null,
    ...(error ? {error} : {}),
  };
}

/**
 * Whether TypeScript reads a source file as no module (a script).
 * @param {any} sf
 */
function isScript(sf) {
  return (
    !!sf &&
    (sf.externalModuleIndicator === undefined ||
      sf.externalModuleIndicator === null)
  );
}
