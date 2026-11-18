#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file measure-reference-pages.mjs
 * @input Two Core builds (a git ref, the working tree, or a built dist
 *   directory each) and the reference pages that
 *   docs/architecture/component-import-boundaries.md INV10 names
 * @output Each reference page's first-load JavaScript, minified and gzip, base
 *   against head, with the delta. With `--unused-on`, a pass or fail line per
 *   named page against INV10's 0.3 KB limit. `--json` prints the same as JSON
 * @position Run by people and review agents with `pnpm size:pages`; not a CI
 *   job. Builds each page with the size report's esbuild options
 *   (.github/scripts/lib/component-size.js), as the import-boundaries check
 *   does, over Core compiled as `build:esm` compiles it
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const {
  APP_EXTERNALS,
  eagerText,
  extractAtRef,
  gzipBytes,
  sizeBuildOptions,
} = require('./.github/scripts/lib/component-size.js');

const RECORD = 'docs/architecture/component-import-boundaries.md';
const CORE = 'packages/core';

/** INV10's limit for an unused optional feature: 0.3 KB gzip. */
export const UNUSED_FEATURE_LIMIT_BYTES = Math.round(0.3 * 1024);

/**
 * The reference pages INV10 names, read from the record's sentence "the docs
 * page Text, Heading, …; the form page …". Returns `{page: [component]}`.
 */
export function parseReferencePages(recordText) {
  const invariant = /\*\*INV10\b[\s\S]*?(?=\n- \*\*INV|\n#)/.exec(recordText);
  if (invariant == null) {
    throw new Error('The record has no INV10.');
  }
  const prose = invariant[0].replace(/\s+/g, ' ');
  const pages = {};
  for (const match of prose.matchAll(
    /\bthe (\w+) page ([A-Z][\w ,]*?)(?=[;.])/g,
  )) {
    pages[match[1]] = match[2]
      .split(/, | and /)
      .map(name => name.trim())
      .filter(Boolean);
  }
  if (Object.keys(pages).length === 0) {
    throw new Error('INV10 names no reference pages.');
  }
  return pages;
}

/**
 * Each page's sizes and delta, and with `unusedOn`, whether each named page
 * stays within the unused-feature limit.
 */
export function comparePages(base, head, {unusedOn = []} = {}) {
  const pages = Object.keys(head).map(page => ({
    page,
    components: head[page].components,
    base: {min: base[page].min, gzip: base[page].gzip},
    head: {min: head[page].min, gzip: head[page].gzip},
    delta: {
      min: head[page].min - base[page].min,
      gzip: head[page].gzip - base[page].gzip,
    },
  }));
  const verdicts = unusedOn.map(name => {
    const row = pages.find(({page}) => page === name);
    if (row == null) {
      throw new Error(`No reference page named "${name}".`);
    }
    return {
      page: name,
      gzipDelta: row.delta.gzip,
      limit: UNUSED_FEATURE_LIMIT_BYTES,
      pass: row.delta.gzip <= UNUSED_FEATURE_LIMIT_BYTES,
    };
  });
  return {pages, verdicts};
}

function signed(bytes) {
  return `${bytes < 0 ? '−' : '+'}${Math.abs(bytes).toLocaleString('en-US')}`;
}

function size({min, gzip}) {
  return `${min.toLocaleString('en-US')} / ${gzip.toLocaleString('en-US')}`;
}

/** The comparison as a Markdown table and one line per verdict. */
export function formatComparison({pages, verdicts}, {base, head}) {
  const lines = [
    `First-load JavaScript per reference page (minified / gzip bytes), ${base} → ${head}:`,
    '',
    '| Page (components) | Base | Head | Change |',
    '| --- | ---: | ---: | ---: |',
    ...pages.map(
      row =>
        `| ${row.page} (${row.components.join(', ')}) | ${size(row.base)} | ${size(row.head)} | ${signed(row.delta.min)} / ${signed(row.delta.gzip)} |`,
    ),
  ];
  if (verdicts.length > 0) lines.push('');
  for (const verdict of verdicts) {
    lines.push(
      `${verdict.pass ? 'PASS' : 'FAIL'}: the ${verdict.page} page grows ${signed(verdict.gzipDelta)} B gzip without the feature (INV10 limit: ${verdict.limit} B).`,
    );
  }
  return lines.join('\n');
}

/** A temporary directory by its real path: esbuild reports real paths. */
function realTempDir(prefix) {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

/** The files Core's build reads: its source, manifest and Babel config. */
const BUILD_INPUTS = [
  `${CORE}/src`,
  `${CORE}/package.json`,
  `${CORE}/babel.config.json`,
  `${CORE}/babel-plugin-add-extensions.cjs`,
];

/** Core's build inputs at `ref` (or the working tree), under `dir`. */
function exportSource(ref, dir) {
  if (ref === '.') {
    for (const input of BUILD_INPUTS) {
      fs.cpSync(path.join(REPO, input), path.join(dir, input), {
        recursive: true,
      });
    }
    return;
  }
  extractAtRef({
    repo: REPO,
    ref,
    target: dir,
    paths: BUILD_INPUTS,
    generatedFrom: `${CORE}/src`,
  });
}

/** The `--ignore` globs of Core's `build:esm` script. */
function buildIgnores(manifest) {
  const script = manifest.scripts?.['build:esm'] ?? '';
  const match = /--ignore "([^"]+)"/.exec(script);
  if (match == null) {
    throw new Error("Core's build:esm script has no --ignore list.");
  }
  return match[1];
}

/**
 * Core built at `ref` as its `build:esm` script builds it there, with that
 * ref's Babel config, into `sideDir/dist`, with its package.json beside the
 * output so bundlers read its `sideEffects`. A directory is taken as a built
 * dist, such as Core's own `dist/`, and copied into the same place. Both sides
 * use the same layout under their own `sideDir`, so unchanged code bundles to
 * the same bytes.
 * Returns the dist directory.
 */
export function buildCore(ref, sideDir) {
  const coreDir = path.join(sideDir, CORE);
  const distDir = path.join(sideDir, 'dist');
  if (ref !== '.' && fs.existsSync(ref) && fs.statSync(ref).isDirectory()) {
    // A built dist joins the same layout. Its package.json, beside it or the
    // package's own above Core's `dist/`, goes beside the copy.
    const manifest = [
      path.join(ref, 'package.json'),
      path.join(ref, '..', 'package.json'),
    ].find(file => fs.existsSync(file));
    if (manifest === undefined) {
      throw new Error(`${ref} has no package.json beside or above it.`);
    }
    fs.cpSync(ref, distDir, {recursive: true});
    fs.copyFileSync(manifest, path.join(distDir, 'package.json'));
    return distDir;
  }
  exportSource(ref, sideDir);
  // Babel resolves the config's presets and plugins from the config's folder.
  fs.symlinkSync(
    path.join(REPO, CORE, 'node_modules'),
    path.join(coreDir, 'node_modules'),
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(coreDir, 'package.json'), 'utf8'),
  );
  const babel = spawnSync(
    path.join(REPO, CORE, 'node_modules/.bin/babel'),
    [
      'src',
      '--out-dir',
      distDir,
      '--extensions',
      '.ts,.tsx',
      '--out-file-extension',
      '.js',
      '--ignore',
      buildIgnores(manifest),
      '--config-file',
      './babel.config.json',
    ],
    {cwd: coreDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
  );
  // A partial build gives plausible wrong sizes, so any error stops the run.
  if (babel.error != null) throw babel.error;
  if (babel.status !== 0 || /\bError\b/.test(babel.stderr)) {
    throw new Error(
      `Building Core at ${ref} failed:\n${babel.stderr || babel.stdout}`,
    );
  }
  fs.copyFileSync(
    path.join(coreDir, 'package.json'),
    path.join(distDir, 'package.json'),
  );
  return distDir;
}

/** A component's built module: its folder's index, else its own file. */
function componentModule(distDir, name) {
  for (const file of [`${name}/index.js`, `${name}/${name}.js`]) {
    const candidate = path.join(distDir, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No built module for ${name} in ${distDir}.`);
}

const ENTRY_SOURCE = '__astryx-reference-page__.mjs';

/** One page as a production app bundle: what it loads before first paint. */
export async function measurePage(distDir, components) {
  const esbuild = require('esbuild');
  const root = path.dirname(distDir);
  const result = await esbuild.build({
    ...sizeBuildOptions(root),
    nodePaths: [
      path.join(REPO, 'node_modules'),
      path.join(REPO, CORE, 'node_modules'),
    ],
    external: APP_EXTERNALS,
    stdin: {
      contents: components
        .map(
          name =>
            `export {${name}} from ${JSON.stringify(componentModule(distDir, name))};`,
        )
        .join('\n'),
      resolveDir: distDir,
      sourcefile: ENTRY_SOURCE,
      loader: 'js',
    },
  });
  const {outputs} = result.metafile;
  const entryPath = path
    .relative(root, path.join(distDir, ENTRY_SOURCE))
    .split(path.sep)
    .join('/');
  const entryOutput = Object.keys(outputs).find(
    key => outputs[key].entryPoint === entryPath,
  );
  if (entryOutput === undefined) {
    throw new Error(`No output for the page ${components.join(', ')}.`);
  }
  const textByPath = new Map(
    result.outputFiles.map(file => [
      path.relative(root, file.path).split(path.sep).join('/'),
      file.text,
    ]),
  );
  const text = eagerText(outputs, textByPath, entryOutput);
  return {min: Buffer.byteLength(text), gzip: gzipBytes(text)};
}

async function measurePages(distDir, pages) {
  const sizes = {};
  for (const [page, components] of Object.entries(pages)) {
    sizes[page] = {components, ...(await measurePage(distDir, components))};
  }
  return sizes;
}

export function parseArgs(argv) {
  const args = {
    base: null,
    head: '.',
    unusedOn: [],
    extraPages: {},
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--base') args.base = argv[++index];
    else if (flag === '--head') args.head = argv[++index];
    else if (flag === '--unused-on') {
      args.unusedOn.push(...argv[++index].split(',').filter(Boolean));
    } else if (flag === '--page') {
      const [name, list = ''] = argv[++index].split('=');
      args.extraPages[name] = list.split(',').filter(Boolean);
    } else if (flag === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (args.base == null) {
    throw new Error(
      'Usage: pnpm size:pages --base <ref|dist> [--head <ref|dist>] [--unused-on <page,…>] [--page name=A,B] [--json]',
    );
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  const pages = {
    ...parseReferencePages(fs.readFileSync(path.join(REPO, RECORD), 'utf8')),
    ...args.extraPages,
  };
  const workDir = realTempDir('astryx-reference-pages-');
  try {
    const baseSizes = await measurePages(
      buildCore(args.base, path.join(workDir, 'base')),
      pages,
    );
    const headSizes = await measurePages(
      buildCore(args.head, path.join(workDir, 'head')),
      pages,
    );
    const comparison = comparePages(baseSizes, headSizes, {
      unusedOn: args.unusedOn,
    });
    const labels = {
      base: args.base,
      head: args.head === '.' ? 'the working tree' : args.head,
    };
    console.log(
      args.json
        ? JSON.stringify({...labels, ...comparison}, null, 2)
        : formatComparison(comparison, labels),
    );
    return comparison.verdicts.every(({pass}) => pass) ? 0 : 1;
  } finally {
    fs.rmSync(workDir, {recursive: true, force: true});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    error => {
      console.error(error.message ?? error);
      process.exitCode = 1;
    },
  );
}
