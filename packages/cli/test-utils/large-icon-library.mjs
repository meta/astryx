// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A synthetic icon library with the shape of a very large generated
 * one, for the integration check and verify tests.
 *
 * `writeLargeIconLibrary` writes one package with `count` icon exports:
 * one module per icon under `dist/icons/`, a root barrel that re-exports every
 * icon, a `./*Icon` subpath export per icon, two generated source files per
 * icon under `src/` that npm does not pack, and an `experimental.iconSets`
 * root. The icons include every built-in icon definition by name, so the set
 * that `experimental icon new-set` writes maps them all. That set re-exports
 * each icon from the package's own name, and the root barrel re-exports the
 * set, as a library that publishes its set from its root entry does.
 *
 * Run it as a script for a manual run at full size: it writes the library,
 * then times `integration check --strict` and `integration verify` and
 * prints the peak memory of each:
 *
 *     node packages/cli/test-utils/large-icon-library.mjs [count] [folder]
 *
 * @input A folder and an icon count
 * @output The package folder, with its icon set written by the CLI
 * @position test-utils — read by large-icon-library.test.mjs
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ICON_NAMES} from '../authoring/doctypes/icon-set/icon-names.mjs';

const CLI_BIN = fileURLToPath(
  new URL('../clients/cli/bin/astryx.mjs', import.meta.url),
);
/** @param {string} name */
const installedDir = name =>
  path.dirname(fileURLToPath(import.meta.resolve(`${name}/package.json`)));

export const LARGE_LIBRARY_NAME = '@acme/large-icons';
const SET_NAME = 'large';

/** @param {string} name a camelCase or kebab-case name */
const pascal = name =>
  name
    .split('-')
    .map(part => part[0].toUpperCase() + part.slice(1))
    .join('');

/**
 * The library's icon component names, `count` in all: each glyph in an
 * outline and a filled look (`CloseOutline24Icon`, `CloseFilled24Icon`),
 * every built-in definition first, then numbered glyphs. The set drops the
 * look words, so it re-exports each icon under a new name.
 * @param {number} count
 */
export function largeIconNames(count) {
  const glyphs = ICON_NAMES.map(pascal);
  for (let index = glyphs.length; index * 2 < count; index++) {
    glyphs.push(`Glyph${index}`);
  }
  return glyphs
    .flatMap(glyph => [`${glyph}Outline24Icon`, `${glyph}Filled24Icon`])
    .slice(0, Math.max(count, glyphs.length * 2));
}

// What a bundler emits for an icon component that spreads its props: the
// object rest and spread helpers, then the component.
const BUILT_ICON_HELPERS = [
  'var __defProp = Object.defineProperty, __defProps = Object.defineProperties;',
  'var __getOwnPropDescs = Object.getOwnPropertyDescriptors, __getOwnPropSymbols = Object.getOwnPropertySymbols;',
  'var __hasOwnProp = Object.prototype.hasOwnProperty, __propIsEnum = Object.prototype.propertyIsEnumerable;',
  'var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, {enumerable: true, configurable: true, writable: true, value}) : obj[key] = value;',
  'var __spreadValues = (a, b) => { for (var prop in b || (b = {})) if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]); if (__getOwnPropSymbols) for (var prop of __getOwnPropSymbols(b)) if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]); return a; };',
  'var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));',
  'var __objRest = (source, exclude) => { var target = {}; for (var prop in source) if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0) target[prop] = source[prop]; if (source != null && __getOwnPropSymbols) for (var prop of __getOwnPropSymbols(source)) if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop)) target[prop] = source[prop]; return target; };',
  "import {jsx, jsxs} from 'react/jsx-runtime';",
].join('\n');

/**
 * One icon's built module, about the size of a real generated icon.
 * @param {string} name
 * @param {number} index
 */
function builtIcon(name, index) {
  const points = Array.from(
    {length: 60},
    (_, step) =>
      `${(index + step) % 24}.${step % 10}${step % 7} ${step % 24}.${index % 10}`,
  ).join(' L');
  return `${BUILT_ICON_HELPERS}
export default function ${name}(_a) {
  var _b = _a, {size = 24, title} = _b, props = __objRest(_b, ['size', 'title']);
  return jsxs('svg', __spreadProps(__spreadValues({}, props), {width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor', role: title != null ? 'img' : props.role, 'aria-hidden': title != null ? void 0 : true, children: [title != null ? jsx('title', {children: title}) : null, jsx('path', {d: 'M${points}Z'})]}));
}
`;
}

/** @param {string} file @param {string} text */
function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

/**
 * Write the library into `dir` and its icon set through the CLI.
 * @param {string} dir
 * @param {{count: number}} options
 * @returns {string} `dir`
 */
export function writeLargeIconLibrary(dir, {count}) {
  const names = largeIconNames(count);
  writeFile(
    path.join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: LARGE_LIBRARY_NAME,
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': './dist/index.js',
          './*Icon': './dist/icons/*Icon.js',
        },
        files: ['dist', 'icon-sets', 'astryx.integration.mjs'],
        peerDependencies: {react: '*'},
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    path.join(dir, 'astryx.integration.mjs'),
    "export default {experimental: {iconSets: './icon-sets'}};\n",
  );
  // A library installs React for its components and TypeScript for its
  // build; the check reads both.
  fs.mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
  for (const name of ['react', 'typescript']) {
    fs.symlinkSync(
      installedDir(name),
      path.join(dir, 'node_modules', name),
      'dir',
    );
  }
  for (const [index, name] of names.entries()) {
    const shape = `M4 4h16v16H4z M${index % 20} 12h4`;
    writeFile(
      path.join(dir, 'src', 'svg', `${name}.svg`),
      `<svg viewBox="0 0 24 24"><path d="${shape}"/></svg>\n`,
    );
    writeFile(
      path.join(dir, 'src', '__generated__', 'icons', `${name}.tsx`),
      `import {createElement, type SVGProps} from 'react';\nexport default function ${name}(props: SVGProps<SVGSVGElement>) {\n  return createElement('svg', {viewBox: '0 0 24 24', fill: 'currentColor', ...props}, createElement('path', {d: '${shape}'}));\n}\n`,
    );
    writeFile(
      path.join(dir, 'dist', 'icons', `${name}.js`),
      builtIcon(name, index),
    );
  }
  const barrel = path.join(dir, 'dist', 'index.js');
  writeFile(
    barrel,
    names
      .map(name => `export {default as ${name}} from './icons/${name}.js';\n`)
      .join(''),
  );
  const newSet = runCli(dir, [
    'experimental',
    'icon',
    'new-set',
    SET_NAME,
    '--from',
    LARGE_LIBRARY_NAME,
  ]);
  if (newSet.status !== 0) {
    throw new Error(`icon new-set failed: ${newSet.stderr || newSet.stdout}`);
  }
  fs.appendFileSync(
    barrel,
    `export * from '../icon-sets/${SET_NAME}/${SET_NAME}.generated.js';\n`,
  );
  return dir;
}

/**
 * Run the CLI in `dir`, with this Node and its default memory.
 * @param {string} dir
 * @param {string[]} args
 * @returns {{status: number | null, stdout: string, stderr: string, seconds: number, peakMegabytes: number}}
 */
export function runCli(dir, args) {
  const started = performance.now();
  const peakFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-large-')),
    'peak',
  );
  const recordPeak = `import {writeFileSync} from 'node:fs'; process.on('exit', () => writeFileSync(${JSON.stringify(peakFile)}, String(process.resourceUsage().maxRSS)));`;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(recordPeak)}`,
      CLI_BIN,
      ...args,
    ],
    {cwd: dir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024},
  );
  const seconds = (performance.now() - started) / 1000;
  let peakMegabytes = 0;
  try {
    peakMegabytes = Math.round(
      Number(fs.readFileSync(peakFile, 'utf-8')) / 1024,
    );
  } catch {
    // The run ended before it could record its peak.
  }
  fs.rmSync(path.dirname(peakFile), {recursive: true, force: true});
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    seconds,
    peakMegabytes,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = Number(process.argv[2] ?? 20_000);
  const dir =
    process.argv[3] ??
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-large-icon-library-'));
  const started = performance.now();
  writeLargeIconLibrary(dir, {count});
  console.log(
    `Wrote ${count} icons to ${dir} in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
  );
  for (const args of [
    ['integration', 'check', '--strict'],
    ['integration', 'verify'],
  ]) {
    const run = runCli(dir, args);
    const last = run.stdout.trim().split('\n').at(-1);
    console.log(
      `astryx ${args.join(' ')}: exit ${run.status}, ${run.seconds.toFixed(1)} s, peak ${run.peakMegabytes} MB. ${last ?? ''}`,
    );
    if (run.status !== 0) process.exitCode = 1;
  }
}
