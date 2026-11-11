#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-component-import-boundaries.mjs
 * @input Core's source, built per entry with the size report's esbuild
 *   options (.github/scripts/lib/component-size.js); the allowlist table in
 *   docs/architecture/component-import-boundaries.md
 * @output Fails on a static import chain from an entry into a surface module,
 *   a capability module, or touch code carried only for a deferred surface,
 *   unless the allowlist lists it; fails on a stale allowlist row; fails on
 *   an import() of a touch module or of a capability module. Prints each
 *   crossing's import chain, each listed crossing's gzip cost, and each
 *   entry's eager gzip size, base against head
 * @position CI check run by the Lint workflow, and locally with
 *   `pnpm check:component-import-boundaries`
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const REPO = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');
const {
  eagerText,
  gzipBytes,
  reachableChunks,
  sizeBuildOptions,
} = require('./.github/scripts/lib/component-size.js');

const RECORD = 'docs/architecture/component-import-boundaries.md';
const CORE_SRC = 'packages/core/src';

/** The entry list. Each entry is one public import of a component. */
export const ENTRIES = [
  {name: 'Text', module: `${CORE_SRC}/Text/Text.tsx`},
  {name: 'Heading', module: `${CORE_SRC}/Heading/Heading.tsx`},
  {name: 'Button', module: `${CORE_SRC}/Button/Button.tsx`},
  {name: 'IconButton', module: `${CORE_SRC}/IconButton/IconButton.tsx`},
  {name: 'Link', module: `${CORE_SRC}/Link/Link.tsx`},
  {name: 'Table', module: `${CORE_SRC}/Table/Table.tsx`},
];

/**
 * Each Table plugin is a capability. Its own import is its folder's index
 * and the modules that index re-exports from.
 */
function tablePluginCapabilities(root) {
  const pluginsDir = path.join(root, CORE_SRC, 'Table/plugins');
  if (!fs.existsSync(pluginsDir)) return [];
  return fs
    .readdirSync(pluginsDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(({name}) => {
      const folder = `Table/plugins/${name}`;
      const index = ['index.ts', 'index.tsx']
        .map(file => path.join(pluginsDir, name, file))
        .find(file => fs.existsSync(file));
      const reexported = index
        ? [...fs.readFileSync(index, 'utf8').matchAll(/from\s+'\.\/([^']+)'/g)]
            .map(([, specifier]) => `${folder}/${specifier}`)
            .map(stripIndex)
        : [];
      return {
        name: `Table ${name} plugin`,
        modules: new RegExp(`^${escapeRegExp(folder)}/`),
        ownImport: [folder, ...reexported],
      };
    });
}

/**
 * Which modules of Core sit behind which boundary. Module names are paths
 * under the package's source, without extension or a trailing `/index`.
 */
export const CORE_BOUNDARIES = {
  // A surface revealed by interaction, and the layer runtime that renders it.
  surfaceFolders: [
    'Tooltip',
    'HoverCard',
    'Popover',
    'DropdownMenu',
    'ContextMenu',
    'BottomSheet',
    'Layer',
  ],
  // Trigger contract and context plumbing that live in a surface folder. A
  // truncated Text hands its held intent to the tooltip through
  // `tooltipPresentInterest`; every scoped context uses `layerScopedContext`.
  baseModulesInSurfaceFolders: [
    'Tooltip/tooltipPresentInterest',
    'Layer/layerScopedContext',
  ],
  // The shared internal touch modules, and the layer's touch tap recognizer.
  touchModules: [
    /^gestures\//,
    /^motion\//,
    /^internal\/touch$/,
    /^Layer\/useTouchTrigger$/,
  ],
  capabilities: [
    ...tablePluginCapabilities(REPO),
    {name: 'list windowing', modules: /^virtualization\//, ownImport: []},
    {
      name: 'snap paging',
      modules: /^SnapPaging\//,
      ownImport: ['SnapPaging', 'SnapPaging/SnapPaging'],
    },
    {
      name: 'Markdown remark adapter',
      modules: /^Markdown\/remark$/,
      ownImport: [],
    },
  ],
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripIndex(name) {
  return name.replace(/\/index$/, '');
}

/** A module's name for reports and boundaries, from its repository path. */
export function moduleName(repoPath) {
  const withoutExtension = repoPath.replace(/\.[cm]?[jt]sx?$/, '');
  const core = `${CORE_SRC}/`;
  if (withoutExtension.startsWith(core)) {
    return stripIndex(withoutExtension.slice(core.length));
  }
  const other = /^packages\/([^/]+)\/src\/(.*)$/.exec(withoutExtension);
  if (other) return `${other[1]}:${stripIndex(other[2])}`;
  return withoutExtension;
}

function capabilityOf(name, boundaries) {
  return boundaries.capabilities.find(
    capability =>
      capability.modules.test(name) && !capability.ownImport.includes(name),
  );
}

function isTouchModule(name, boundaries) {
  return boundaries.touchModules.some(pattern => pattern.test(name));
}

function inSurfaceFolder(name, boundaries) {
  return (
    boundaries.surfaceFolders.some(
      folder => name === folder || name.startsWith(`${folder}/`),
    ) && !boundaries.baseModulesInSurfaceFolders.includes(name)
  );
}

const STATIC_KINDS = new Set(['import-statement', 'require-call']);

/**
 * Every crossing one entry reaches, from its import graph.
 *
 * `graph.modules` maps each repository path to `{eagerBytes, bytes?,
 * imports}`: `eagerBytes` are the bytes it puts in the chunks the import
 * loads at once, `bytes` the bytes it puts in any chunk, and `imports` lists
 * `{path, kind}` as esbuild's metafile does.
 *
 * A crossing is a static import, in the eager graph, from base code into a
 * surface module or a capability module, or into a touch module from a
 * module that defers a surface. The walk stops at a crossing, so imports
 * inside a surface or a capability are not crossings. A module that an
 * import() targets is a surface module too. Static imports inside a deferred
 * graph are never crossings, so a deferred surface may import touch modules.
 * An import() of a touch module or a capability module is a violation.
 */
export function findBoundaryViolations({entryName, graph, boundaries}) {
  const {modules} = graph;
  const importsOf = modulePath => modules[modulePath]?.imports ?? [];
  const nameOf = modulePath =>
    modulePath === graph.entry ? entryName : moduleName(modulePath);

  const deferredTargets = new Set();
  for (const {imports} of Object.values(modules)) {
    for (const {path: target, kind} of imports) {
      if (kind === 'dynamic-import') deferredTargets.add(moduleName(target));
    }
  }
  const isSurface = name =>
    inSurfaceFolder(name, boundaries) ||
    (deferredTargets.has(name) &&
      !isTouchModule(name, boundaries) &&
      capabilityOf(name, boundaries) === undefined);
  const defersSurface = modulePath =>
    importsOf(modulePath).some(
      ({path: target, kind}) =>
        kind === 'dynamic-import' && isSurface(moduleName(target)),
    );

  // A re-export-only module puts no bytes in any chunk. It counts when a
  // module it re-exports puts bytes in the build, whatever its name. A module
  // whose code sits only in a lazy chunk is not a re-export, so the eager
  // walk does not pass through it.
  const passThrough = new Map();
  function isLive(modulePath, bytesKey, seen = new Set()) {
    const info = modules[modulePath];
    if (info === undefined) return false;
    const bytes = info[bytesKey];
    if (bytes === undefined || bytes > 0) return true;
    if ((info.bytes ?? bytes) > 0 || seen.has(modulePath)) return false;
    const memoKey = `${bytesKey}:${modulePath}`;
    if (!passThrough.has(memoKey)) {
      seen.add(modulePath);
      passThrough.set(
        memoKey,
        info.imports.some(
          ({path: target, kind}) =>
            STATIC_KINDS.has(kind) && isLive(target, bytesKey, seen),
        ),
      );
    }
    return passThrough.get(memoKey);
  }

  function chainTo(parents, modulePath) {
    const hops = [];
    let current = modulePath;
    while (current !== graph.entry) {
      const parent = parents.get(current);
      hops.unshift(
        `${parent.kind === 'dynamic-import' ? '⇢' : '→'} ${nameOf(current)}`,
      );
      current = parent.from;
    }
    return [entryName, ...hops].join(' ');
  }

  // The eager graph, walked breadth first so each chain is a shortest one.
  const crossings = [];
  const crossingKeys = new Set();
  const eagerParents = new Map();
  const eagerSeen = new Set([graph.entry]);
  const eagerQueue = [graph.entry];
  while (eagerQueue.length > 0) {
    const from = eagerQueue.shift();
    const fromName = nameOf(from);
    for (const {path: target, kind} of importsOf(from)) {
      if (!STATIC_KINDS.has(kind) || !isLive(target, 'eagerBytes')) continue;
      const toName = moduleName(target);
      // A module can be in more than one kind: the layer's touch tap
      // recognizer is a surface module and a touch module.
      const invariants = [];
      if (isSurface(toName)) invariants.push('INV1');
      if (capabilityOf(toName, boundaries)) invariants.push('INV7');
      if (isTouchModule(toName, boundaries) && defersSurface(from)) {
        invariants.push('INV8');
      }
      if (invariants.length > 0) {
        const invariant = invariants.join(', ');
        const key = `${fromName} → ${toName}`;
        if (!crossingKeys.has(key)) {
          crossingKeys.add(key);
          crossings.push({
            from: fromName,
            to: toName,
            fromPath: from,
            toPath: target,
            invariant,
            chain: `${chainTo(eagerParents, from)} → ${toName}`,
          });
        }
        continue;
      }
      if (!eagerSeen.has(target)) {
        eagerSeen.add(target);
        eagerParents.set(target, {from, kind});
        eagerQueue.push(target);
      }
    }
  }

  // Every module the entry can load, import() targets included.
  const dynamicViolations = [];
  const parents = new Map();
  const seen = new Set([graph.entry]);
  const queue = [graph.entry];
  while (queue.length > 0) {
    const from = queue.shift();
    for (const {path: target, kind} of importsOf(from)) {
      const isDynamic = kind === 'dynamic-import';
      if (!isDynamic && (!STATIC_KINDS.has(kind) || !isLive(target, 'bytes'))) {
        continue;
      }
      if (isDynamic) {
        const toName = moduleName(target);
        const fromName = nameOf(from);
        const capability = capabilityOf(toName, boundaries);
        let invariant = null;
        if (isTouchModule(toName, boundaries)) invariant = 'INV8';
        else if (capability && !capability.modules.test(fromName)) {
          invariant = 'INV7';
        }
        if (invariant !== null) {
          dynamicViolations.push({
            from: fromName,
            to: toName,
            invariant,
            chain: `${chainTo(parents, from)} ⇢ ${toName}`,
          });
        }
      }
      if (!seen.has(target)) {
        seen.add(target);
        parents.set(target, {from, kind});
        queue.push(target);
      }
    }
  }

  return {crossings, dynamicViolations};
}

/**
 * The size report's build of an import (`sizeBuildOptions`), with React,
 * React DOM, and StyleX external.
 */
function buildOptions(root) {
  return {
    ...sizeBuildOptions(root),
    // esbuild reads no tsconfig for a file under node_modules, where the base
    // source sits, so the JSX transform is set here as the tsconfig sets it.
    jsx: 'automatic',
    external: [
      'react',
      'react/*',
      'react-dom',
      'react-dom/*',
      '@stylexjs/stylex',
    ],
  };
}

const ENTRY_SOURCE = '__astryx-import-entry__.mjs';

/**
 * Replaces one static import with an empty module, to measure what that
 * import alone adds to the entry.
 */
function cutPlugin(root, cut) {
  const fromAbs = path.join(root, cut.fromPath);
  const toAbs = path.join(root, cut.toPath);
  const stem = path.basename(cut.toPath).replace(/\.[cm]?[jt]sx?$/, '');
  const filter = new RegExp(
    stem === 'index'
      ? escapeRegExp(path.basename(path.dirname(cut.toPath)))
      : escapeRegExp(stem),
  );
  return {
    name: 'astryx-cut-import',
    setup(build) {
      build.onResolve({filter}, async args => {
        if (args.pluginData?.cutResolve || args.importer !== fromAbs) {
          return undefined;
        }
        const resolved = await build.resolve(args.path, {
          importer: args.importer,
          resolveDir: args.resolveDir,
          kind: args.kind,
          pluginData: {cutResolve: true},
        });
        if (resolved.path !== toAbs) return undefined;
        return {path: toAbs, namespace: 'astryx-cut'};
      });
      build.onLoad({filter: /.*/, namespace: 'astryx-cut'}, () => ({
        contents: 'module.exports = {};',
        loader: 'js',
      }));
    },
  };
}

/**
 * Builds one entry as the size report builds an import and reads its import
 * graph. Returns its crossings, its import() violations, and the gzip size
 * of what it loads at once.
 */
export async function measureEntry(
  entry,
  {root = REPO, boundaries = CORE_BOUNDARIES, cut, nodePaths} = {},
) {
  const moduleAbs = path.join(root, entry.module);
  const resolveDir = path.dirname(moduleAbs);
  const result = await esbuild.build({
    ...buildOptions(root),
    ...(nodePaths ? {nodePaths} : {}),
    plugins: cut ? [cutPlugin(root, cut)] : [],
    stdin: {
      contents: `export {${entry.name}} from ${JSON.stringify(moduleAbs)};`,
      resolveDir,
      sourcefile: ENTRY_SOURCE,
      loader: 'js',
    },
  });
  const {inputs, outputs} = result.metafile;
  const entryPath = path
    .relative(root, path.join(resolveDir, ENTRY_SOURCE))
    .split(path.sep)
    .join('/');
  const entryOutput = Object.keys(outputs).find(
    key => outputs[key].entryPoint === entryPath,
  );
  if (entryOutput === undefined) {
    throw new Error(`No output for the ${entry.name} entry`);
  }
  const eagerOutputs = reachableChunks(outputs, entryOutput, [
    'import-statement',
  ]);
  const eagerBytes = new Map();
  const bytes = new Map();
  for (const [key, output] of Object.entries(outputs)) {
    for (const [input, {bytesInOutput}] of Object.entries(output.inputs)) {
      bytes.set(input, (bytes.get(input) ?? 0) + bytesInOutput);
      if (eagerOutputs.has(key)) {
        eagerBytes.set(input, (eagerBytes.get(input) ?? 0) + bytesInOutput);
      }
    }
  }
  const modules = {};
  for (const [input, info] of Object.entries(inputs)) {
    modules[input] = {
      eagerBytes: eagerBytes.get(input) ?? 0,
      bytes: bytes.get(input) ?? 0,
      imports: info.imports.filter(record => !record.external),
    };
  }
  const textByPath = new Map(
    result.outputFiles.map(file => [
      path.relative(root, file.path).split(path.sep).join('/'),
      file.text,
    ]),
  );
  return {
    entryName: entry.name,
    ...findBoundaryViolations({
      entryName: entry.name,
      graph: {entry: entryPath, modules},
      boundaries,
    }),
    eagerGzipBytes: gzipBytes(eagerText(outputs, textByPath, entryOutput)),
  };
}

/** The record's allowlist rows: `{from, to, entries}`. */
export function parseAllowlist(recordText) {
  const section = /^### Allowlist\s*$([\s\S]*?)(?=^#{1,3} )/m.exec(
    `${recordText}\n# end`,
  );
  if (!section) return [];
  const rows = [];
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').map(cell => cell.trim());
    const crossing = /^`([^`]+)`\s*→\s*`([^`]+)`$/.exec(cells[1] ?? '');
    if (!crossing) continue;
    rows.push({
      from: crossing[1],
      to: crossing[2],
      entries: cells[2]
        .split(',')
        .map(name => name.trim())
        .filter(Boolean),
    });
  }
  return rows;
}

/** One row per crossing, listing every entry that reaches it. */
export function rowsByCrossing(results) {
  const group = (items, entryName, byKey) => {
    for (const item of items) {
      const key = `${item.from} → ${item.to}`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          from: item.from,
          to: item.to,
          invariant: item.invariant,
          entries: [],
          chains: new Map(),
          cuts: new Map(),
        });
      }
      const row = byKey.get(key);
      if (!row.entries.includes(entryName)) row.entries.push(entryName);
      if (!row.chains.has(entryName)) row.chains.set(entryName, item.chain);
      if (item.fromPath) {
        row.cuts.set(entryName, {fromPath: item.fromPath, toPath: item.toPath});
      }
    }
  };
  const crossings = new Map();
  const dynamic = new Map();
  for (const result of results) {
    group(result.crossings ?? [], result.entryName, crossings);
    group(result.dynamicViolations ?? [], result.entryName, dynamic);
  }
  return {crossings: [...crossings.values()], dynamic: [...dynamic.values()]};
}

/** Compares measured crossings with the allowlist. */
export function compareWithAllowlist(rows, allowlist) {
  const listed = new Map(
    allowlist.map(row => [`${row.from} → ${row.to}`, row]),
  );
  const allowed = [];
  const unlisted = [];
  const entryDrift = [];
  for (const row of rows.crossings) {
    const listedRow = listed.get(row.key);
    if (listedRow === undefined) {
      unlisted.push(row);
      continue;
    }
    const added = row.entries.filter(name => !listedRow.entries.includes(name));
    const removed = listedRow.entries.filter(
      name => !row.entries.includes(name),
    );
    if (added.length > 0 || removed.length > 0) {
      entryDrift.push({key: row.key, row, added, removed});
    } else {
      allowed.push(row);
    }
  }
  const measured = new Set(rows.crossings.map(row => row.key));
  const stale = allowlist.filter(
    row => !measured.has(`${row.from} → ${row.to}`),
  );
  return {
    ok:
      unlisted.length === 0 &&
      entryDrift.length === 0 &&
      stale.length === 0 &&
      rows.dynamic.length === 0,
    allowed,
    unlisted,
    entryDrift,
    stale,
    dynamic: rows.dynamic,
  };
}

function kilobytes(byteCount) {
  return `${(byteCount / 1024).toFixed(1)} KB`;
}

function crossingLine(row, costCell) {
  const cells = [`\`${row.from}\` → \`${row.to}\``, row.entries.join(', ')];
  if (costCell !== undefined) cells.push(costCell);
  cells.push(row.invariant);
  return `| ${cells.join(' | ')} |`;
}

function chainLines(row) {
  return [...row.chains].map(
    ([entryName, chain]) => `    - ${entryName}: ${chain}`,
  );
}

/**
 * The check's report. `costs` maps a crossing key to each entry's gzip
 * bytes that the crossing alone adds; `sizes` lists each entry's eager gzip
 * bytes at head and, when known, at base.
 */
export function formatReport(comparison, {costs = new Map(), sizes = []} = {}) {
  const lines = [];
  const costCell = row => {
    const byEntry = costs.get(row.key);
    if (byEntry === undefined) return undefined;
    return row.entries
      .map(
        name =>
          `${name} ${byEntry[name] === undefined ? 'n/a' : kilobytes(byEntry[name])}`,
      )
      .join(', ');
  };
  if (comparison.unlisted.length > 0) {
    lines.push(
      'Crossings not in the allowlist (base module → module it imports statically | entries that reach it | invariant):',
    );
    for (const row of comparison.unlisted) {
      lines.push(crossingLine(row), ...chainLines(row));
    }
    lines.push('');
  }
  if (comparison.entryDrift.length > 0) {
    lines.push(
      'Allowlist rows whose entries differ from the entries that reach the crossing:',
    );
    for (const {row, added, removed} of comparison.entryDrift) {
      lines.push(crossingLine(row, costCell(row)));
      if (added.length > 0)
        lines.push(`    reached but not listed: ${added.join(', ')}`);
      if (removed.length > 0) {
        lines.push(
          `    listed but no longer reached: ${removed.join(', ')}. Delete them from this row's entries in ${RECORD} in this pull request.`,
        );
      }
      lines.push(...chainLines(row));
    }
    lines.push('');
  }
  if (comparison.stale.length > 0) {
    lines.push('Stale allowlist rows:');
    for (const row of comparison.stale) {
      lines.push(
        `    - \`${row.from}\` → \`${row.to}\` no longer crosses: delete its row from the Allowlist table in ${RECORD} in this pull request.`,
      );
    }
    lines.push('');
  }
  if (comparison.dynamic.length > 0) {
    lines.push('import() of a touch module or a capability module:');
    for (const row of comparison.dynamic) {
      lines.push(crossingLine(row), ...chainLines(row));
    }
    lines.push('');
  }
  if (comparison.allowed.length > 0) {
    lines.push(
      'Allowlisted crossings (crossing | entries | gzip cost of this crossing alone, per entry | invariant):',
    );
    for (const row of comparison.allowed) {
      lines.push(crossingLine(row, costCell(row)), ...chainLines(row));
    }
    lines.push('');
  }
  if (sizes.length > 0) {
    lines.push('Eager gzip per entry (base → head):');
    for (const {entryName, head, base} of sizes) {
      if (base === undefined || base === null) {
        lines.push(`    - ${entryName}: ${kilobytes(head)}`);
      } else {
        const delta = head - base;
        lines.push(
          `    - ${entryName}: ${kilobytes(base)} → ${kilobytes(head)} (${delta >= 0 ? '+' : '−'}${kilobytes(Math.abs(delta))})`,
        );
      }
    }
    lines.push('');
  }
  lines.push(
    comparison.ok
      ? 'Component import boundaries hold.'
      : `Component import boundaries fail. Fix the import, or ask the owner of ${RECORD} to change its allowlist.`,
  );
  return lines.join('\n');
}

/** Copies Core's source at `ref` beside the repository's dependencies. */
function extractBaseSource(ref) {
  const base = path.join(
    REPO,
    'node_modules/.cache/astryx-import-boundaries',
    `base-${process.pid}`,
  );
  fs.rmSync(base, {recursive: true, force: true});
  fs.mkdirSync(base, {recursive: true});
  const archive = execFileSync(
    'git',
    [
      'archive',
      '--format=tar',
      ref,
      '--',
      CORE_SRC,
      'packages/core/package.json',
    ],
    {
      cwd: REPO,
      maxBuffer: 1024 * 1024 * 1024,
    },
  );
  execFileSync('tar', ['-x', '-C', base], {input: archive});
  // Generated source is not in git. The base takes head's copy of each such
  // file it lacks.
  const generated = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '-z',
      '--',
      CORE_SRC,
    ],
    {cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024},
  )
    .split('\0')
    .filter(Boolean);
  for (const file of generated) {
    const target = path.join(base, file);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(REPO, file), target);
  }
  return base;
}

async function baseSizes(ref) {
  let base;
  try {
    base = extractBaseSource(ref);
  } catch {
    console.log(`Base sizes skipped: cannot read ${CORE_SRC} at ${ref}.`);
    return new Map();
  }
  try {
    const sizes = new Map();
    const nodePaths = [
      path.join(REPO, 'packages/core/node_modules'),
      path.join(REPO, 'node_modules'),
    ];
    await Promise.all(
      ENTRIES.map(async entry => {
        if (!fs.existsSync(path.join(base, entry.module))) return;
        try {
          const {eagerGzipBytes} = await measureEntry(entry, {
            root: base,
            nodePaths,
          });
          sizes.set(entry.name, eagerGzipBytes);
        } catch {
          // An entry the base cannot build has no base size.
        }
      }),
    );
    return sizes;
  } finally {
    fs.rmSync(base, {recursive: true, force: true});
  }
}

function parseArgs(argv) {
  const args = {record: RECORD, baseRef: null};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--record') args.record = argv[++index];
    else if (argv[index] === '--base-ref') args.baseRef = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return args;
}

async function main(argv) {
  const started = performance.now();
  const args = parseArgs(argv);
  const allowlist = parseAllowlist(
    fs.readFileSync(path.resolve(REPO, args.record), 'utf8'),
  );
  const results = await Promise.all(ENTRIES.map(entry => measureEntry(entry)));
  const rows = rowsByCrossing(results);
  const comparison = compareWithAllowlist(rows, allowlist);

  const costs = new Map();
  const headSize = new Map(
    results.map(result => [result.entryName, result.eagerGzipBytes]),
  );
  const priced = [
    ...comparison.allowed,
    ...comparison.entryDrift.map(({row}) => row),
  ];
  await Promise.all(
    priced.flatMap(row =>
      [...row.cuts].map(async ([entryName, cut]) => {
        const entry = ENTRIES.find(({name}) => name === entryName);
        const {eagerGzipBytes} = await measureEntry(entry, {cut});
        const byEntry = costs.get(row.key) ?? {};
        byEntry[entryName] = Math.max(
          0,
          headSize.get(entryName) - eagerGzipBytes,
        );
        costs.set(row.key, byEntry);
      }),
    ),
  );

  const base = args.baseRef ? await baseSizes(args.baseRef) : new Map();
  const sizes = ENTRIES.map(({name}) => ({
    entryName: name,
    head: headSize.get(name),
    base: base.get(name),
  }));
  console.log(formatReport(comparison, {costs, sizes}));
  console.log(
    `Checked ${ENTRIES.length} entries in ${((performance.now() - started) / 1000).toFixed(1)} s.`,
  );
  return comparison.ok ? 0 : 1;
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
      console.error(error);
      process.exitCode = 1;
    },
  );
}
