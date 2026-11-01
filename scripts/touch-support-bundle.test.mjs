// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch-support-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js); core's package.json; core's and
 *   the CLI's docs; core's and Lab's component source
 * @output Pins architecture:react-component-runtime INV13's bundle and
 *   boundary claims: a public import of Core (each subpath, and each hook on
 *   its own) ships none of the gesture code at once (in its entry chunk and
 *   the chunks that chunk imports statically) unless it is listed as using a
 *   gesture, Button and TextInput never do, and a failure names the import
 *   chain that brings it; the root entry ships at once only the gesture code
 *   its touch components import; a chunk that brings it later is a
 *   component's prop-gated gesture layer, each named here; two components
 *   that import the touch module share one copy per page; only the internal
 *   `internal/touch` entry reaches it, and no consumer doc or component
 *   `import()` names it
 * @position Node test over source, so it needs no build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(REPO, 'packages/core/src');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

/** The gesture core the internal entry re-exports. */
const PRIMITIVE_INPUT = /^packages\/core\/src\/gestures\//;

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-touch-module-'));
afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The size report's build of a component import (minified ESM for the
 * browser). React and StyleX stay external: they hold no touch code.
 */
const BUILD_OPTIONS = {
  absWorkingDir: REPO,
  outdir: path.join(scratch, 'out'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  define: {'process.env.NODE_ENV': '"production"'},
  loader: {'.css': 'empty'},
  external: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    '@stylexjs/stylex',
  ],
  metafile: true,
  write: false,
  logLevel: 'silent',
};

/**
 * Each output of a build of `entries`, with the bytes each source module puts
 * in it, built as the size report builds a component import.
 */
function outputsOf(entries) {
  const result = esbuild.buildSync({
    ...BUILD_OPTIONS,
    entryPoints: entries,
    splitting: true,
  });
  return Object.values(result.metafile.outputs).map(output =>
    Object.fromEntries(
      Object.entries(output.inputs).map(([input, {bytesInOutput}]) => [
        input,
        bytesInOutput,
      ]),
    ),
  );
}

/**
 * The bytes each source module puts in what a build's entry ships at once:
 * the entry's chunk and every chunk it imports statically, not a chunk only
 * an `import()` brings (INV13: a component's prop-gated gesture layer).
 */
function shippedAtOnce(metafile, entryPoint) {
  const outputs = metafile.outputs;
  const start = Object.keys(outputs).find(
    file => outputs[file].entryPoint === entryPoint,
  );
  const seen = new Set();
  const queue = start == null ? [] : [start];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    for (const {path: next, kind} of outputs[file].imports) {
      if (kind !== 'dynamic-import' && outputs[next] != null) {
        queue.push(next);
      }
    }
  }
  const bytes = {};
  for (const file of seen) {
    for (const [input, {bytesInOutput}] of Object.entries(
      outputs[file].inputs,
    )) {
      bytes[input] = (bytes[input] ?? 0) + bytesInOutput;
    }
  }
  return bytes;
}

/** The inputs matching `pattern` that put bytes in `bytes`. */
function bytesOf(bytes, pattern = PRIMITIVE_INPUT) {
  return Object.entries(bytes).filter(
    ([input, size]) => pattern.test(input) && size > 0,
  );
}

/** A scratch entry module with `source`. */
function entryWith(name, source) {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, source);
  return file;
}

/** Every file under `dir` whose name matches `pattern`. */
function filesUnder(dir, pattern) {
  const found = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        found.push(...filesUnder(full, pattern));
      }
    } else if (pattern.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/**
 * The public imports that may carry the gesture code: those that use a
 * gesture, or reach one through a component that does. Each is named here, so
 * an import that starts carrying it shows up in review: the pull request that
 * gives a component its gesture adds that component's import, and each import
 * that reaches it, with a comment naming the gesture.
 */
const GESTURE_USERS = new Set([
  // The public pan, which the root's createPanGesture shares.
  'hooks: usePanGesture',
  // The snap-point drag, which moves an element on that pan.
  'hooks: useDragToSnapPoints',
]);

/**
 * The prop-gated gesture layers a component loads with import() (INV13): each
 * names the prop that turns its gesture on.
 */
const LAZY_GESTURE_LAYERS = [
  // Item's swipe actions (`swipeActions`, spec:AST-057).
  'packages/core/src/Item/ItemSwipeLayer.tsx',
];

/** Public imports that carry no gesture code, whatever the list above says. */
const NEVER_GESTURE_USERS = ['Button', 'TextInput'];

/**
 * Each public import of Core, built alone as the size report builds one:
 * every subpath export but the root and the internal entries, and each export
 * of the hooks entry on its own, since that barrel gathers independent hooks.
 * The root re-exports all of them, so it is not one import: under INV13 a
 * component that uses a gesture imports it statically, and the root then
 * carries it by design.
 */
function publicImports() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, 'packages/core/package.json'), 'utf8'),
  );
  const imports = [];
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const source = target?.source;
    if (
      typeof source !== 'string' ||
      !/\.tsx?$/.test(source) ||
      subpath === '.' ||
      subpath.includes('*') ||
      subpath.startsWith('./internal/')
    ) {
      continue;
    }
    const file = path.join(REPO, 'packages/core', source);
    if (subpath === './hooks') {
      for (const name of exportNamesOf(file)) {
        imports.push({
          name: `hooks: ${name}`,
          source: `export {${name}} from ${JSON.stringify(file)};\n`,
        });
      }
    } else {
      imports.push({
        name: subpath.slice(2),
        source: `export * from ${JSON.stringify(file)};\n`,
      });
    }
  }
  return imports;
}

/** The names a module exports at runtime, read from its build. */
function exportNamesOf(file) {
  const result = esbuild.buildSync({...BUILD_OPTIONS, entryPoints: [file]});
  const entry = path.relative(REPO, file);
  return Object.values(result.metafile.outputs).find(
    output => output.entryPoint === entry,
  ).exports;
}

/**
 * Leaves every `import()` out of a build: what it loads comes later, in a
 * chunk of its own (INV13: a component's prop-gated gesture layer), so an
 * output holds only what its import ships at once.
 */
const DYNAMIC_IMPORTS_LATER = {
  name: 'dynamic-imports-later',
  setup(build) {
    build.onResolve({filter: /.*/}, args =>
      args.kind === 'dynamic-import'
        ? {path: args.path, external: true}
        : undefined,
    );
  },
};

/**
 * The gesture modules each of `imports` ships at once, with their bytes and
 * the import chain that brings the first of them. Each import is an entry
 * point of one build: without code splitting, each output holds only what its
 * own entry reaches, so it is that import built on its own, and esbuild
 * builds them all at once instead of one rebuild after another. An
 * `import()` stays out of the build (DYNAMIC_IMPORTS_LATER).
 */
async function gestureCarriers(imports) {
  const dir = fs.mkdtempSync(path.join(scratch, 'public-imports-'));
  const entries = imports.map(({source}, index) => {
    const file = path.join(dir, `${index}.ts`);
    fs.writeFileSync(file, source);
    return path.relative(REPO, file);
  });
  const {metafile} = await esbuild.build({
    ...BUILD_OPTIONS,
    entryPoints: entries.map(entry => path.join(REPO, entry)),
    splitting: false,
    plugins: [DYNAMIC_IMPORTS_LATER],
  });
  const outputs = new Map(
    Object.values(metafile.outputs).map(output => [output.entryPoint, output]),
  );
  const carriers = [];
  imports.forEach(({name}, index) => {
    const output = outputs.get(entries[index]);
    if (output == null) {
      throw new Error(`no output for the import of ${name}`);
    }
    const gestureModules = bytesOf(
      Object.fromEntries(
        Object.entries(output.inputs).map(([input, {bytesInOutput}]) => [
          input,
          bytesInOutput,
        ]),
      ),
    );
    if (gestureModules.length > 0) {
      carriers.push({
        name,
        gestureModules,
        chain: importChain(metafile, entries[index], gestureModules[0][0]),
      });
    }
  });
  return carriers;
}

/** The first import chain from `from` to `to` in a build's metafile. */
function importChain(metafile, from, to) {
  const previous = new Map([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === to) {
      break;
    }
    for (const {path: next, kind} of metafile.inputs[current]?.imports ?? []) {
      if (
        kind !== 'dynamic-import' &&
        !previous.has(next) &&
        metafile.inputs[next] != null
      ) {
        previous.set(next, current);
        queue.push(next);
      }
    }
  }
  const chain = [];
  for (let at = to; at != null; at = previous.get(at)) {
    chain.unshift(at.replace('packages/core/src/', ''));
  }
  return chain.slice(1).join(' -> ');
}

describe('the touch module in bundles', () => {
  it('is in no public import that uses no gesture', async () => {
    const carriers = await gestureCarriers(publicImports());
    const unexpected = carriers.filter(({name}) => !GESTURE_USERS.has(name));
    expect(
      unexpected.map(
        ({name, gestureModules, chain}) =>
          `${name}: ${gestureModules
            .map(
              ([input, size]) =>
                `${input.replace('packages/core/src/', '')} ${size} B`,
            )
            .join(', ')} (via ${chain})`,
      ),
    ).toEqual([]);
  }, 120_000);

  it('counts what an import ships at once, not a layer it loads later', async () => {
    // INV13: a gesture a prop turns on lives in a layer the component loads
    // with import(); a page that never sets the prop carries none of it.
    const touch = JSON.stringify(path.join(CORE_SRC, 'internal/touch.ts'));
    const layer = entryWith(
      'lazy-layer.ts',
      `import {GestureArena} from ${touch};
export default () => new GestureArena();
`,
    );
    const carriers = await gestureCarriers([
      {
        name: 'Eager',
        source: `import {GestureArena} from ${touch};
export const Eager = () => new GestureArena();
`,
      },
      {
        name: 'Lazy',
        source: `export const Lazy = () => import(${JSON.stringify(layer)});
`,
      },
    ]);
    expect(carriers.map(({name}) => name)).toEqual(['Eager']);
  }, 120_000);

  it('is in none of the imports that never use a gesture', async () => {
    const strict = publicImports().filter(({name}) =>
      NEVER_GESTURE_USERS.includes(name),
    );
    expect(strict.map(({name}) => name).sort()).toEqual(
      [...NEVER_GESTURE_USERS].sort(),
    );
    expect(
      (await gestureCarriers(strict)).map(
        ({name, chain}) => `${name} (via ${chain})`,
      ),
    ).toEqual([]);
  }, 120_000);

  it('is in the root entry only as much as its touch components import', async () => {
    const used = new Set(
      (
        await gestureCarriers(
          publicImports().filter(({name}) => GESTURE_USERS.has(name)),
        )
      ).flatMap(({gestureModules}) => gestureModules.map(([input]) => input)),
    );
    const root = path.join(CORE_SRC, 'index.ts');
    const {metafile} = esbuild.buildSync({
      ...BUILD_OPTIONS,
      entryPoints: [root],
      splitting: true,
    });
    const inRoot = bytesOf(
      shippedAtOnce(metafile, path.relative(REPO, root)),
    ).map(([input]) => input);
    expect(
      [...new Set(inRoot)]
        .filter(input => !used.has(input))
        .map(input => input.replace('packages/core/src/', '')),
    ).toEqual([]);
  }, 120_000);

  it('is brought later only by a component’s prop-gated gesture layer', () => {
    // INV13: a gesture a prop turns on lives in a layer its component loads
    // with import() when the prop is first set. Each such layer is named in
    // LAZY_GESTURE_LAYERS, so a new one shows up in review.
    const root = path.join(CORE_SRC, 'index.ts');
    const {metafile} = esbuild.buildSync({
      ...BUILD_OPTIONS,
      entryPoints: [root],
      splitting: true,
    });
    const atOnce = shippedAtOnce(metafile, path.relative(REPO, root));
    const lazyLayers = new Set();
    for (const output of Object.values(metafile.outputs)) {
      for (const {path: next, kind} of output.imports) {
        const chunk = metafile.outputs[next];
        if (kind !== 'dynamic-import' || chunk == null) {
          continue;
        }
        const later = Object.entries(chunk.inputs).filter(
          ([input, {bytesInOutput}]) =>
            PRIMITIVE_INPUT.test(input) && bytesInOutput > 0 && !atOnce[input],
        );
        if (later.length > 0) {
          lazyLayers.add(chunk.entryPoint);
        }
      }
    }
    expect([...lazyLayers].sort()).toEqual([...LAZY_GESTURE_LAYERS].sort());
  }, 120_000);

  it('is absent from the utils entry', () => {
    for (const bytes of outputsOf([path.join(CORE_SRC, 'utils/index.ts')])) {
      expect(bytesOf(bytes)).toEqual([]);
    }
  });

  it('is one copy that two components importing it share', () => {
    const component = name =>
      entryWith(
        `${name}.ts`,
        `import {GestureArena} from ${JSON.stringify(
          path.join(CORE_SRC, 'internal/touch.ts'),
        )};
export const ${name} = () => new GestureArena();
`,
      );
    const outputs = outputsOf([component('First'), component('Second')]);
    const holding = outputs.filter(
      bytes => bytes['packages/core/src/gestures/GestureArena.ts'] > 0,
    );
    expect(holding).toHaveLength(1);
    for (const bytes of outputs.filter(output => output !== holding[0])) {
      expect(bytesOf(bytes)).toEqual([]);
    }
  });
});

describe('the touch module internals', () => {
  it('have no entry in the exports map beside the internal touch entry', () => {
    const {exports} = JSON.parse(
      fs.readFileSync(path.join(REPO, 'packages/core/package.json'), 'utf8'),
    );
    expect(exports['./internal/touch']?.source).toBe('./src/internal/touch.ts');
    const other = Object.keys(exports).filter(key =>
      /^\.\/(gestures|motion|touch-support)(\/|$)/.test(key),
    );
    expect(other).toEqual([]);
  });

  it('are named by no consumer doc', () => {
    const docs = [
      ...filesUnder(CORE_SRC, /\.doc(\.[a-z]+)?\.mjs$/),
      ...filesUnder(path.join(REPO, 'packages/cli/assets/docs'), /\.mjs$/),
    ];
    const naming = docs.filter(file =>
      /\b(GestureArena|GestureRecognizer)\b|@astryxdesign\/core\/internal\//.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(naming.map(file => path.relative(REPO, file))).toEqual([]);
  });

  it('are never loaded through an import() in Core or Lab source', () => {
    const sources = [
      ...filesUnder(CORE_SRC, /\.(ts|tsx)$/),
      ...filesUnder(path.join(REPO, 'packages/lab/src'), /\.(ts|tsx)$/),
    ].filter(file => !/\.(test|spec)\.(ts|tsx)$|__tests__/.test(file));
    const dynamic = sources.filter(file =>
      /\bimport\(\s*['"][^'"]*(\/gestures\/|\/motion\/|touch-support|internal\/touch)/.test(
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(dynamic.map(file => path.relative(REPO, file))).toEqual([]);
  });
});
