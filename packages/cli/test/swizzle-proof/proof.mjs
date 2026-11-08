// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file proof.mjs
 * @input The repository's workspace packages and a change (changed paths)
 * @output The swizzle proof (spec:AST-110 FR7): for each target it ejects
 *   the copy into a clean project, checks its imports and files,
 *   type-checks it, bundles it with the StyleX compiler, and renders it once
 *   on the server, and on request in Chromium. It also decides which targets
 *   a change affects.
 * @position Shared by the swizzle proof tests; no Vitest import
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  moduleExportOrigins,
  resolveLocalModule,
} from '../../foundation/discovery/module-exports.mjs';
import {sourceExportTarget} from '../../foundation/discovery/package-exports.mjs';

export const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
const requireFromRepo = createRequire(path.join(REPO, 'package.json'));

/** The workspace packages swizzle copies components from. */
export const COMPONENT_PACKAGES = ['core', 'lab', 'charts', 'richtext', 'vega'];

/**
 * A change to one of these paths can change every copy, so it proves every
 * target: the StyleX build, the proof itself, and a component package's
 * manifest (its exports route the copy's imports). The swizzle copy and the
 * CLI modules it reads count too ({@link swizzleModules}).
 */
const TOOLCHAIN = [
  /^packages\/build\/src\//,
  /^packages\/cli\/test\/swizzle-proof\//,
  /^packages\/(?:core|lab|charts|richtext|vega)\/package\.json$/,
];
/** A dependency whose change can change every copy's build. */
const TOOLCHAIN_DEPENDENCY =
  /(?:^|[\s'"/])(?:vite|@vitejs\/plugin-react|@stylexjs\/[\w-]+|typescript|react|react-dom|@babel\/[\w-]+|@types\/react(?:-dom)?)(?:@|['"]\s*:)/;

/**
 * The CLI modules `astryx swizzle` runs: the swizzle API and every module it
 * imports, by relative path, repository-relative.
 */
function swizzleModules() {
  const start = path.join(REPO, 'packages/cli/api/swizzle');
  const queue = fs
    .readdirSync(start, {recursive: true})
    .map(String)
    .filter(f => /\.mjs$/.test(f) && !/\.test\.mjs$/.test(f))
    .map(f => path.join(start, f));
  const seen = new Set();
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const code = fs.readFileSync(file, 'utf8');
    for (const [, spec] of code.matchAll(
      /(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g,
    )) {
      queue.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map(f => path.relative(REPO, f)));
}

/**
 * The first changed path that can change every copy, or undefined. The
 * lockfile and the root manifest count only when a changed line names a
 * build dependency.
 * @param {string[]} changed
 * @param {string} base
 */
export function toolchainChange(changed, base) {
  const swizzle = swizzleModules();
  return changed.find(file => {
    if (swizzle.has(file) || TOOLCHAIN.some(re => re.test(file))) return true;
    if (file !== 'pnpm-lock.yaml' && file !== 'package.json') return false;
    try {
      const head = process.env.SWIZZLE_PROOF_HEAD;
      const diff = execFileSync(
        'git',
        ['diff', '-U0', base, ...(head ? [head] : []), '--', file],
        {cwd: REPO, encoding: 'utf8', maxBuffer: 256e6},
      );
      return diff
        .split('\n')
        .some(
          line => /^[-+][^-+]/.test(line) && TOOLCHAIN_DEPENDENCY.test(line),
        );
    } catch {
      // A diff git cannot read proves every target.
      return true;
    }
  });
}

const SOURCE_FILE = /\.(?:ts|tsx|mts|js|mjs|jsx)$/;
const NOT_SHIPPED =
  /\.(?:test|spec|stories|story|doc|bench)\.[cm]?[jt]sx?$|(?:^|\/)__(?:tests|fixtures|mocks)__\//;

/** Every workspace package by name, with its folder and manifest. */
export function workspacePackages() {
  /** @type {Map<string, {dir: string, manifest: any}>} */
  const found = new Map();
  for (const parent of ['packages', 'packages/themes']) {
    const root = path.join(REPO, parent);
    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
      const file = path.join(root, entry.name, 'package.json');
      if (!entry.isDirectory() || !fs.existsSync(file)) continue;
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (manifest.name) {
        found.set(manifest.name, {dir: path.dirname(file), manifest});
      }
    }
  }
  return found;
}

/**
 * The paths a change touches, relative to the repository, or null when git
 * cannot tell. On a pull request's merge commit the base is its first
 * parent. A pull request run checks out that parent, so null there means
 * git failed, and the slice proves every target.
 * @param {string} [base]
 * @returns {string[]|null}
 */
export function changedPaths(
  base = process.env.SWIZZLE_PROOF_BASE ?? 'HEAD^1',
) {
  // A replayed change names its paths directly.
  if (process.env.SWIZZLE_PROOF_CHANGED) {
    return process.env.SWIZZLE_PROOF_CHANGED.split(',').filter(Boolean);
  }
  try {
    const head = process.env.SWIZZLE_PROOF_HEAD;
    const out = execFileSync(
      'git',
      ['diff', '--name-only', base, ...(head ? [head] : [])],
      {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * A clean product project: every workspace package and every npm package a
 * component package declares are installed, as a product that follows the
 * receipt's install line would have them.
 * @param {string} dir
 */
export function createProject(dir) {
  fs.rmSync(dir, {recursive: true, force: true});
  const modules = path.join(dir, 'node_modules');
  fs.mkdirSync(modules, {recursive: true});
  const link = (name, target) => {
    const at = path.join(modules, name);
    if (fs.existsSync(at) || !fs.existsSync(target)) return;
    fs.mkdirSync(path.dirname(at), {recursive: true});
    fs.symlinkSync(fs.realpathSync(target), at, 'junction');
  };
  const packages = workspacePackages();
  for (const [name, {dir: packageDir}] of packages) link(name, packageDir);
  for (const short of COMPONENT_PACKAGES) {
    const {dir: packageDir, manifest} = packages.get(`@astryxdesign/${short}`);
    const names = Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    });
    for (const name of names) {
      if (name.startsWith('@astryxdesign/')) continue;
      link(name, path.join(packageDir, 'node_modules', name));
      link(name, path.join(REPO, 'node_modules', name));
      // A package without its own types needs its DefinitelyTyped package.
      const types = `@types/${name.replace(/^@([^/]+)\//, '$1__')}`;
      link(types, path.join(packageDir, 'node_modules', types));
      link(types, path.join(REPO, 'node_modules', types));
    }
  }
  for (const name of [
    'react',
    'react-dom',
    '@types/react',
    '@types/react-dom',
    '@stylexjs/stylex',
  ]) {
    link(name, path.join(REPO, 'node_modules', name));
  }
  // The product depends on every component package, so the CLI finds the
  // integration packages to list and copy from.
  const dependencies = Object.fromEntries(
    [...packages].map(([name, {manifest}]) => [name, manifest.version]),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'swizzle-proof',
      private: true,
      type: 'module',
      dependencies,
    }),
  );
}

/** Imports the CLI's API modules from the repository's own source. */
async function cliApi() {
  const api = path.join(REPO, 'packages/cli/api');
  const {swizzle} = await import(
    pathToFileURL(path.join(api, 'swizzle/swizzle.mjs')).href
  );
  const {component} = await import(
    pathToFileURL(path.join(api, 'component/component.mjs')).href
  );
  return {swizzle, component};
}

/**
 * Every target swizzle can copy: Core's components as `swizzle --list` offers
 * them, and each integration package's components (copied with `--package`).
 * @param {string} project
 * @returns {Promise<Array<{name: string, pkg: string, key: string}>>}
 */
export async function listTargets(project) {
  const {swizzle, component} = await cliApi();
  /** @type {Array<{name: string, pkg: string}>} */
  const list = (await swizzle(undefined, {cwd: project, list: true})).data.map(
    name => ({name, pkg: '@astryxdesign/core'}),
  );
  const groups = (await component(undefined, {cwd: project, list: true})).data
    .components;
  for (const entries of Object.values(groups)) {
    for (const entry of entries) {
      if (entry.package && entry.package !== '@astryxdesign/core') {
        list.push({name: entry.name, pkg: entry.package});
      }
    }
  }
  return list.map(t => ({...t, key: keyOf(t)}));
}

/** @param {{name: string, pkg: string}} t */
export function keyOf(t) {
  return `${t.pkg.replace('@astryxdesign/', '')}__${t.name}`;
}

/**
 * Ejects each target into the project; records each copy's folder and files.
 * @param {Array<{name: string, pkg: string, key: string}>} targets
 * @param {string} project
 * @param {Map<string, {dir: string, outBase: string, files: string[]}>} copies
 * @param {(key: string, step: string, error: unknown) => void} fail
 */
async function eject(targets, project, copies, fail) {
  const {swizzle} = await cliApi();
  for (const t of targets) {
    const out = path.join(
      'components',
      t.pkg.replace('@astryxdesign/', ''),
      t.name,
    );
    try {
      const res = await swizzle(t.name, {
        cwd: project,
        output: out,
        overwrite: true,
        ...(t.pkg === '@astryxdesign/core' ? {} : {package: t.pkg}),
      });
      const dir = path.join(project, out, res.data.component);
      copies.set(t.key, {
        dir,
        outBase: path.join(project, out),
        files: res.data.files.map(f => path.resolve(dir, f)),
      });
    } catch (error) {
      fail(t.key, 'eject', error.message ?? error);
    }
  }
}

/**
 * The source folder a copy's component files come from: the one folder in
 * the package's source that holds every one of them, or null.
 * @param {{name: string}} t
 * @param {{dir: string, files: string[]}} copy
 * @param {string} src
 */
function componentSourceDir(t, copy, src) {
  const own = copy.files
    .filter(f => f.startsWith(copy.dir + path.sep))
    .map(f => path.relative(copy.dir, f));
  if (own.length === 0) return null;
  const all = fs.readdirSync(src, {recursive: true}).map(String);
  const candidates = all
    .filter(f => f === own[0] || f.endsWith(path.sep + own[0]))
    .map(f => path.join(src, f.slice(0, f.length - own[0].length)));
  const matches = candidates.filter(dir =>
    own.every(r => fs.existsSync(path.join(dir, r))),
  );
  return matches.length === 1 ? path.resolve(matches[0]) : null;
}

/**
 * A module and every module it imports by relative path, transitively: what
 * the copy's bundle runs when it imports one of the module's names.
 * @param {string} file
 * @param {Map<string, Set<string>>} closures cache, by module
 */
function localClosure(file, closures) {
  const cached = closures.get(file);
  if (cached) return cached;
  /** @type {Set<string>} */
  const seen = new Set();
  const queue = [file];
  while (queue.length > 0) {
    const next = queue.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    let code;
    try {
      code = fs.readFileSync(next, 'utf8');
    } catch {
      continue;
    }
    for (const [, spec] of code.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g,
    )) {
      const resolved = resolveLocalModule(spec, next);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  closures.set(file, seen);
  return seen;
}

/**
 * The source files a copy depends on: each module it carries, the entry
 * module of each package export it imports from, and the module that
 * defines each public name it imports with every module that one imports. Null when the copy's component folder
 * matches no single source folder.
 * @param {{name: string, pkg: string}} t
 * @param {{outBase: string, files: string[]}} copy
 * @param {Map<string, {dir: string, manifest: any}>} packages
 * @param {Map<string, Map<string, {file: string}>>} memo
 */
export function sourcesOf(t, copy, packages, memo, closures = new Map()) {
  const srcOf = name => path.join(packages.get(name).dir, 'src');
  const own = t.pkg.replace('@astryxdesign/', '');
  const componentSource = componentSourceDir(t, copy, srcOf(t.pkg));
  // A copy whose component folder cannot be matched to one source folder
  // depends on everything (fail closed).
  if (componentSource == null) return null;
  /** @type {Set<string>} */
  const sources = new Set();
  const named =
    /import\s+(?:type\s+)?(\{[^}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(\{[^}]*\}))?\s*from\s*['"](@astryxdesign\/[^'"]+)['"]/g;
  for (const file of copy.files) {
    // Swizzle writes the component's own files under its output folder,
    // whatever folder they come from; helpers keep their path in the
    // package's source, and a module from another package sits under a
    // folder named after that package.
    if (file.startsWith(copy.dir + path.sep)) {
      sources.add(path.join(componentSource, path.relative(copy.dir, file)));
    } else {
      const rel = path.relative(copy.outBase, file);
      const [first, ...rest] = rel.split(path.sep);
      const other = COMPONENT_PACKAGES.includes(first) && first !== own;
      sources.add(
        other
          ? path.join(srcOf(`@astryxdesign/${first}`), ...rest)
          : path.join(srcOf(t.pkg), rel),
      );
    }
    if (!/\.tsx?$/.test(file)) continue;
    for (const [, head, tail, spec] of fs
      .readFileSync(file, 'utf8')
      .matchAll(named)) {
      const [, name, ...sub] = spec.split('/');
      const owner = packages.get(`@astryxdesign/${name}`);
      if (!owner) continue;
      const target = sourceExportTarget(
        owner.manifest,
        owner.dir,
        sub.length ? `./${sub.join('/')}` : '.',
      );
      if (!target) continue;
      // The export's entry module routes the import as the manifest does.
      sources.add(target);
      const list = [head, tail].filter(x => x && x.startsWith('{'));
      if (list.length === 0) continue;
      if (!memo.has(target)) {
        let origins;
        try {
          origins = moduleExportOrigins(target, {types: true});
        } catch {
          origins = new Map();
        }
        memo.set(target, origins);
      }
      for (const entry of list.join(',').replace(/[{}]/g, '').split(',')) {
        const imported = entry
          .trim()
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0];
        if (!imported) continue;
        const origin = memo.get(target).get(imported)?.file ?? target;
        for (const file of localClosure(origin, closures)) sources.add(file);
      }
    }
  }
  return sources;
}

/**
 * Which targets a run proves: none, the affected ones, or all. When git
 * cannot read the change, a checkout without a parent commit proves none
 * (there is no base to diff), and any other run proves every target (fail
 * closed).
 * @param {{changed: string[]|null, toolchain: string|undefined, relevant: string[], hasParent: boolean, all?: boolean}} change
 * @returns {{mode: 'none'|'affected'|'all', reason: string}}
 */
export function proofScope({
  changed,
  toolchain,
  relevant,
  hasParent,
  all = false,
}) {
  if (all) return {mode: 'all', reason: 'every target was asked for'};
  if (changed == null) {
    if (!hasParent) {
      return {
        mode: 'none',
        reason:
          'the checkout has no parent commit to diff against, so no target runs',
      };
    }
    return {
      mode: 'all',
      reason: 'the change could not be read, so every target runs',
    };
  }
  if (toolchain)
    return {mode: 'all', reason: `${toolchain} can change every copy`};
  if (relevant.length === 0) {
    return {
      mode: 'none',
      reason: 'no component source or toolchain path changed',
    };
  }
  return {mode: 'affected', reason: ''};
}

/** Whether the checkout holds the parent of its commit. */
function hasParentCommit() {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD^1'], {
      cwd: REPO,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs one slice of the proof: the targets at `index` of every `count`, in
 * the scope {@link proofScope} chooses. In the affected scope the slice
 * proves the targets whose copy depends on a changed source file.
 * @param {{index: number, count: number, notRendered: Record<string, string>, project: string, all?: boolean, browser?: boolean}} options
 */
export async function runSlice({
  index,
  count,
  notRendered,
  project,
  all = false,
  browser = false,
}) {
  const start = Date.now();
  const base = process.env.SWIZZLE_PROOF_BASE ?? 'HEAD^1';
  const changed = all ? null : changedPaths(base);
  const toolchain = changed && toolchainChange(changed, base);
  const relevant = (changed ?? []).filter(
    file =>
      COMPONENT_PACKAGES.some(short =>
        file.startsWith(`packages/${short}/src/`),
      ) && !NOT_SHIPPED.test(file),
  );
  const scope = proofScope({
    changed,
    toolchain,
    relevant,
    hasParent: hasParentCommit(),
    all,
  });
  if (scope.mode === 'none') {
    return {
      offered: null,
      affected: 0,
      reason: scope.reason,
      results: [],
      timings: {},
      totalMs: Date.now() - start,
    };
  }
  createProject(project);
  const timings = {};
  const listStart = Date.now();
  const slice = (await listTargets(project)).filter(
    (_, i) => i % count === index,
  );
  timings.list = Date.now() - listStart;
  /** @type {Map<string, any>} */
  const ejected = new Map();
  const failures = new Map();
  const ejectStart = Date.now();
  await eject(slice, project, ejected, (key, step, error) => {
    if (!failures.has(key))
      failures.set(key, {step, error: String(error).slice(0, 400)});
  });
  timings.eject = Date.now() - ejectStart;
  let affected = slice;
  let reason = scope.mode === 'all' ? scope.reason : '';
  if (!reason) {
    const packages = workspacePackages();
    const memo = new Map();
    const closures = new Map();
    const changedFiles = new Set(relevant.map(file => path.join(REPO, file)));
    const affectStart = Date.now();
    affected = slice.filter(t => {
      // A target that did not eject is proven, so its failure shows.
      if (!ejected.has(t.key)) return true;
      const sources = sourcesOf(
        t,
        ejected.get(t.key),
        packages,
        memo,
        closures,
      );
      if (sources == null) return true;
      for (const file of sources) {
        // A source that does not exist means the mapping is wrong: prove it.
        if (changedFiles.has(file) || !fs.existsSync(file)) return true;
      }
      return false;
    });
    timings.affected = Date.now() - affectStart;
    reason = `${relevant.length} changed source file(s); ${affected.length} of ${slice.length} target(s) in this slice depend on them`;
  }
  const ejectedAffected = affected.filter(t => ejected.has(t.key));
  const proof = ejectedAffected.length
    ? await prove(ejectedAffected, {
        project,
        notRendered,
        ejected,
        browser,
      })
    : {results: [], timings: {}};
  for (const t of affected) {
    if (!ejected.has(t.key))
      proof.results.push({key: t.key, failure: failures.get(t.key)});
  }
  return {
    offered: slice.length,
    affected: affected.length,
    reason,
    results: proof.results,
    timings: {...timings, ...proof.timings},
    totalMs: Date.now() - start,
  };
}

/**
 * Proves each target. Each step's failure is recorded on the target, and a
 * target that fails a step skips the later ones.
 * @param {Array<{name: string, pkg: string, key: string}>} targets
 * @param {{project: string, samplesFile?: string, notRendered?: Record<string, string>, ejected?: Map<string, any>, browser?: boolean}} options
 *   `samplesFile` is the module whose `samples` render the targets; by
 *   default the proof's own samples.mjs.
 */
export async function prove(
  targets,
  {
    project,
    samplesFile = path.join(
      REPO,
      'packages/cli/test/swizzle-proof/samples.mjs',
    ),
    notRendered = {},
    ejected,
    browser = false,
  },
) {
  const timings = {};
  const time = async (step, run) => {
    const start = Date.now();
    await run();
    timings[step] = Date.now() - start;
  };
  /** @type {Map<string, {key: string, failure?: {step: string, error: string}}>} */
  const results = new Map(targets.map(t => [t.key, {key: t.key}]));
  const fail = (key, step, error) => {
    const result = results.get(key);
    if (!result.failure)
      result.failure = {step, error: String(error).slice(0, 400)};
  };
  const alive = () => targets.filter(t => !results.get(t.key).failure);
  const renderable = () => alive().filter(t => !notRendered[t.key]);

  /** @type {Map<string, {dir: string, files: string[]}>} */
  const copies = ejected ?? new Map();
  if (!ejected)
    await time('eject', () => eject(targets, project, copies, fail));

  await time('imports', async () => {
    const internal = /['"](@astryxdesign\/([^/'"]+)\/internal\/[^'"]+)['"]/g;
    for (const t of alive()) {
      for (const file of copies.get(t.key).files) {
        const rel = path.relative(project, file);
        if (NOT_SHIPPED.test(rel)) {
          fail(t.key, 'files', `${rel} is not shipped code`);
          continue;
        }
        if (!SOURCE_FILE.test(file)) continue;
        for (const [, spec, pkg] of fs
          .readFileSync(file, 'utf8')
          .matchAll(internal)) {
          // A StyleX module another package exports under ./internal/ keeps
          // its import (spec:AST-110 FR1).
          if (`@astryxdesign/${pkg}` === t.pkg || !spec.endsWith('.stylex')) {
            fail(t.key, 'imports', `${rel} imports ${spec}`);
          }
        }
      }
    }
  });

  await time('typecheck', async () => {
    const ts = requireFromRepo('typescript');
    const files = alive().flatMap(t =>
      copies.get(t.key).files.filter(f => /\.tsx?$/.test(f)),
    );
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      customConditions: ['source'],
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
      lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
      resolveJsonModule: true,
      isolatedModules: true,
    });
    const owner = new Map();
    for (const t of alive()) {
      for (const f of copies.get(t.key).files)
        owner.set(path.resolve(f), t.key);
    }
    for (const d of ts.getPreEmitDiagnostics(program)) {
      const file = d.file && path.resolve(d.file.fileName);
      const key = file && owner.get(file);
      if (key) {
        fail(
          key,
          'typecheck',
          `${path.relative(project, file)}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
        );
      }
    }
  });

  await time('entries', async () => {
    const entries = path.join(project, 'entries');
    fs.rmSync(entries, {recursive: true, force: true});
    fs.mkdirSync(entries, {recursive: true});
    const samplesEntry = path.join(entries, 'samples.mjs');
    fs.writeFileSync(
      samplesEntry,
      `export {samples} from ${JSON.stringify(pathToFileURL(samplesFile).href)};\n`,
    );
    const packages = workspacePackages();
    for (const t of alive()) {
      if (notRendered[t.key]) continue;
      const defaults = await playgroundDefaults(packages, t);
      const entry = entryFileOf(copies.get(t.key).dir, t.name);
      if (!entry) {
        fail(t.key, 'render', 'the copy has no entry module');
        continue;
      }
      fs.writeFileSync(
        path.join(entries, `${t.key}.tsx`),
        [
          `import * as React from 'react';`,
          `import {renderToString} from 'react-dom/server';`,
          `import * as Core from '@astryxdesign/core';`,
          `import * as Pkg from '${t.pkg}';`,
          `import * as Copy from ${JSON.stringify(
            path
              .relative(entries, entry)
              .replace(/\.tsx?$/, '')
              .replace(/^(?!\.)/, './'),
          )};`,
          `import {samples} from './samples.mjs';`,
          `const C = Copy[${JSON.stringify(t.name)}];`,
          `const defaults = ${JSON.stringify(defaults)};`,
          // Playground defaults name elements as {__element, props, children}.
          `function revive(v) {`,
          `  if (Array.isArray(v)) return v.map(revive);`,
          `  if (v && typeof v === 'object') {`,
          `    if (v.__element) {`,
          `      const kids = v.children == null ? [] : [].concat(v.children).map(revive);`,
          `      return React.createElement(Copy[v.__element] ?? Pkg[v.__element] ?? Core[v.__element] ?? v.__element, revive(v.props ?? {}), ...kids);`,
          `    }`,
          `    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));`,
          `  }`,
          `  return v;`,
          `}`,
          `export function element() {`,
          `  const make = samples[${JSON.stringify(t.key)}];`,
          `  if (!make && C == null) throw new Error('the copy exports no ${t.name}');`,
          `  return make ? make({C, mod: Copy, React, Core, Pkg}) : React.createElement(C, revive(defaults));`,
          `}`,
          `export function render() {`,
          `  return renderToString(element());`,
          `}`,
          '',
        ].join('\n'),
      );
      if (browser) {
        // A page that renders the copy in the browser and records each error.
        fs.writeFileSync(
          path.join(entries, `${t.key}.page.tsx`),
          [
            `import {createRoot} from 'react-dom/client';`,
            `import {element} from './${t.key}';`,
            `const errors = (window.__swizzleErrors = []);`,
            `window.addEventListener('error', event => errors.push(String(event.message)));`,
            `try {`,
            `  createRoot(document.getElementById('root')).render(element());`,
            `} catch (error) {`,
            `  errors.push(String(error));`,
            `}`,
            '',
          ].join('\n'),
        );
        fs.writeFileSync(
          path.join(entries, `${t.key}.html`),
          `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./${t.key}.page.tsx"></script></body></html>`,
        );
      }
    }
  });

  const vite = await import(
    pathToFileURL(requireFromRepo.resolve('vite')).href
  );
  const {default: react} = await import(
    pathToFileURL(requireFromRepo.resolve('@vitejs/plugin-react')).href
  );
  const stylexBabel = path.join(REPO, 'packages/build/src/babel.js');
  const plugins = () => [
    react({
      babel: {
        plugins: [
          [
            stylexBabel,
            {
              dev: false,
              runtimeInjection: false,
              treeshakeCompensation: true,
              enableInlinedConditionalMerge: true,
              unstable_moduleResolution: {type: 'commonJS', rootDir: project},
            },
          ],
        ],
      },
    }),
  ];
  const resolve = {
    conditions: ['source', 'module', 'browser', 'default'],
    preserveSymlinks: false,
  };
  /** Builds the targets' entries together, splitting a failing batch until each failure is one target's. */
  const batch = async (step, keys, build) => {
    const run = async list => {
      try {
        await build(list);
        return true;
      } catch (error) {
        if (list.length === 1) {
          fail(
            list[0],
            step,
            String(error.message ?? error)
              .split('\n')
              .slice(0, 3)
              .join(' '),
          );
          return false;
        }
        const mid = Math.ceil(list.length / 2);
        await run(list.slice(0, mid));
        await run(list.slice(mid));
        return false;
      }
    };
    if (keys.length) await run(keys);
  };
  const entryOf = key => path.join(project, 'entries', `${key}.tsx`);

  await time('bundle', () =>
    batch(
      'bundle',
      renderable().map(t => t.key),
      list =>
        vite.build({
          root: project,
          configFile: false,
          logLevel: 'silent',
          plugins: plugins(),
          resolve,
          define: {'process.env.NODE_ENV': '"production"'},
          build: {
            outDir: path.join(project, 'dist-client'),
            emptyOutDir: true,
            minify: false,
            reportCompressedSize: false,
            write: false,
            rollupOptions: {
              input: Object.fromEntries(list.map(k => [k, entryOf(k)])),
              preserveEntrySignatures: 'exports-only',
              external: ['react-dom/server'],
            },
          },
        }),
    ),
  );

  await time('render', async () => {
    const out = path.join(project, 'dist-ssr');
    const keys = renderable().map(t => t.key);
    await batch('render', keys, list =>
      vite.build({
        root: project,
        configFile: false,
        logLevel: 'silent',
        plugins: plugins(),
        resolve,
        ssr: {
          noExternal: true,
          resolve: {
            conditions: ['source', 'module', 'node', 'default'],
            externalConditions: ['source'],
          },
        },
        build: {
          ssr: true,
          outDir: out,
          emptyOutDir: false,
          minify: false,
          reportCompressedSize: false,
          rollupOptions: {
            input: Object.fromEntries(list.map(k => [k, entryOf(k)])),
            output: {format: 'esm', entryFileNames: '[name].mjs'},
            external: ['react', 'react-dom', 'react-dom/server', /^react\//],
          },
        },
      }),
    );
    for (const t of renderable()) {
      try {
        const m = await import(
          pathToFileURL(path.join(out, `${t.key}.mjs`)).href
        );
        const html = m.render();
        if (typeof html !== 'string')
          throw new Error('render returned no HTML');
      } catch (error) {
        fail(t.key, 'render', String(error.message ?? error).split('\n')[0]);
      }
    }
  });

  if (browser) await time('browser', () => renderInBrowser());

  return {results: [...results.values()], timings};

  /**
   * Builds each target's page and renders it in Chromium. A page fails when
   * it reports an error or renders nothing.
   */
  async function renderInBrowser() {
    const out = path.join(project, 'dist-browser');
    const keys = renderable().map(t => t.key);
    await batch('browser', keys, list =>
      vite.build({
        root: path.join(project, 'entries'),
        base: './',
        configFile: false,
        logLevel: 'silent',
        plugins: plugins(),
        resolve,
        // The React plugin emits the development JSX runtime under a test
        // run, so the page uses React's development build to match.
        mode: 'development',
        define: {'process.env.NODE_ENV': '"development"'},
        build: {
          outDir: out,
          emptyOutDir: false,
          minify: false,
          reportCompressedSize: false,
          rollupOptions: {
            input: Object.fromEntries(
              list.map(k => [k, path.join(project, 'entries', `${k}.html`)]),
            ),
          },
        },
      }),
    );
    const {chromium} = requireFromRepo('playwright');
    const http = await import('node:http');
    const types = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
    };
    const server = http
      .createServer((request, response) => {
        const file = path.join(
          out,
          decodeURIComponent(new URL(request.url, 'http://x').pathname),
        );
        if (
          !file.startsWith(out) ||
          !fs.existsSync(file) ||
          fs.statSync(file).isDirectory()
        ) {
          response.writeHead(404);
          response.end();
          return;
        }
        response.writeHead(200, {
          'content-type':
            types[path.extname(file)] ?? 'application/octet-stream',
        });
        fs.createReadStream(file).pipe(response);
      })
      .listen(0);
    const {port} = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    // A missing browser fails the step: the release check asked for it.
    const chrome = await chromium.launch();
    try {
      for (const t of renderable()) {
        const page = await chrome.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(String(error.message)));
        try {
          await page.goto(`http://localhost:${port}/${t.key}.html`, {
            waitUntil: 'load',
            timeout: 15000,
          });
          await page.waitForTimeout(300);
          const state = await page.evaluate(() => ({
            errors: window.__swizzleErrors ?? ['the page did not run'],
            empty:
              (document.getElementById('root')?.childNodes.length ?? 0) === 0,
          }));
          const errors = [...pageErrors, ...state.errors];
          if (errors.length) fail(t.key, 'browser', errors[0]);
          else if (state.empty)
            fail(t.key, 'browser', 'the copy rendered nothing');
        } catch (error) {
          fail(t.key, 'browser', String(error.message ?? error).split('\n')[0]);
        } finally {
          await page.close();
        }
      }
    } finally {
      await chrome.close();
      server.close();
    }
  }
}

/** The playground defaults a target's doc declares, or none. */
async function playgroundDefaults(packages, t) {
  const src = path.join(packages.get(t.pkg).dir, 'src');
  const rel = fs
    .readdirSync(src, {recursive: true})
    .map(String)
    .find(f => path.basename(f) === `${t.name}.doc.mjs`);
  if (!rel) return {};
  try {
    const m = await import(pathToFileURL(path.join(src, rel)).href);
    const doc =
      m.doc ??
      m.default ??
      Object.values(m).find(v => v && typeof v === 'object' && v.name);
    return JSON.parse(JSON.stringify(doc?.playground?.defaults ?? {}));
  } catch {
    return {};
  }
}

/** The module a copy's component is imported from. */
function entryFileOf(dir, name) {
  for (const f of ['index.ts', 'index.tsx', `${name}.tsx`, `${name}.ts`]) {
    const file = path.join(dir, f);
    if (fs.existsSync(file)) return file;
  }
  return null;
}
