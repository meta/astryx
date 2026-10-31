// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touch-support-bundle.test.mjs
 * @input Core's source, bundled with the PR size report's esbuild options
 *   (.github/scripts/lib/component-size.js); core's package.json; core's and
 *   the CLI's docs; core's and Lab's component source
 * @output Pins architecture:react-component-runtime INV13's bundle and
 *   boundary claims: a public import of Core (each subpath, and each hook on
 *   its own) carries none of the gesture code unless it is listed as using a
 *   gesture, Button and TextInput never do, and a failure names the import
 *   chain that brings it; the root entry
 *   carries only the gesture code its touch components import; two components
 *   that import the touch module share one copy per page; only the internal
 *   `internal/touch` entry reaches it, and no consumer doc or component
 *   `import()` does
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
const GESTURE_USERS = new Set([]);

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
 * The gesture modules each of `imports` ships, with their bytes and the import
 * chain that brings the first of them, building each import on its own.
 */
async function gestureCarriers(imports) {
  const probe = path.join(scratch, 'public-import.ts');
  fs.writeFileSync(probe, '');
  const context = await esbuild.context({
    ...BUILD_OPTIONS,
    entryPoints: [probe],
  });
  const carriers = [];
  try {
    for (const {name, source} of imports) {
      fs.writeFileSync(probe, source);
      const {metafile} = await context.rebuild();
      const [output] = Object.values(metafile.outputs);
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
          chain: importChain(
            metafile,
            path.relative(REPO, probe),
            gestureModules[0][0],
          ),
        });
      }
    }
  } finally {
    await context.dispose();
  }
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
    for (const {path: next} of metafile.inputs[current]?.imports ?? []) {
      if (!previous.has(next) && metafile.inputs[next] != null) {
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
    const inRoot = outputsOf([path.join(CORE_SRC, 'index.ts')]).flatMap(bytes =>
      bytesOf(bytes).map(([input]) => input),
    );
    expect(
      [...new Set(inRoot)]
        .filter(input => !used.has(input))
        .map(input => input.replace('packages/core/src/', '')),
    ).toEqual([]);
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
