#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * XDS Bundle Size Analysis
 *
 * Measures what importing XDS components ships: each component directory's
 * same-named export (the whole entry for a directory without one), or a set of
 * them, bundled, tree-shaken and minified with the PR size report's esbuild
 * options (.github/scripts/lib/component-size.js), counting the JavaScript the
 * import loads eagerly. A set is one bundle, so code its
 * components share counts once, and a barrel a component imports from costs
 * only the modules the component uses. React and the StyleX runtime count, as
 * in the size report. Sizes are gzip at the default compression level, as the
 * size report measures them (architecture:component-style-authoring INV6).
 *
 * Usage:
 *   node scripts/bundle-analysis.mjs                     # full report
 *   node scripts/bundle-analysis.mjs Button Dialog Text   # specific set
 *   node scripts/bundle-analysis.mjs --json               # machine-readable
 *   node scripts/bundle-analysis.mjs --compare @radix-ui/react-dialog=Dialog @radix-ui/react-tabs=TabList
 *   node scripts/bundle-analysis.mjs --compare @chakra-ui/react  # whole-library
 */

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {bundleImportWithInputs, gzipBytes} = require(
  '../.github/scripts/lib/component-size.js',
);

const DEFAULT_DIST = join(import.meta.dirname, '..', 'packages', 'core', 'dist');

/** A file's size, raw and gzip. */
function fileSize(fp) {
  const text = readFileSync(fp, 'utf8');
  return {raw: Buffer.byteLength(text), gzip: gzipBytes(text)};
}

/**
 * The export a component directory is named after, when its entry has one
 * (`Dialog` in Dialog/index.js), as the size report measures it; null for a
 * directory without one (`hooks`, `utils`), which counts whole.
 */
function namedExport(entry, name) {
  return bundleImportWithInputs(entry, name) === null ? null : name;
}

/**
 * What importing `items` ships: each directory's same-named export, or its
 * whole entry when it has none, in one bundle; the JavaScript it loads
 * eagerly, minified: its bytes (`raw`), their gzip size, and the modules
 * that put code in it (`files`).
 * @param {readonly {entry: string, name: string | null}[]} items
 */
export function bundleSize(items) {
  if (items.length === 0) return {raw: 0, gzip: 0, files: 0};
  const scratch = mkdtempSync(join(tmpdir(), 'astryx-bundle-analysis-'));
  try {
    const set = join(scratch, 'set.mjs');
    writeFileSync(
      set,
      items
        .map(({entry, name}, i) =>
          name === null
            ? `export * as c${i} from ${JSON.stringify(entry)};`
            : `export {${name} as c${i}} from ${JSON.stringify(entry)};`,
        )
        .join('\n'),
    );
    const bundle = bundleImportWithInputs(set);
    if (bundle === null) throw new Error(`could not bundle ${items.map(i => i.entry).join(', ')}`);
    return {
      raw: Buffer.byteLength(bundle.text),
      gzip: gzipBytes(bundle.text),
      files: bundle.eagerInputs.filter(input => input !== set).length,
    };
  } finally {
    rmSync(scratch, {recursive: true, force: true});
  }
}

async function fetchSize(pkg) {
  try {
    const r = await fetch(`https://bundlephobia.com/api/size?package=${encodeURIComponent(pkg)}`,
      {headers: {'User-Agent': 'xds', Accept: 'application/json'}});
    if (!r.ok) return null;
    const d = await r.json();
    return {name: d.name, version: d.version, size: d.size, gzip: d.gzip};
  } catch { return null; }
}

/**
 * Each component directory under `dist` with an index entry. A component's
 * own bundle (`totalGzip`, `totalRaw`, `fileCount`) is measured the first
 * time it is read.
 */
export function buildMap(dist = DEFAULT_DIST) {
  const comps = {};
  for (const n of readdirSync(dist)) {
    const e = existsSync(join(dist, n, 'index.js')) ? join(dist, n, 'index.js') : join(dist, n, 'index.mjs');
    if (!existsSync(e)) continue;
    let solo = null;
    let name;
    const item = () => ({entry: e, name: (name ??= namedExport(e, n))});
    const measured = () => (solo ??= bundleSize([item()]));
    comps[n] = {
      entry: e,
      dist,
      get item() { return item(); },
      get totalRaw() { return measured().raw; },
      get totalGzip() { return measured().gzip; },
      get fileCount() { return measured().files; },
    };
  }
  return comps;
}

/** What importing every named component ships, as one bundle. */
export function measure(names, comps) {
  const found = [];
  for (const n of names) {
    const comp = comps[n];
    if (!comp) { console.warn(`  ⚠ "${n}" not found`); continue; }
    found.push(n);
  }
  const js = bundleSize(found.map(n => comps[n].item));
  const tG = js.gzip, tR = js.raw;
  const dist = found.length ? comps[found[0]].dist : DEFAULT_DIST;
  const astryxCss = existsSync(join(dist, 'astryx.css')) ? fileSize(join(dist, 'astryx.css')) : {raw: 0, gzip: 0};
  return {
    count: found.length, found,
    js: {gzip: tG, raw: tR, files: js.files},
    astryxCss,
    total: {gzip: tG + astryxCss.gzip, raw: tR + astryxCss.raw},
  };
}

function fmt(b) {
  return b >= 102400 ? `${(b/1024).toFixed(0)} KB` : b >= 1024 ? `${(b/1024).toFixed(1)} KB` : `${b.toLocaleString()}B`;
}
const pad = (s, n, a = 'left') => { s = String(s); return a === 'right' ? s.padStart(n) : s.padEnd(n); };

function printSet(label, r) {
  console.log();
  console.log('─'.repeat(65));
  console.log(`${label} (${r.count} components)`);
  console.log('─'.repeat(65));
  console.log(`  JS:               ${pad(fmt(r.js.gzip), 10, 'right')}  (${fmt(r.js.raw)} minified, ${r.js.files} modules)`);
  console.log(`  astryx.css:       ${pad(fmt(r.astryxCss.gzip), 10, 'right')}`);
  console.log(`  ${'─'.repeat(16)}`);
  console.log(`  Total shipped:    ${pad(fmt(r.total.gzip), 10, 'right')}`);
}

async function printCompare(mappings, comps) {
  const hasMap = mappings.some(m => m.xds);
  console.log('\nFetching sizes from bundlephobia...');
  const results = [];
  for (const m of mappings) {
    const d = await fetchSize(m.pkg);
    if (!d) { console.warn(`  Could not fetch ${m.pkg}`); continue; }
    results.push({...m, bp: d});
    console.log(`  ${d.name}@${d.version}: ${fmt(d.gzip)} gzip`);
  }
  if (!results.length) { console.error('No packages fetched.'); return; }
  if (hasMap) {
    const xn = results.filter(r => r.xds).map(r => r.xds);
    const xr = measure(xn, comps);
    const et = results.reduce((s, r) => s + r.bp.gzip, 0);
    console.log(`\n${'='.repeat(75)}\nXDS vs External\n${'='.repeat(75)}\n`);
    console.log(`${pad('XDS', 20)} ${pad('XDS gz', 14, 'right')} ${pad('Ext gz', 14, 'right')} ${pad('Package', 25)}`);
    console.log('-'.repeat(75));
    let xt = 0;
    for (const r of results) {
      if (!r.xds) continue;
      const comp = comps[r.xds]; if (!comp) continue;
      xt += comp.totalGzip;
      console.log(`${pad(r.xds, 20)} ${pad(fmt(comp.totalGzip), 14, 'right')} ${pad(fmt(r.bp.gzip), 14, 'right')} ${r.bp.name}@${r.bp.version}`);
    }
    console.log('-'.repeat(75));
    console.log(`${pad('Total', 20)} ${pad(fmt(xt), 14, 'right')} ${pad(fmt(et), 14, 'right')}`);
    printSet(`XDS (${xn.length} matched)`, xr);
    console.log(`\n  External total: ${fmt(et)} (JS only)`);
    console.log(`  XDS total:      ${fmt(xr.js.gzip)} (JS, fully styled, React included)`);
  } else {
    const an = Object.keys(comps);
    const xr = measure(an, comps);
    console.log(`\n${'='.repeat(65)}\nLibrary Comparison\n${'='.repeat(65)}\n`);
    console.log(`${pad('Package', 42)} ${pad('Min', 10, 'right')} ${pad('Gzip', 10, 'right')}`);
    console.log('-'.repeat(65));
    console.log(`${pad(`XDS @astryxdesign/core (${an.length} groups)`, 42)} ${pad(fmt(xr.total.raw), 10, 'right')} ${pad(fmt(xr.total.gzip), 10, 'right')}`);
    for (const r of results)
      console.log(`${pad(`${r.bp.name}@${r.bp.version}`, 42)} ${pad(fmt(r.bp.size), 10, 'right')} ${pad(fmt(r.bp.gzip), 10, 'right')}`);
  }
}

function printFull(comps) {
  const an = Object.keys(comps).sort();
  console.log(`${'='.repeat(75)}\nXDS BUNDLE SIZE ANALYSIS\n${'='.repeat(75)}\n`);
  console.log(`${pad('Component', 22)} ${pad('Solo', 10, 'right')} ${pad('Modules', 8, 'right')}`);
  console.log('-'.repeat(40));
  const sorted = an.map(n => {
    const comp = comps[n];
    return {n, solo: comp.totalGzip, files: comp.fileCount};
  }).sort((a, b) => b.solo - a.solo);
  for (const c of sorted)
    console.log(`${pad(c.n, 22)} ${pad(fmt(c.solo), 10, 'right')} ${pad(String(c.files), 8, 'right')}`);
  const scenarios = [
    ['Small app (5)', ['Button', 'Text', 'Dialog', 'TextInput', 'Stack']],
    ['Medium app (15)', ['Button', 'Text', 'Dialog', 'TextInput', 'Stack', 'Table', 'DropdownMenu', 'Selector', 'TabList', 'Card', 'Badge', 'Avatar', 'Tooltip', 'Banner', 'Spinner']],
    ['Full library', an],
  ];
  console.log(`\n${'='.repeat(65)}\nSCENARIOS\n${'='.repeat(65)}`);
  for (const [l, ns] of scenarios) printSet(l, measure(ns, comps));
}

/** Whether this file is the script Node runs (through a symlink too). */
function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch (error) {
    // A script path that names nothing on disk is not this file. Any other
    // error is thrown.
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false;
    throw error;
  }
}

// Main, when run as a script.
if (isDirectExecution()) {
  if (!existsSync(DEFAULT_DIST)) { console.error('Run `pnpm build` first.'); process.exit(1); }
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const cmpIdx = args.indexOf('--compare');
  const comps = buildMap();

  if (jsonMode) {
    const ca = args.filter(a => !a.startsWith('--'));
    console.log(JSON.stringify(measure(ca.length ? ca : Object.keys(comps), comps), null, 2));
  } else if (cmpIdx !== -1) {
    const ca = args.slice(cmpIdx + 1).filter(a => !a.startsWith('--'));
    const mappings = ca.map(a => {
      const [pkg, xds] = a.includes('=') ? a.split('=', 2) : [a, null];
      return {pkg, xds};
    });
    await printCompare(mappings, comps);
  } else {
    const ca = args.filter(a => !a.startsWith('--'));
    if (ca.length) printSet('Custom set', measure(ca, comps));
    else printFull(comps);
  }
}
