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
 *   `import()` does, but for `Item`'s loader for its deprecated swipe props,
 *   the one `import()` of swipe code, which this guard counts out of
 *   `Item`'s import by name; the names that entry gives Lab are not in the
 *   root entry; and what `Item` alone and `ListItem` alone load at once (the
 *   entry output and the chunks it reaches by static import) holds no byte
 *   of a swipe module, while `Item` with `createSwipe` holds them
 * @position Node test over source, so it needs no build. Its build files
 *   live under the repository's `node_modules/.cache`, never the system temp
 *   directory, whose listing esbuild would read for every build
 */

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const REPO = path.resolve(import.meta.dirname, '..');
const CORE_SRC = path.join(REPO, 'packages/core/src');
const require = createRequire(path.join(REPO, 'package.json'));
const esbuild = require('esbuild');

/** The gesture core the internal entry re-exports. */
const PRIMITIVE_INPUT = /^packages\/core\/src\/gestures\//;

/**
 * Where the builds' entry files live: under the repository's
 * `node_modules/.cache`, not the system temp directory. esbuild reads the
 * listing of every directory above each file it bundles, and on a shared
 * machine the temp directory can hold hundreds of thousands of entries, so
 * each build there read that listing first. The run's folder is made in
 * beforeAll, not when the module loads: Vitest skips both hooks when a run
 * filters out every test here.
 */
const CACHE = path.join(
  REPO,
  'node_modules/.cache/astryx-touch-support-bundle',
);
let scratch = '';
beforeAll(() => {
  fs.mkdirSync(CACHE, {recursive: true});
  scratch = fs.mkdtempSync(path.join(CACHE, 'run-'));
});

/**
 * The modules the swipe runs on (`spec:AST-057` FR10): the shared gesture
 * core, the animator, the snap-point drag, the panels' rendering, and the
 * row's gesture code with its UIKit table. The reader of a swipe value and
 * DEP-0017's row style are `Item`'s handoff and deprecated path, not swipe
 * modules.
 */
const SWIPE_MODULE =
  /^packages\/core\/src\/(gestures\/|animator\/|dragToSnapPoints\/|motion\/animator\.ts$|motion\/uikit\/swipeActions\.ts$|Swipe\/(?!swipeHost(\.stylex)?\.ts$))/;

afterAll(() => {
  fs.rmSync(scratch, {recursive: true, force: true});
});

/**
 * The size report's build of a component import (minified ESM for the
 * browser). React and StyleX stay external: they hold no touch code.
 */
const BUILD_OPTIONS = {
  absWorkingDir: REPO,
  // Never written (`write: false`): it only names the outputs.
  outdir: path.join(CACHE, 'out'),
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
 * The one `import()` of swipe code: `Item`'s loader for its deprecated
 * `swipeActions` and `swipeBehavior` (`spec:AST-057` DEP-0017), which loads the
 * gesture the first time a row has them, so an import of `Item` loads none of
 * it at once. Removed with the props (`spec:AST-057` CLN-0025).
 */
const DEPRECATED_SWIPE_LOADER = {
  importer: 'packages/core/src/Item/Item.tsx',
  target: 'packages/core/src/Swipe/SwipeActionsLayer',
};

/**
 * The rest of DEP-0017's deprecated-path exception, beside its loader: the
 * released row style a row given the deprecated `swipeActions` takes from its
 * first render. It holds no gesture code. Removed with the props
 * (`spec:AST-057` CLN-0025).
 */
const DEPRECATED_SWIPE_STYLE = 'packages/core/src/Swipe/swipeHost.stylex';

/**
 * Counts DEP-0017's loader's chunk out of the import that holds the loader, as
 * the size report's code splitting does; every other `import()` stays in.
 */
const DEPRECATED_SWIPE_LOADED_LATER = {
  name: 'deprecated-swipe-loader',
  setup(build) {
    build.onResolve({filter: /SwipeActionsLayer$/}, args =>
      args.kind === 'dynamic-import' &&
      path.relative(REPO, args.importer) === DEPRECATED_SWIPE_LOADER.importer &&
      path.relative(REPO, path.resolve(args.resolveDir, args.path)) ===
        DEPRECATED_SWIPE_LOADER.target
        ? {path: args.path, external: true}
        : undefined,
    );
  },
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

/** The names a build of `entry` exports, read from esbuild's metafile. */
function exportsOf(entry) {
  const result = esbuild.buildSync({...BUILD_OPTIONS, entryPoints: [entry]});
  return Object.values(result.metafile.outputs).flatMap(
    output => output.exports ?? [],
  );
}

/**
 * What the internal entry gives Lab components, none of it public API. Lab's
 * refresh pull reads the pan, its hook, the motion engine, its motion math and
 * companion curves, the scroll view's spring and the motion-role parsers.
 * Other Lab components read the UIKit gesture table, the touch presentation
 * and its query, and an element's direction. Lab's NavigationStack reads the
 * screen-edge pan, the spring solver, the motion resolver, UIKit's
 * navigation table and its four navigation springs. It also reads the focus
 * helpers that follow the last input. Lab components that watch a finger's
 * scroll read the finger-scroll watch. PageControl reads an element's shared
 * animator, the Reduce Motion cross-fade, and the touch hit area's hook and
 * layer. SearchField reads UIKit's timing table.
 */
const LAB_ONLY_NAMES = [
  'PanGestureRecognizer',
  'useGestureRecognizer',
  'useFingerScroll',
  'createMotionEngine',
  'cubicBezier',
  'mapProgress',
  'parseCssEasing',
  'parseMotionRoleValue',
  'rubberBand',
  'rubberBandInverse',
  'rubberBandSlope',
  'scroll',
  'isRtlElement',
  'UIKIT_GESTURES',
  'useTouchPresentation',
  'TOUCH_QUERY',
  'ScreenEdgePanGestureRecognizer',
  'resolveMotion',
  'solveSpring',
  'toSpring',
  'navigation',
  'NAVIGATION_PUSH_SPRING',
  'NAVIGATION_POP_SPRING',
  'NAVIGATION_INTERACTIVE_POP_FINISH_SPRING',
  'NAVIGATION_BAR_ELEMENTS_SPRING',
  'focusForLastInput',
  'isFocusLost',
  'useInteractionModalityTracking',
  'animatorFor',
  'reducedMotionFade',
  'useTouchHitArea',
  'touchHitAreaStyles',
  'measureLogicalScrollAxis',
  'timing',
];

/**
 * The bytes each source module puts in what an import of `entry` loads at
 * once: its entry output and the chunks it reaches by static import, built
 * with the size report's code splitting, so a chunk only an `import()` reaches
 * is left out.
 */
function eagerBytesOf(entry) {
  const {metafile} = esbuild.buildSync({
    ...BUILD_OPTIONS,
    entryPoints: [entry],
    splitting: true,
  });
  const {outputs} = metafile;
  // An import() target is an entry point of its own in the metafile: start
  // from this entry's output only.
  const pending = Object.keys(outputs).filter(
    file => outputs[file].entryPoint === path.relative(REPO, entry),
  );
  expect(pending).toHaveLength(1);
  const eager = new Set();
  while (pending.length > 0) {
    const file = pending.pop();
    if (eager.has(file)) {
      continue;
    }
    eager.add(file);
    for (const {path: next, kind} of outputs[file].imports) {
      if (kind === 'import-statement' && outputs[next] != null) {
        pending.push(next);
      }
    }
  }
  const bytes = {};
  for (const file of eager) {
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
  // AlertDialog: its actions' press, tracked across both for a finger and a
  // pen under the touch presentation.
  'AlertDialog',
  // ButtonGroup: a finger's or a pen's press, tracked across its buttons
  // under the touch presentation.
  'ButtonGroup',
  // ToggleButton: through ToggleButtonGroup, whose toggles' press is tracked
  // across them for a finger and a pen under the touch presentation.
  'ToggleButton',
  // Through AlertDialog: Tokenizer's bottom sheet confirms with an alert, and
  // PowerSearch and Table's filtering render a Tokenizer. Both also reach
  // TimeInput's wheels: PowerSearch's edit popover and Table's filtering.
  'PowerSearch',
  'Table',
  'Tokenizer',
  // Slider's thumb.
  'Slider',
  // Resizable: its drag tracks the release velocity that the lift's close and
  // the handle's spring-back start from.
  'Resizable',
  // Switch: its press tracking and its drag, for every pointer.
  'Switch',
  // SegmentedControl: its press tracking and its drag, for every pointer.
  'SegmentedControl',
  // DateTimeInput: through the SegmentedControl its touch field renders.
  'DateTimeInput',
  // useScrollLock's page hold, and the imports that reach it. The sheet
  // wheels of DateInput, TimeInput and DateTimeInput also drag and tap
  // through the gesture system's pan and tap (DateInput/PickerWheel.tsx).
  'hooks: useScrollLock',
  'AppShell',
  'BottomSheet',
  // Chat: ChatLayout's keyboard dismissal, a pan on its transcript.
  'Chat',
  'CommandPalette',
  'ContextMenu',
  'DateInput',
  'Dialog',
  'Drawer',
  'DropdownMenu',
  'Layer',
  'Lightbox',
  'Markdown',
  'MobileNav',
  'MoreMenu',
  'MultiSelector',
  'Pagination',
  'Popover',
  'Selector',
  'SideNav',
  'TimeInput',
  'TopNav',
  // Toast: its swipe's claim, a one-way pan whose first move decides.
  'Toast',
  // The public pan, which the root's createPanGesture shares.
  'hooks: usePanGesture',
  // The snap-point drag, which moves an element on that pan.
  'hooks: useDragToSnapPoints',
  // Snap paging: the pager, under a finger and on a trackpad swipe. Carousel
  // imports none of it.
  'SnapPaging',
  // Swipe actions: createSwipe brings a row's swipe on that drag
  // (`spec:AST-057` FR10).
  'Swipe',
]);

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
 * chain that brings the first of them. Each import is an entry point of one
 * build: without code splitting, each output holds only what its own entry
 * reaches, so it is that import built on its own, and esbuild builds them all
 * at once instead of one rebuild after another.
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
    plugins: [DEPRECATED_SWIPE_LOADED_LATER],
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

  it('is absent from a component that holds its layer (Layer/inputHold)', () => {
    // A component in the root entry may hold its layer's input statically
    // (a popover's presentation): the hold brings no gesture code with it.
    const holder = entryWith(
      'Holder.ts',
      `import {holdInput} from ${JSON.stringify(
        path.join(CORE_SRC, 'Layer/inputHold.ts'),
      )};
export const Holder = holdInput;
`,
    );
    for (const bytes of outputsOf([holder])) {
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

describe('the swipe modules in bundles (spec:AST-057 FR10)', () => {
  const ITEM = path.join(CORE_SRC, 'Item/Item');
  const LIST_ITEM = path.join(CORE_SRC, 'List/ListItem');
  const CREATE_SWIPE = path.join(CORE_SRC, 'Swipe/createSwipe');

  it.each([
    ['Item', `export {Item} from ${JSON.stringify(ITEM)};`],
    ['ListItem', `export {ListItem} from ${JSON.stringify(LIST_ITEM)};`],
  ])('put no byte in what %s alone loads at once', (name, source) => {
    const bytes = eagerBytesOf(entryWith(`fr10-${name}.ts`, source));
    // The row is in the build, so a swipe module would be found if it were.
    expect(bytes[`${path.relative(REPO, ITEM)}.tsx`]).toBeGreaterThan(0);
    expect(bytesOf(bytes, SWIPE_MODULE)).toEqual([]);
  });

  it('are in what Item with createSwipe loads at once', () => {
    const bytes = eagerBytesOf(
      entryWith(
        'fr10-item-with-create-swipe.ts',
        `export {Item} from ${JSON.stringify(ITEM)};\n` +
          `export {createSwipe} from ${JSON.stringify(CREATE_SWIPE)};`,
      ),
    );
    const swipeModules = bytesOf(bytes, SWIPE_MODULE).map(([input]) => input);
    for (const module of [
      'packages/core/src/Swipe/createSwipe.ts',
      'packages/core/src/Swipe/SwipeActionsLayer.tsx',
      'packages/core/src/Swipe/useSwipeAction.ts',
      'packages/core/src/dragToSnapPoints/createDragToSnapPoints.ts',
      'packages/core/src/motion/animator.ts',
    ]) {
      expect(swipeModules).toContain(module);
    }
    expect(swipeModules.some(input => PRIMITIVE_INPUT.test(input))).toBe(true);
  });
});

describe('the touch module internals', () => {
  it('are built from files under the repository, not the system temp directory', () => {
    expect(path.relative(REPO, scratch).split(path.sep)[0]).toBe(
      'node_modules',
    );
  });

  it('give Lab names that the public entry does not export', () => {
    const internal = new Set(
      exportsOf(path.join(CORE_SRC, 'internal/touch.ts')),
    );
    const root = new Set(exportsOf(path.join(CORE_SRC, 'index.ts')));
    // The root build reads its exports: a public component is among them.
    expect(root.has('Button')).toBe(true);
    expect(LAB_ONLY_NAMES.filter(name => !internal.has(name))).toEqual([]);
    expect(LAB_ONLY_NAMES.filter(name => root.has(name))).toEqual([]);
  }, 120_000);

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

  it('reach Core only through DEP-0017\u2019s loader by import(): the one loader of swipe code', () => {
    const loaders = filesUnder(CORE_SRC, /\.(ts|tsx)$/)
      .filter(file => !/\.(test|spec)\.(ts|tsx)$|__tests__/.test(file))
      .flatMap(file =>
        [
          ...fs
            .readFileSync(file, 'utf8')
            .matchAll(/\bimport\(\s*['"]([^'"]+)['"]/g),
        ].map(([, specifier]) => [
          path.relative(REPO, file),
          path.relative(REPO, path.resolve(path.dirname(file), specifier)),
        ]),
      )
      .filter(([, target]) => target.startsWith('packages/core/src/Swipe/'));
    expect(loaders).toEqual([
      [DEPRECATED_SWIPE_LOADER.importer, DEPRECATED_SWIPE_LOADER.target],
    ]);
  });

  it('reach a Core component from swipe actions only through the reader of a swipe value and DEP-0017\u2019s row style', () => {
    const imports = filesUnder(CORE_SRC, /\.(ts|tsx)$/)
      .filter(file => !/\.(test|spec)\.(ts|tsx)$|__tests__/.test(file))
      .filter(file => {
        const own = path.relative(CORE_SRC, file);
        return !own.startsWith(`Swipe${path.sep}`) && own !== 'index.ts';
      })
      .flatMap(file =>
        [
          ...fs
            .readFileSync(file, 'utf8')
            .matchAll(/^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm),
        ].map(([, specifier]) => [
          path.relative(REPO, file),
          path.relative(REPO, path.resolve(path.dirname(file), specifier)),
        ]),
      )
      .filter(([, target]) => target.startsWith('packages/core/src/Swipe/'));
    expect(imports).toEqual([
      [DEPRECATED_SWIPE_LOADER.importer, 'packages/core/src/Swipe/swipeHost'],
      [DEPRECATED_SWIPE_LOADER.importer, DEPRECATED_SWIPE_STYLE],
      // ListItem keys its swipe value for its Item; it reads the value only.
      [
        'packages/core/src/List/ListItem.tsx',
        'packages/core/src/Swipe/swipeHost',
      ],
    ]);
  });
});
