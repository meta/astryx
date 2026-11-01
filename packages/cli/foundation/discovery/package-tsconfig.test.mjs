// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file readPackageTsconfig(): the package's own config, a solution-style
 * config's references, a monorepo root's config for a local package but not
 * an app's above an installed one, ambient declaration files, and a config
 * with errors.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {readPackageTsconfig} from './package-tsconfig.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/** @type {string} */
let root;

beforeEach(() => {
  root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-tsconfig-')),
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

const OPTIONS = {strict: true, jsx: 'react-jsx', paths: {'@/*': ['./src/*']}};

describe('readPackageTsconfig', () => {
  it('reads defaults without a config, and the config the package has, with the declaration files it includes', () => {
    const source = write('src/Button.tsx', 'export {};\n');
    const defaults = readPackageTsconfig(ts, root, [source]);
    expect(defaults.options).toMatchObject({
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      noEmit: true,
    });
    expect(defaults.declarations).toEqual([]);
    expect(defaults.error).toBeUndefined();

    write('tsconfig.json', {
      compilerOptions: OPTIONS,
      include: ['src', 'types'],
    });
    const ambient = write('types/ambient.d.ts', 'interface A {}\n');
    const global = write('src/global.ts', 'declare global {}\nexport {};\n');
    // A script (no import or export) declares globals too, an `export`
    // inside its namespace included.
    const script = write('types/props.ts', 'interface ScriptProps {}\n');
    const namespace = write(
      'types/acme.ts',
      'declare namespace Acme {\n  export interface Props {}\n}\n',
    );
    write('src/module.ts', 'export interface ModuleProps {}\n');

    const own = readPackageTsconfig(ts, root, [source]);

    expect(own.options.paths).toEqual(OPTIONS.paths);
    expect(own.declarations.sort()).toEqual(
      [global, ambient, script, namespace].sort(),
    );
  });

  it("follows a solution-style config's references, at any depth and through a cycle, to the config that includes the sources", () => {
    const source = write('src/Button.tsx', 'export {};\n');
    const chain = [
      'tsconfig.json',
      'l1.json',
      'l2.json',
      'l3.json',
      'l4.json',
      'l5.json',
    ];
    chain.forEach((file, i) =>
      write(file, {
        files: [],
        // Each level also refers back to the root, a cycle tsc rejects but
        // the walk must not loop on.
        references: [
          {path: `./${chain[i + 1] ?? 'app.json'}`},
          {path: './tsconfig.json'},
        ],
      }),
    );
    write('app.json', {compilerOptions: OPTIONS, include: ['src']});

    const project = readPackageTsconfig(ts, root, [source]);

    expect(project.error).toBeUndefined();
    expect(project.options.paths).toEqual(OPTIONS.paths);

    // A reference that is missing or doesn't parse, when no config includes
    // the sources, is the project's error, as `tsc` reports it.
    write('tsconfig.json', {files: [], references: [{path: './gone.json'}]});
    expect(readPackageTsconfig(ts, root, [source]).error).toMatch(
      /^gone\.json: .*gone\.json/,
    );
    write('broken.json', '{"compilerOptions": ');
    write('tsconfig.json', {files: [], references: [{path: './broken.json'}]});
    expect(readPackageTsconfig(ts, root, [source]).error).toMatch(
      /^broken\.json: /,
    );
  });

  it("reads a monorepo root's config for a local package, and not an app's config for a package installed below it", () => {
    write('tsconfig.json', {compilerOptions: OPTIONS});
    const local = path.join(root, 'packages', 'local');
    const installed = path.join(root, 'node_modules', '@acme', 'widgets');
    const localSource = write('packages/local/src/Button.tsx', 'export {};\n');
    const installedSource = write(
      'node_modules/@acme/widgets/src/Button.tsx',
      'export {};\n',
    );

    expect(readPackageTsconfig(ts, local, [localSource]).options.paths).toEqual(
      OPTIONS.paths,
    );
    expect(
      readPackageTsconfig(ts, installed, [installedSource]).options.paths,
    ).toBeUndefined();
  });

  it('reports a config with errors instead of reading defaults', () => {
    const source = write('src/Button.tsx', 'export {};\n');
    write('tsconfig.json', {files: ['src/Button.tsx', 'src/missing.ts']});
    expect(readPackageTsconfig(ts, root, [source]).error).toMatch(
      /^tsconfig\.json: .*src\/missing\.ts.* not found/,
    );

    write('tsconfig.json', {extends: './missing-base.json'});
    expect(readPackageTsconfig(ts, root, [source]).error).toMatch(
      /^tsconfig\.json: .*missing-base\.json/,
    );

    write('tsconfig.json', '{"compilerOptions": ');
    expect(readPackageTsconfig(ts, root, [source]).error).toMatch(
      /^tsconfig\.json: /,
    );
  });

  it('reads each `files` entry as `tsc` finds it', () => {
    const source = write('src/Button.tsx', 'export {};\n');
    write('src/Card.ts', 'export {};\n');
    write('types/globals.ts', 'interface AcmeGlobal { tone?: string }\n');
    write('configs/base.json', {files: ['${configDir}/src/Button.tsx']});
    /** @type {(config: object) => any} */
    const read = config => {
      write('tsconfig.json', {compilerOptions: OPTIONS, ...config});
      return readPackageTsconfig(ts, root, [source]);
    };

    // `${configDir}`, written in the package's config or in a shared base it
    // extends, and an entry without its extension compile with `tsc -p`.
    expect(
      read({files: ['${configDir}/src/Button.tsx']}).error,
    ).toBeUndefined();
    expect(read({extends: './configs/base.json'}).error).toBeUndefined();
    const bare = read({files: ['src/Button', 'src/Card', 'types/globals']});
    expect(bare.error).toBeUndefined();
    expect(bare.declarations).toEqual([path.join(root, 'types', 'globals.ts')]);

    // An entry `tsc` can't find is an error: a missing file (TS6053), and a
    // folder (TS6231).
    expect(read({files: ['src/Button.tsx', 'src/gone.ts']}).error).toMatch(
      /^tsconfig\.json: File 'src\/gone\.ts' not found\.$/,
    );
    expect(read({files: ['src']}).error).toMatch(
      /^tsconfig\.json: Could not resolve the path 'src' with the extensions/,
    );
  });

  it('reports only a missing `files` entry, not a file the `include` matched that is gone by the time it is read', () => {
    const source = write('src/Button.tsx', 'export {};\n');
    write('tsconfig.json', {compilerOptions: OPTIONS, include: ['src']});
    // A file another process writes and removes while the config is read.
    const gone = path.join(root, 'src', 'gone.ts');
    const racing = {
      ...ts,
      sys: {
        ...ts.sys,
        readDirectory: (/** @type {any[]} */ ...args) => [
          ...ts.sys.readDirectory(...args),
          gone,
        ],
      },
    };

    expect(readPackageTsconfig(racing, root, [source]).error).toBeUndefined();
  });
});
