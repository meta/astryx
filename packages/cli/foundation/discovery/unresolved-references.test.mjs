// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file unresolvedReference() and unresolvedGlobals(): each kind of
 * reference the compiler cannot resolve, how far the walk follows, and which
 * declaration files and type packages start the global walk.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {readPackageTsconfig} from './package-tsconfig.mjs';
import {
  unresolvedGlobals,
  unresolvedReference,
} from './unresolved-references.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** @type {string} */
let root;

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-unresolved-')),
  );
});

afterEach(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

/**
 * @param {string} rel
 * @param {string | object} content
 */
function write(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(
    file,
    typeof content === 'string' ? content : JSON.stringify(content),
  );
  return file;
}

const OPTIONS = {
  strict: true,
  jsx: 'react-jsx',
  module: 'esnext',
  moduleResolution: 'bundler',
  target: 'es2022',
};

/**
 * A program over the given sources and the declaration files the package's
 * config includes, as the props comparison builds it.
 * @param {string} packageDir
 * @param {string[]} sources
 * @param {object} [extra] compiler options to add
 */
function load(packageDir, sources, extra = {}) {
  const project = readPackageTsconfig(ts, packageDir, sources);
  const options = {...project.options, ...extra};
  const program = ts.createProgram({
    rootNames: [...sources, ...project.declarations],
    options,
  });
  /** @type {(file: string) => boolean} */
  const isOwnFile = file => {
    const rel = path.relative(packageDir, fs.realpathSync(file));
    return (
      !rel.startsWith('..') && !rel.split(path.sep).includes('node_modules')
    );
  };
  return {
    project,
    options,
    program,
    checker: program.getTypeChecker(),
    isOwnFile,
  };
}

/** @param {string} dir */
function dependency(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    write(path.join(dir, name), content);
  }
}

describe('unresolvedReference', () => {
  it('finds the first reference that does not resolve, and follows only where told', () => {
    write('tsconfig.json', {compilerOptions: OPTIONS});
    write('src/theme.ts', 'export interface Theme { tone?: string }\n');
    write('src/x.ts', 'export const fmt = 1;\n');
    write(
      'src/defaults-src.ts',
      'declare const theme: {colors: {}};\nexport const defaults = {...theme.sizes};\n',
    );
    write(
      'src/x-values.ts',
      'export interface Theme { tone?: string }\nexport const fmt = (s: string) => s;\n',
    );
    dependency('node_modules/untyped-dep', {
      'package.json': {name: 'untyped-dep', main: 'index.js'},
      'index.js': 'export const fmt = text => text;\n',
    });
    dependency('node_modules/@acme/dep', {
      'package.json': {name: '@acme/dep', types: 'index.d.ts'},
      'index.d.ts':
        "import type {Peer} from '@acme/not-installed-peer';\nexport type Dep = Peer;\n",
    });
    const cases = {
      'missing.ts':
        "import type {X} from '@acme/not-installed';\nexport type Y = X;\n",
      'unnamed.ts':
        "import type {Gone} from './theme';\nexport type Y = Gone;\n",
      'reexport.ts': "export {fmt, gone} from './x';\n",
      'types.ts': '/// <reference types="@acme/missing-types" />\nexport {};\n',
      'path.ts':
        '/// <reference path="./generated/augment.d.ts" />\nexport {};\n',
      'effect.ts': "import '@acme/not-installed-effect';\nexport {};\n",
      'untyped.ts': "import {fmt} from 'untyped-dep';\nexport const y = fmt;\n",
      'jsx.tsx': 'export const A = () => <div />;\n',
      'dep.ts': "import type {Dep} from '@acme/dep';\nexport type Y = Dep;\n",
      // Type names declared nowhere, which only `keyof`, a key or a query
      // may reach; and names that resolve.
      'keyed.ts':
        'export type Y = Omit<{label: string; size?: number}, keyof NowhereProps>;\n',
      'template.ts':
        'export type Y = {[K in `on${NowhereKey}`]?: () => void};\n',
      'query.ts': 'export type Y = Parameters<typeof nowhereHook>[0];\n',
      // A value declared nowhere behind a binding, a property that doesn't
      // exist, and a name declared nowhere in a JavaScript file's JSDoc.
      'valued.ts':
        'const d = missingValue;\nexport type Y = Omit<{label: string; size?: number}, keyof typeof d>;\n',
      'indexed.ts':
        "interface Theme { colors: {a: string} }\nexport type Y = Partial<Record<keyof Theme['sizes'], string>>;\n",
      'jsdoc.js':
        '/** @param {Omit<{label: string; size?: number}, keyof NowhereJs>} props */\nexport function J(props) { return null; }\n',
      // Tags whose types the compiler never reads.
      'jsdoctags.js':
        '/**\n * @param {{label: string}} props\n * @throws {HttpError} when offline\n * @exception {NowhereError}\n * @see NowhereGuide\n * @see {@link NowhereLink}\n */\nexport function T(props) { return null; }\n',
      // A class's base that names nothing, written or in `@augments`, and
      // one that names a class.
      'baseless.ts':
        'export class X extends NowhereBase<{label?: string}> {}\n',
      'baselessjs.js':
        'class Real {}\n/** @augments {NowhereBase} */\nexport class X extends Real {}\n',
      'augments.js':
        'class Real {}\n/** @augments {Real} */\nexport class X extends Real {}\n',
      // A class's base is a value, and a module found without types gives
      // its names no types to resolve.
      'classbase.ts':
        'class Real<P> { props!: P }\nconst Base = Real;\nexport class X extends Base<{label?: string}> {}\nexport function mixin(B: typeof Real) { return class extends B {}; }\n',
      // A value the compiler can't type, spread into an object, makes it
      // `any`, so `keyof typeof` it takes any name.
      'spread.ts':
        'interface Theme { colors: {a: string} }\ndeclare const theme: Theme;\nconst defaults = {...theme.sizes};\nexport type Y = Omit<{label: string; size?: number}, keyof typeof defaults>;\n',
      'spreadname.ts':
        'const tones = {...undeclaredTones};\nexport type Y = Partial<Record<keyof typeof tones, string>>;\n',
      // The same from another file of the package's, and a line that
      // `@ts-expect-error` covers, which `tsc` accepts.
      'crossfile.ts':
        "import {defaults} from './defaults-src';\nexport type Y = keyof typeof defaults;\n",
      'suppressed.ts':
        'declare const theme: {colors: {}};\nconst defaults = {\n  // @ts-expect-error -- older themes have sizes\n  ...theme.sizes,\n};\nexport type Y = keyof typeof defaults;\n',
      // What an own function returns is read too.
      'called.ts':
        'function makeSlots() { return {...undeclaredSlots}; }\nconst slots = makeSlots();\nexport type Y = keyof typeof slots;\n',
      // `tsc` reports no error in a `@ts-nocheck` file, or on a later line
      // `@ts-expect-error` covers, or (without `noImplicitAny`) for an index
      // that misses.
      'nocheck.ts':
        '// @ts-nocheck\ndeclare const theme: {colors: {}};\nconst defaults = {...theme.sizes};\nexport type Y = keyof typeof defaults;\n',
      'laterline.ts':
        'declare const theme: {colors: {}};\nconst defaults = {\n  ...theme\n    // @ts-expect-error -- older themes have sizes\n    .sizes,\n};\nexport type Y = keyof typeof defaults;\n',
      'indexmiss.ts':
        "const COLORS = {red: '#f00'};\nfunction Base(props: {tone: string}) { const color = COLORS[props.tone]; return color; }\nexport type P = Parameters<typeof Base>[0];\n",
      // A function passed to another, and a class field.
      'wrapped.ts':
        'function lazy<T>(make: () => T): T { return make(); }\nfunction makeSlots() { return {...undeclaredSlots}; }\nconst slots = lazy(makeSlots);\nexport type Y = keyof typeof slots;\n',
      'classfield.ts':
        "class Store { slots = {...undeclaredSlots}; }\nexport type Y = keyof InstanceType<typeof Store>['slots'];\n",
      // A written return type, overloads, and a call made for its effect
      // decide nothing about the type, whatever the body holds.
      'declaredreturn.ts':
        'function makeSlots(): {a?: number} { const broken = undeclaredThing; return {}; }\nconst slots = makeSlots();\nexport type Y = keyof typeof slots;\n',
      'overloaded.ts':
        'function make(): {a?: number};\nfunction make(x?: number) { return {...undeclaredA}; }\nconst made = make();\nexport type Y = keyof typeof made;\n',
      'statement.ts':
        'function track() { undeclaredLogger.log(); }\nfunction Base(props: {tone?: string}) { track(); return null; }\nexport type P = Parameters<typeof Base>[0];\n',
      // A class's instance type is inferred from its members too, wherever
      // a type names the class.
      'classbyname.ts':
        "class Store { slots = {...undeclaredSlots}; }\nexport type Y = keyof Store['slots'];\n",
      'classgetter.ts':
        "class Store { get slots() { return {...undeclaredSlots}; } }\nexport type Y = keyof Store['slots'];\n",
      'extendscall.ts':
        "function mixin() { return class { slots = {...undeclaredSlots}; }; }\nclass Store extends mixin() {}\nexport type Y = keyof Store['slots'];\n",
      'interfaceextends.ts':
        "class Store { slots = {...undeclaredSlots}; }\ninterface Holder extends Store {}\nexport type Y = keyof Holder['slots'];\n",
      // A class named only as a whole: its names are its written members
      // and its base, so a broken member elsewhere in it decides nothing.
      'classmember.ts':
        'class Widget { state = {...undeclaredState}; }\nexport type P = {onReady?: (widget: Widget) => void};\n',
      'componentbase.ts':
        "declare class Component<P> { props: P }\nclass Base<P> extends Component<P> { broken = {...undeclaredBroken}; }\nexport class AcmeX extends Base<{tone?: string}> {}\nexport type P = AcmeX['props'];\n",
      // A base built by a call gives the class names of its own.
      'computedbase.ts':
        'function makeBase() { return undeclaredBase; }\nclass Store extends makeBase() {}\nexport type Y = keyof Store;\n',
      // A cast that writes the type decides it; `as const` does not.
      'cast.ts':
        'const slots = {...undeclaredSlots} as {a?: number};\nexport type Y = keyof typeof slots;\n',
      'castconst.ts':
        'const slots = {...undeclaredSlots} as const;\nexport type Y = keyof typeof slots;\n',
      // An instantiation expression takes type arguments for a value.
      'instantiation.ts':
        'function select<T>(value: T) { return value; }\nexport const selectString = select<string>;\nexport type S = typeof selectString;\n',
      'untypedq.ts':
        "import {fmt} from 'untyped-dep';\nexport type F = typeof fmt;\nexport type G = typeof import('untyped-dep').fmt;\n",
      // TypeScript reads no types from a `.ts` file's JSDoc.
      'tsdoc.ts':
        '/** @param {NowhereDoc} x */\nexport function g(x: string) { return x; }\n',
      // Values that resolve, and names that are not read as values.
      'values.ts':
        "import {type Theme, fmt} from './x-values';\nconst base = {a: 1};\nexport const merged = {...base, b: [1].length, c: Math.max(1, 2), fmt};\nexport type V = Theme;\n",
      'known.ts':
        "import type {Theme} from './theme';\nexport type Y<T> = {[K in keyof T]: Theme} & Partial<Record<'a', string>>;\nexport const sizes = ['sm', 'md'] as const;\nexport type W = Window & typeof globalThis;\nexport type G = keyof typeof globalThis;\nexport type U = typeof undefined;\nexport function f() { type A = typeof arguments; return 1; }\nexport type T = Theme['tone'];\n",
    };
    const sources = Object.entries(cases).map(([name, text]) =>
      write(path.join('src', name), text),
    );
    const {program, checker, isOwnFile} = load(root, sources, {allowJs: true});
    /** @type {(name: string, follow?: (file: string) => boolean, mine?: (file: string) => boolean) => string | undefined} */
    const first = (name, follow = () => true, mine = isOwnFile) =>
      unresolvedReference(
        ts,
        program,
        checker,
        [program.getSourceFile(path.join(root, 'src', name))],
        follow,
        mine,
      )?.name;

    expect(first('missing.ts')).toBe('`@acme/not-installed`');
    expect(first('unnamed.ts')).toBe('`Gone` from `./theme`');
    expect(first('reexport.ts')).toBe('`gone` from `./x`');
    expect(first('types.ts')).toBe('the types `@acme/missing-types`');
    expect(first('path.ts')).toBe('`./generated/augment.d.ts`');
    // TypeScript 6 checks a side-effect import by default.
    expect(first('effect.ts')).toBe('`@acme/not-installed-effect`');
    // A module found without types resolves, and so does the JSX runtime
    // import the compiler adds itself.
    expect(first('untyped.ts')).toBeUndefined();
    expect(first('jsx.tsx')).toBeUndefined();
    // A dependency's own missing import, where the walk follows it; where it
    // doesn't, the type that import leaves untyped in the package's own file.
    expect(first('dep.ts')).toBe('`@acme/not-installed-peer`');
    expect(first('dep.ts', isOwnFile)).toBe('`Dep`');
    expect(first('keyed.ts')).toBe('`NowhereProps`');
    expect(first('template.ts')).toBe('`NowhereKey`');
    expect(first('query.ts')).toBe('`typeof nowhereHook`');
    expect(first('valued.ts')).toBe('`typeof d`');
    expect(first('indexed.ts')).toBe("`Theme['sizes']`");
    expect(first('jsdoc.js')).toBe('`NowhereJs`');
    expect(first('jsdoctags.js')).toBeUndefined();
    expect(first('tsdoc.ts')).toBeUndefined();
    expect(first('classbase.ts')).toBeUndefined();
    expect(first('baseless.ts')).toBe('`NowhereBase`');
    expect(first('baselessjs.js')).toBe('`NowhereBase`');
    expect(first('augments.js')).toBeUndefined();
    expect(first('untypedq.ts')).toBeUndefined();
    expect(first('instantiation.ts')).toBeUndefined();
    expect(first('spread.ts')).toBe('`theme.sizes`');
    expect(first('spreadname.ts')).toBe('`undeclaredTones`');
    expect(first('values.ts')).toBeUndefined();
    expect(first('crossfile.ts')).toBe('`theme.sizes`');
    expect(first('suppressed.ts')).toBeUndefined();
    expect(first('called.ts')).toBe('`undeclaredSlots`');
    expect(first('wrapped.ts')).toBe('`undeclaredSlots`');
    expect(first('classfield.ts')).toBe('`undeclaredSlots`');
    expect(first('declaredreturn.ts')).toBeUndefined();
    expect(first('overloaded.ts')).toBeUndefined();
    expect(first('statement.ts')).toBeUndefined();
    for (const file of [
      'classbyname.ts',
      'classgetter.ts',
      'extendscall.ts',
      'interfaceextends.ts',
      'castconst.ts',
    ]) {
      expect.soft(first(file), file).toBe('`undeclaredSlots`');
    }
    expect(first('cast.ts')).toBeUndefined();
    expect(first('computedbase.ts')).toBe('`undeclaredBase`');
    expect.soft(first('classmember.ts'), 'classmember.ts').toBeUndefined();
    expect.soft(first('componentbase.ts'), 'componentbase.ts').toBeUndefined();
    expect(first('nocheck.ts')).toBeUndefined();
    expect(first('laterline.ts')).toBeUndefined();
    // With `noImplicitAny` the index miss is an error `tsc` reports.
    expect(first('indexmiss.ts')).toBe('`COLORS[props.tone]`');
    const loose = load(root, sources, {strict: false, noImplicitAny: false});
    expect(
      unresolvedReference(
        ts,
        loose.program,
        loose.checker,
        [loose.program.getSourceFile(path.join(root, 'src', 'indexmiss.ts'))],
        () => true,
        loose.isOwnFile,
      ),
    ).toBeNull();
    expect(first('known.ts')).toBeUndefined();
    // Only in the files the caller checks names in.
    expect(
      first(
        'keyed.ts',
        () => true,
        () => false,
      ),
    ).toBeUndefined();

    const unchecked = load(root, sources, {
      noUncheckedSideEffectImports: false,
    });
    expect(
      unresolvedReference(
        ts,
        unchecked.program,
        unchecked.checker,
        [unchecked.program.getSourceFile(path.join(root, 'src', 'effect.ts'))],
        () => true,
        () => true,
      ),
    ).toBeNull();
  });

  it('gives each root the same answer, whatever an earlier call on the same program read', () => {
    write('tsconfig.json', {compilerOptions: OPTIONS});
    const header = write(
      'src/CardHeader.ts',
      'declare const theme: {colors: {}};\nexport const defaults = {...theme.sizes};\nexport type HeaderKeys = keyof typeof defaults;\n',
    );
    const card = write(
      'src/Card.ts',
      "import {defaults} from './CardHeader';\nexport type CardKeys = keyof typeof defaults;\n",
    );
    for (const order of [
      [card, header],
      [header, card],
    ]) {
      const {program, checker, isOwnFile} = load(root, [card, header]);
      const answers = order.map(
        file =>
          unresolvedReference(
            ts,
            program,
            checker,
            [program.getSourceFile(file)],
            () => true,
            isOwnFile,
          )?.name,
      );
      expect(answers).toEqual(['`theme.sizes`', '`theme.sizes`']);
    }
  });
});

describe('unresolvedGlobals', () => {
  it("starts from each declaration file the package's own config includes, wherever it sits, and from its own type packages", () => {
    const widgets = path.join(root, 'packages', 'widgets');
    const source = write(
      'packages/widgets/src/Badge.tsx',
      'export function Badge(props: {label?: string}) { return null; }\n',
    );
    dependency('packages/widgets/node_modules/@types/dep-globals', {
      'package.json': {name: '@types/dep-globals', types: 'index.d.ts'},
      'index.d.ts':
        '/// <reference types="@acme/not-installed-runner" />\ndeclare var depGlobal: string;\n',
    });
    /** @type {(config: object) => import('./unresolved-references.mjs').UnresolvedReference | null} */
    const globals = config => {
      write('packages/widgets/tsconfig.json', config);
      const {project, options, program, checker, isOwnFile} = load(widgets, [
        source,
      ]);
      return unresolvedGlobals(
        ts,
        program,
        checker,
        project.declarations,
        options,
        isOwnFile,
      );
    };

    // A declaration file outside the package that its own config includes.
    write(
      'shared/globals.d.ts',
      '/// <reference types="@acme/not-installed-css" />\ndeclare var shared: string;\n',
    );
    expect(
      globals({compilerOptions: OPTIONS, include: ['src', '../../shared']}),
    ).toMatchObject({name: 'the types `@acme/not-installed-css`'});

    // The package's own type package, named in `types`.
    write(
      'packages/widgets/types/css-prop/index.d.ts',
      '/// <reference types="@acme/not-installed-css" />\ndeclare var cssProp: string;\n',
    );
    const typeRoots = ['./types', './node_modules/@types'];
    expect(
      globals({
        compilerOptions: {...OPTIONS, typeRoots, types: ['css-prop']},
        include: ['src'],
      }),
    ).toMatchObject({name: 'the types `@acme/not-installed-css`'});
    // With `types` unset TypeScript 5 loads every package in `typeRoots`, as
    // TypeScript 6 does for `types: ['*']`, so they are walked then too.
    const ts5 = new Proxy(ts, {
      get: (target, key) =>
        key === 'getAutomaticTypeDirectiveNames'
          ? (/** @type {any} */ options, /** @type {any} */ host) =>
              target.getAutomaticTypeDirectiveNames(
                {...options, types: options.types ?? ['*']},
                host,
              )
          : target[key],
    });
    write('packages/widgets/tsconfig.json', {
      compilerOptions: {...OPTIONS, typeRoots},
      include: ['src'],
    });
    const five = load(widgets, [source], {types: ['*']});
    expect(
      unresolvedGlobals(
        ts5,
        five.program,
        five.checker,
        five.project.declarations,
        {...five.options, types: undefined},
        five.isOwnFile,
      ),
    ).toMatchObject({name: 'the types `@acme/not-installed-css`'});

    // A module declaration file no component imports declares no globals,
    // so a package only it imports is not followed; one that augments a
    // module, or imports one for its effects, is.
    write(
      'packages/widgets/src/api.d.ts',
      "import type {Client} from '@acme/not-installed-client';\nexport type Api = Client;\n",
    );
    expect(globals({compilerOptions: OPTIONS, include: ['src']})).toBeNull();
    write(
      'packages/widgets/src/api.d.ts',
      "import type {Client} from '@acme/not-installed-client';\ndeclare module '@acme/ui' { interface Theme { client?: Client } }\nexport {};\n",
    );
    expect(globals({compilerOptions: OPTIONS, include: ['src']})).toMatchObject(
      {name: '`@acme/not-installed-client`'},
    );
    for (const loads of [
      "import '@acme/not-installed-css-prop';",
      "import {} from '@acme/not-installed-css-prop';",
      "import type {} from '@acme/not-installed-css-prop';",
      "export * from '@acme/not-installed-css-prop';",
    ]) {
      write('packages/widgets/src/api.d.ts', `${loads}\nexport {};\n`);
      expect(
        globals({compilerOptions: OPTIONS, include: ['src']}),
      ).toMatchObject({name: '`@acme/not-installed-css-prop`'});
    }
    // `export * as` binds the module's names under one, as `import * as`
    // does, so it doesn't act globally.
    for (const binds of [
      "import * as legacy from '@acme/removed-package';",
      "export * as legacy from '@acme/removed-package';",
    ]) {
      write('packages/widgets/src/api.d.ts', `${binds}\nexport {};\n`);
      expect(globals({compilerOptions: OPTIONS, include: ['src']})).toBeNull();
    }

    // A UMD declaration file declares a global namespace for its module.
    write(
      'packages/widgets/src/api.d.ts',
      "import type {Theme} from '@acme/not-installed-theme';\nexport interface Props { theme?: Theme }\nexport as namespace AcmeLib;\n",
    );
    expect(globals({compilerOptions: OPTIONS, include: ['src']})).toMatchObject(
      {name: '`@acme/not-installed-theme`'},
    );
    fs.rmSync(path.join(widgets, 'src', 'api.d.ts'));

    // A type name declared nowhere, in the package's own declaration file.
    write(
      'packages/widgets/src/names.d.ts',
      'type AcmeOmitted = Omit<{label: string}, keyof NowhereProps>;\n',
    );
    expect(globals({compilerOptions: OPTIONS, include: ['src']})).toMatchObject(
      {name: '`NowhereProps`', how: 'used'},
    );
    fs.rmSync(path.join(widgets, 'src', 'names.d.ts'));

    // A type package the config names that cannot be found.
    expect(
      globals({
        compilerOptions: {...OPTIONS, types: ['@acme/not-installed-globals']},
        include: ['src'],
      }),
    ).toEqual({
      name: 'the types `@acme/not-installed-globals`',
      file: path.join(widgets, 'tsconfig.json'),
      how: 'named',
    });

    // A dependency's type package is not followed, named, under `*`, or
    // referenced from the package's own declaration file.
    for (const types of [['dep-globals'], ['*']]) {
      expect(
        globals({compilerOptions: {...OPTIONS, types}, include: ['src']}),
      ).toBeNull();
    }
    write(
      'packages/widgets/src/env.d.ts',
      '/// <reference types="dep-globals" />\ndeclare var env: string;\n',
    );
    expect(globals({compilerOptions: OPTIONS, include: ['src']})).toBeNull();
  });

  it("starts only from the package's own declaration files for a config from above it", () => {
    // A monorepo's root config includes every file in the repository.
    write('tsconfig.json', {compilerOptions: OPTIONS});
    write(
      'types/global.d.ts',
      "import type {Props} from '@acme/not-installed';\ndeclare global { type RepoProps = Props; }\n",
    );
    const widgets = path.join(root, 'packages', 'widgets');
    const source = write(
      'packages/widgets/src/Badge.tsx',
      'export function Badge(props: {label?: string}) { return null; }\n',
    );
    const read = () => {
      const {project, options, program, checker, isOwnFile} = load(widgets, [
        source,
      ]);
      return unresolvedGlobals(
        ts,
        program,
        checker,
        project.declarations,
        options,
        isOwnFile,
      );
    };

    expect(read()).toBeNull();

    write(
      'packages/widgets/src/env.d.ts',
      "import type {Env} from '@acme/not-installed-env';\ndeclare global { type WidgetEnv = Env; }\n",
    );
    expect(read()).toMatchObject({name: '`@acme/not-installed-env`'});
  });
});
