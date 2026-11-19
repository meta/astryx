#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file first-load-matrix.mjs
 * @input A base and a head git ref (or a pull request number), reference pages
 *   given as Core component sets, and the deferred modules to check
 * @output Per page and bundler (Vite 8, Rolldown with inline common chunks off
 *   and at 64 KiB, webpack 5): first-load JS gzip, first-load chunk count, and
 *   whether each deferred module stays out of the first-load set, as Markdown
 *   or JSON
 * @position Run by people and review agents with `pnpm size:matrix`; not a CI
 *   job. Builds Core at each ref with `pnpm size:pages`' own `buildCore`, so
 *   both commands measure the same build; `pnpm size:pages` stays the esbuild
 *   per-page delta for INV10
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildCore, parseReferencePages} from './measure-reference-pages.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const req = createRequire(import.meta.url);
const RECORD = 'docs/architecture/component-import-boundaries.md';

/** The app provides these, so no bundle counts them. */
const EXTERNAL = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'scheduler',
  '@stylexjs/stylex',
];

/** INV10's reference pages from the record, plus two single-component pages. */
export const PAGES = {
  ...parseReferencePages(fs.readFileSync(path.join(REPO, RECORD), 'utf8')),
  button: ['Button'],
  resize: ['ResizeHandle@Resizable'],
};

/** Modules that pull requests defer from first load. `--defer` replaces the list. */
export const DEFER = [
  'Tooltip/tooltipSurface.js',
  'motion/animator.js',
  'gestures/GestureHost.js',
  'gestures/GestureArena.js',
  'SegmentedControl/useSegmentedSelectionMotion.js',
  'Popover/popoverSurfaceMotion.js',
  'Popover/usePopoverSurfaceMotion.js',
  'Resizable/useResizable.js',
];

const USAGE =
  'Usage: pnpm size:matrix (--pr <number> | --ref <head|.> [--base <base>]) --pages <page,…> [--defer <module,…>] [--chunks] [--json] [--out <file>] [--remote <name>] [--work-dir <dir>] [--keep]';

const VALUE_FLAGS = new Set([
  '--pr',
  '--ref',
  '--base',
  '--pages',
  '--defer',
  '--remote',
  '--work-dir',
  '--out',
]);

export function parseArgs(argv) {
  const a = {
    pages: [],
    defer: DEFER,
    remote: 'origin',
    workDir: os.tmpdir(),
    json: false,
    keep: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    let value;
    if (VALUE_FLAGS.has(flag)) {
      value = argv[++i];
      if (value == null || value.startsWith('--')) throw new Error(USAGE);
    }
    if (flag === '--pr') a.pr = value;
    else if (flag === '--ref') a.ref = value;
    else if (flag === '--base') a.base = value;
    else if (flag === '--pages') a.pages = value.split(',').filter(Boolean);
    else if (flag === '--defer') a.defer = value.split(',').filter(Boolean);
    else if (flag === '--remote') a.remote = value;
    else if (flag === '--work-dir') a.workDir = path.resolve(value);
    else if (flag === '--out') a.out = path.resolve(value);
    else if (flag === '--json') a.json = true;
    else if (flag === '--chunks') a.chunks = true;
    else if (flag === '--keep') a.keep = true;
    else throw new Error(`Unknown argument: ${flag}\n${USAGE}`);
  }
  if ((!a.pr && !a.ref) || a.pages.length === 0) throw new Error(USAGE);
  return a;
}

const git = (...args) =>
  execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 30,
  }).trim();

/**
 * The head and base to build. `--ref .` is the working tree. With `--pr`, the
 * base is the merge base with the pull request's base branch, which `gh`
 * reads; without `gh` it is main.
 */
function resolveRefs(a) {
  if (a.ref === '.') {
    const base = a.base ?? git('merge-base', 'HEAD', `${a.remote}/main`);
    return {head: '.', base: git('rev-parse', base), label: 'the working tree'};
  }
  let head = a.ref;
  let base = a.base;
  let label = a.ref;
  if (a.pr) {
    git('fetch', '-q', a.remote, `pull/${a.pr}/head`);
    head = git('rev-parse', 'FETCH_HEAD');
    label = `#${a.pr}`;
    if (!base) {
      let baseRef = 'main';
      try {
        baseRef =
          execFileSync(
            'gh',
            ['pr', 'view', a.pr, '--json', 'baseRefName', '-q', '.baseRefName'],
            {
              cwd: REPO,
              encoding: 'utf8',
            },
          ).trim() || 'main';
      } catch {
        // Without `gh`, the base branch is main.
      }
      git('fetch', '-q', a.remote, baseRef);
      base = git('merge-base', head, git('rev-parse', 'FETCH_HEAD'));
      label += ` (base branch ${baseRef})`;
    }
  }
  base ??= git('merge-base', head, `${a.remote}/main`);
  return {head: git('rev-parse', head), base: git('rev-parse', base), label};
}

/**
 * Core at `ref` as an installed package folder, built by `size:pages`'
 * `buildCore`. The folder is named `@astryxdesign/core` so that source maps
 * name Core's modules the way an app's build names them.
 */
function buildCorePackage(ref, sideDir) {
  const packageDir = path.join(sideDir, '@astryxdesign', 'core');
  const distDir = buildCore(ref, packageDir);
  fs.copyFileSync(
    path.join(distDir, 'package.json'),
    path.join(packageDir, 'package.json'),
  );
  // The built modules import Core's own dependencies (intl-messageformat).
  fs.symlinkSync(
    path.join(REPO, 'packages/core/node_modules'),
    path.join(packageDir, 'node_modules'),
  );
  return packageDir;
}

const GENERATED_I18N =
  'packages/core/src/i18n/generated-locales/en.generated.ts';

/** A page name, or `name=Comp[@Subpath]+Comp2`, as `[name, components]`. */
export function pageSpec(name) {
  if (name.includes('=')) {
    const [n, list] = name.split('=');
    return [n, list.split('+')];
  }
  if (!PAGES[name]) throw new Error(`Unknown page ${name}`);
  return [name, PAGES[name]];
}

/** An app folder that installs `corePkg` and has one entry file per page. */
export function writeFixture(dir, corePkg, pages) {
  fs.mkdirSync(path.join(dir, 'node_modules/@astryxdesign'), {recursive: true});
  fs.symlinkSync(corePkg, path.join(dir, 'node_modules/@astryxdesign/core'));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"private":true,"type":"module"}',
  );
  const entries = {};
  for (const [name, comps] of pages) {
    const lines = comps.map(c => {
      const [comp, sub = c] = c.split('@');
      return `import {${comp}} from '@astryxdesign/core/${sub}';`;
    });
    lines.push(
      `globalThis.__page = [${comps.map(c => c.split('@')[0]).join(', ')}];`,
    );
    entries[name] = path.join(dir, `${name}.js`);
    fs.writeFileSync(entries[name], lines.join('\n') + '\n');
  }
  return entries;
}

const B64 = Object.fromEntries(
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].map(
    (c, i) => [c, i],
  ),
);
/** Generated bytes per source file of `file`, from its source map. */
export function sourceBytes(file) {
  const per = new Map();
  if (!fs.existsSync(file + '.map')) return per;
  const map = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let src = 0;
  map.mappings.split(';').forEach((line, li) => {
    const text = lines[li] ?? '';
    let col = 0;
    const segs = [];
    for (const seg of line.split(',')) {
      if (!seg) continue;
      const vals = [];
      let shift = 0,
        cur = 0;
      for (const ch of seg) {
        let d = B64[ch];
        const cont = d & 32;
        d &= 31;
        cur += d << shift;
        if (cont) shift += 5;
        else {
          vals.push(cur & 1 ? -(cur >> 1) : cur >> 1);
          shift = cur = 0;
        }
      }
      col += vals[0];
      if (vals.length >= 4) {
        src += vals[1];
        segs.push([col, src]);
      } else segs.push([col, null]);
    }
    segs.forEach(([c, s], i) => {
      if (s == null) return;
      const end = i + 1 < segs.length ? segs[i + 1][0] : text.length;
      const key = map.sources[s];
      per.set(key, (per.get(key) ?? 0) + Math.max(0, end - c));
    });
  });
  return per;
}

/** A source path's Core module (`Layer/useLayer.js`), or undefined. */
export const coreModule = s =>
  /(?:packages\/core|@astryxdesign\/core)\/dist\/(.+)$/.exec(
    s.replace(/\\/g, '/'),
  )?.[1];

/**
 * First-load gzip and chunk count, and for each deferred module: "IN" (with its
 * minified bytes) when the first-load set has its code, "out (lazy)" when only a
 * later chunk has it, "absent" when no chunk has it.
 */
export function summarize(outDir, firstLoad, allFiles, defer) {
  const gz = firstLoad.reduce(
    (n, f) =>
      n +
      zlib.gzipSync(fs.readFileSync(path.join(outDir, f)), {level: 9}).length,
    0,
  );
  const inFirst = new Map(),
    inAny = new Map(),
    chunkDetail = [];
  for (const [set, files] of [
    [inFirst, firstLoad],
    [inAny, allFiles],
  ]) {
    for (const f of files) {
      const mods = [];
      for (const [s, b] of sourceBytes(path.join(outDir, f)))
        if (b > 0) {
          const m = coreModule(s);
          if (m) {
            set.set(m, (set.get(m) ?? 0) + b);
            mods.push([m, b]);
          }
        }
      if (set === inFirst)
        chunkDetail.push({
          file: f,
          gzip: zlib.gzipSync(fs.readFileSync(path.join(outDir, f)), {level: 9})
            .length,
          modules: mods.sort((x, y) => y[1] - x[1]),
        });
    }
  }
  const deferred = Object.fromEntries(
    defer.map(m => [
      m,
      inFirst.has(m)
        ? `IN (${inFirst.get(m)} B min)`
        : inAny.has(m)
          ? 'out (lazy)'
          : 'absent',
    ]),
  );
  return {
    gzip: gz,
    chunks: firstLoad.length,
    coreModules: inFirst.size,
    deferred,
    chunkDetail,
  };
}

/** The entry chunk and every chunk it imports statically. */
export function rolldownFirstLoad(output) {
  const chunks = output.filter(o => o.type === 'chunk');
  const byName = new Map(chunks.map(c => [c.fileName, c]));
  const entry = chunks.find(c => c.isEntry);
  const seen = new Set([entry.fileName]),
    q = [entry.fileName];
  while (q.length)
    for (const i of byName.get(q.shift()).imports)
      if (byName.has(i) && !seen.has(i)) {
        seen.add(i);
        q.push(i);
      }
  return {firstLoad: [...seen], all: chunks.map(c => c.fileName)};
}

/** One page bundled by each bundler in production mode. */
export async function bundleAll(fixture, entry, outRoot, defer) {
  const results = {};
  const NODE_ENV = {'process.env.NODE_ENV': JSON.stringify('production')};
  {
    const {build} = await import(pathToFileURL(req.resolve('vite')).href);
    const out = path.join(outRoot, 'vite');
    const r = await build({
      root: fixture,
      configFile: false,
      logLevel: 'silent',
      mode: 'production',
      build: {
        outDir: out,
        emptyOutDir: true,
        sourcemap: true,
        modulePreload: false,
        rollupOptions: {
          input: entry,
          external: EXTERNAL,
          output: {entryFileNames: 'main.js'},
        },
      },
    });
    const output = (Array.isArray(r) ? r[0] : r).output;
    const {firstLoad, all} = rolldownFirstLoad(output);
    results['Vite 8 (Rolldown)'] = summarize(out, firstLoad, all, defer);
  }
  const {rolldown} = req('rolldown');
  for (const [label, maxSize] of [
    ['Rolldown, inline common chunks off', 0],
    [
      'Rolldown, inline common chunks 64 KiB (preserveEntrySignatures false)',
      64 * 1024,
    ],
  ]) {
    const out = path.join(outRoot, `rolldown-${maxSize}`);
    fs.rmSync(out, {recursive: true, force: true});
    const bundle = await rolldown({
      input: entry,
      cwd: fixture,
      external: EXTERNAL,
      platform: 'browser',
      tsconfig: false,
      transform: {define: NODE_ENV},
      logLevel: 'silent',
      ...(maxSize > 0 ? {preserveEntrySignatures: false} : {}),
    });
    const {output} = await bundle.write({
      dir: out,
      format: 'esm',
      minify: true,
      sourcemap: true,
      entryFileNames: 'main.js',
      codeSplitting: {experimentalInlineCommonChunks: {maxSize}},
    });
    await bundle.close();
    const {firstLoad, all} = rolldownFirstLoad(output);
    results[label] = summarize(out, firstLoad, all, defer);
  }
  {
    const webpack = req('webpack');
    const out = path.join(outRoot, 'webpack');
    const stats = await new Promise((ok, no) =>
      webpack(
        {
          mode: 'production',
          context: fixture,
          entry,
          devtool: 'source-map',
          output: {path: out, filename: 'main.js', clean: true},
          resolve: {
            modules: [path.join(fixture, 'node_modules'), 'node_modules'],
          },
          module: {rules: [{test: /\.css$/, type: 'asset/resource'}]},
          externals: Object.fromEntries(
            EXTERNAL.map(n => [n, 'var X' + n.replace(/\W/g, '')]),
          ),
          performance: {hints: false},
        },
        (err, s) =>
          err || s.hasErrors()
            ? no(err || new Error(s.toString('errors-only')))
            : ok(s),
      ),
    );
    const j = stats.toJson({assets: true, entrypoints: true});
    const firstLoad = j.entrypoints.main.assets
      .map(x => x.name ?? x)
      .filter(f => f.endsWith('.js'));
    const all = j.assets.map(x => x.name).filter(f => f.endsWith('.js'));
    results['webpack 5'] = summarize(out, firstLoad, all, defer);
  }
  return results;
}

const tableRow = cells => `| ${cells.join(' | ')} |`;

export function markdown(label, refs, pages, data, defer, chunks) {
  const kb = b => (b / 1024).toFixed(1);
  const lines = [
    `### First-load matrix: ${label}`,
    '',
    `Base \`${refs.base.slice(0, 11)}\` → head \`${refs.head === '.' ? 'working tree' : refs.head.slice(0, 11)}\`. First-load JS gzip (KB = 1,024 B), React, React DOM and StyleX external; chunks = first-load requests.`,
    '',
  ];
  for (const [page, comps] of pages) {
    const relevant = defer.filter(
      m =>
        Object.values(data.head[page]).some(r => r.deferred[m] !== 'absent') ||
        Object.values(data.base[page]).some(r => r.deferred[m] !== 'absent'),
    );
    lines.push(
      `**${page}** (${comps.join(', ')})`,
      '',
      tableRow([
        'Bundler',
        'Base gzip / chunks',
        'Head gzip / chunks',
        'Δ gzip (B)',
        ...relevant.map(m => `\`${m.replace(/\.js$/, '')}\` base → head`),
      ]),
      tableRow(['---', '---:', '---:', '---:', ...relevant.map(() => '---')]),
    );
    for (const bundler of Object.keys(data.head[page])) {
      const b = data.base[page][bundler],
        h = data.head[page][bundler];
      lines.push(
        tableRow([
          bundler,
          `${kb(b.gzip)} / ${b.chunks}`,
          `${kb(h.gzip)} / ${h.chunks}`,
          (h.gzip - b.gzip >= 0 ? '+' : '') + (h.gzip - b.gzip),
          ...relevant.map(m => `${b.deferred[m]} → **${h.deferred[m]}**`),
        ]),
      );
    }
    lines.push('');
    if (chunks)
      for (const side of ['base', 'head'])
        for (const bundler of Object.keys(data[side][page])) {
          lines.push(
            `<details><summary>${page} · ${side} · ${bundler}: first-load chunks</summary>`,
            '',
            '| Chunk | gzip B | Core modules (minified bytes, largest first) |',
            '| --- | ---: | --- |',
          );
          for (const c of data[side][page][bundler].chunkDetail)
            lines.push(
              `| ${c.file} | ${c.gzip} | ${c.modules.length} modules: ${c.modules
                .slice(0, 12)
                .map(([m, b]) => `${m.replace(/\.js$/, '')} ${b}`)
                .join(', ')}${c.modules.length > 12 ? ', …' : ''} |`,
            );
          lines.push('', '</details>', '');
        }
  }
  return lines.join('\n');
}

async function main(argv) {
  const a = parseArgs(argv);
  if (!fs.existsSync(path.join(REPO, GENERATED_I18N)))
    throw new Error(
      "Core's generated i18n modules are missing. Run `pnpm -F @astryxdesign/core build:i18n` first: both size commands copy them from the working tree into each ref they build.",
    );
  const refs = resolveRefs(a);
  const pages = a.pages.map(pageSpec);
  const work = fs.mkdtempSync(path.join(a.workDir, 'first-load-matrix-'));
  try {
    const data = {};
    for (const side of ['base', 'head']) {
      const corePkg = buildCorePackage(refs[side], path.join(work, side));
      const fixture = path.join(work, side, 'app');
      const entries = writeFixture(fixture, corePkg, pages);
      data[side] = {};
      for (const [page] of pages)
        data[side][page] = await bundleAll(
          fixture,
          entries[page],
          path.join(work, side, 'out', page),
          a.defer,
        );
    }
    const report = a.json
      ? JSON.stringify({label: refs.label, refs, pages, data}, null, 2)
      : markdown(refs.label, refs, pages, data, a.defer, a.chunks);
    if (a.out) fs.writeFileSync(a.out, report + '\n');
    else console.log(report);
  } finally {
    if (a.keep) console.error(`work dir: ${work}`);
    else fs.rmSync(work, {recursive: true, force: true});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  });
}
