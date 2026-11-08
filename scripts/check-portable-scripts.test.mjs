// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-portable-scripts.test.mjs
 * Unit tests for the Windows-portability guard, plus the #3637 regression it
 * was written for.
 *
 * The detection rules are exercised against fixtures, not just the repo: a
 * guard that scans the wrong thing passes exactly like one that works. The
 * last block then runs those rules over the real tracked package.json files,
 * so the rules and the data they are pointed at are both covered.
 */

import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {
  findOffences,
  trackedPackageJsonFiles,
} from './check-portable-scripts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const details = offences => offences.map(o => o.detail);

describe('findOffences — POSIX-only commands', () => {
  it('flags `rm -rf dist`, which cmd.exe cannot run', () => {
    expect(findOffences({build: 'rm -rf dist'})).toEqual([
      {name: 'build', detail: expect.stringContaining('POSIX-only command')},
    ]);
  });

  it('flags a POSIX command anywhere in the chain, not just at the head', () => {
    expect(findOffences({build: 'tsc && rm -rf tmp'})).toHaveLength(1);
    expect(findOffences({clean: 'node a.mjs; cp x y'})).toHaveLength(1);
  });

  it('does not flag a command that merely starts with those letters', () => {
    // `rimraf` starts with "rm"'s letters, and `concat` with "cat"'s.
    expect(
      findOffences({build: 'rimraf dist', gen: 'concat a b'}, {rimraf: '^6'}),
    ).toEqual([]);
  });

  it('allows `mkdir` (cmd.exe has it) but not `mkdir -p` (it does not)', () => {
    expect(findOffences({a: 'mkdir dist'})).toEqual([]);
    expect(findOffences({a: 'mkdir -p dist/nested'})).toHaveLength(1);
  });
});

describe('findOffences — single-quoted args', () => {
  it('flags the babel glob that silently matched nothing on cmd.exe', () => {
    const offences = findOffences({
      'build:esm': "babel src --extensions '.ts,.tsx'",
    });
    expect(details(offences)).toEqual([
      expect.stringContaining('single-quoted arg'),
    ]);
  });

  it('accepts the double-quoted form both shells strip', () => {
    expect(
      findOffences({'build:esm': 'babel src --ignore "**/*.test.ts"'}),
    ).toEqual([]);
  });

  it('accepts single quotes nested inside a double-quoted arg', () => {
    // cmd.exe hands `console.log('x')` to node intact — not the bug.
    expect(findOffences({probe: `node -e "console.log('x')"`})).toEqual([]);
  });

  it('reports one offence per script, however many quoted args it has', () => {
    const offences = findOffences({
      dev: "babel src --extensions '.ts,.tsx' --out-file-extension '.js'",
    });
    expect(offences).toHaveLength(1);
  });
});

describe('findOffences — rimraf must be declared', () => {
  it('flags a script that calls rimraf without the devDependency', () => {
    expect(details(findOffences({build: 'rimraf dist'}))).toEqual([
      'calls `rimraf` without declaring it as a devDependency',
    ]);
  });

  it('accepts it once declared', () => {
    expect(findOffences({build: 'rimraf dist'}, {rimraf: '^6.0.1'})).toEqual(
      [],
    );
  });
});

describe('findOffences — degenerate input', () => {
  it('returns nothing for a package with no scripts block', () => {
    expect(findOffences(undefined, undefined)).toEqual([]);
    expect(findOffences({})).toEqual([]);
  });

  it('reports every offence in a script that has more than one', () => {
    const offences = findOffences({build: "rm -rf dist && babel src -x '.ts'"});
    expect(offences).toHaveLength(2);
  });
});

describe('the repo itself (#3637)', () => {
  const read = file =>
    JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf-8'));

  it('scans every tracked package.json, not a hard-coded list', () => {
    const files = trackedPackageJsonFiles();
    expect(files).toContain('packages/lab/package.json');
    expect(files).toContain('packages/charts/package.json');
    expect(files.every(file => !file.includes('node_modules/'))).toBe(true);
  });

  /**
   * Packages whose build writes into a `dist` it must clear first. The themes
   * are discovered rather than listed, so a new one cannot land without the
   * cleanup (#5125); lab and charts are the two that regressed in #3637.
   */
  const cleansDist = () => [
    'packages/core',
    'packages/lab',
    'packages/charts',
    'packages/richtext',
    ...trackedPackageJsonFiles()
      .filter(file => /^packages\/themes\/[^/]+\/package\.json$/.test(file))
      .map(file => path.posix.dirname(file)),
  ];

  it('discovers the theme packages it guards', () => {
    // A discovery that silently returned nothing would make the `it.each`
    // below expand to zero tests and pass vacuously, so it is asserted here.
    expect(cleansDist()).toContain('packages/themes/neutral');
  });

  it.each(cleansDist())('%s uses the shared portable dist cleaner', dir => {
    const {scripts, devDependencies = {}} = read(`${dir}/package.json`);
    const helper = dir.startsWith('packages/themes/')
      ? '../../../scripts/clean-dist.mjs'
      : '../../scripts/clean-dist.mjs';

    expect(scripts.build.startsWith(`node ${helper} && `)).toBe(true);
    expect(devDependencies.rimraf).toBeUndefined();
  });

  it.each(['packages/lab', 'packages/charts'])(
    '%s runs babel with the same flags and quoting as packages/core',
    dir => {
      const {scripts} = read(`${dir}/package.json`);
      const core = read('packages/core/package.json');

      // Same flags, same quoting as core. The config filename is normalised so
      // the assertion holds whichever extension a package authors its babel
      // config in.
      const config = /\.\/babel\.config\.\w+/;
      for (const name of ['build:esm', 'dev']) {
        expect(scripts[name].replace(config, 'CONFIG')).toBe(
          core.scripts[name].replace(config, 'CONFIG'),
        );
      }
    },
  );

  it('has no Windows-hostile script in any tracked package.json', () => {
    const offenders = trackedPackageJsonFiles().flatMap(file => {
      const pkg = read(file);
      const deps = {...pkg.dependencies, ...pkg.devDependencies};
      return findOffences(pkg.scripts, deps).map(
        ({name, detail}) => `${file} → scripts.${name}: ${detail}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('exits 0 when run the way CI runs it', () => {
    expect(() =>
      execFileSync('node', ['scripts/check-portable-scripts.mjs'], {
        cwd: ROOT,
        encoding: 'utf-8',
      }),
    ).not.toThrow();
  });
});
