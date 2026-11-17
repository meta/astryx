// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file check-fully-specified.test.mjs
 * Unit tests for the fully-specified-dist gate: every relative specifier in
 * emitted ESM must carry an explicit extension (#4569 shipped a dist whose
 * dynamic `import()` specifiers had none, breaking strict-ESM consumers).
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {
  scanSource,
  findOffenders,
  failureGuidance,
} from './check-fully-specified.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Escape a literal string for embedding in a RegExp source. */
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('scanSource', () => {
  it('flags an extensionless static import specifier', () => {
    expect(scanSource(`import {x} from './XDSButton';`)).toEqual([
      './XDSButton',
    ]);
  });

  it('flags an extensionless re-export specifier', () => {
    expect(scanSource(`export * from '../utils';`)).toEqual(['../utils']);
  });

  it('flags an extensionless side-effect import', () => {
    expect(scanSource(`import './componentStyles';`)).toEqual([
      './componentStyles',
    ]);
  });

  it('flags an extensionless dynamic import() specifier', () => {
    // The exact emitted shape that broke Rspack consumers in #4569.
    const line = `const LazyXDSTooltip = /*#__PURE__*/lazy(async () => import("../Tooltip/Tooltip").then(mod => ({`;
    expect(scanSource(line)).toEqual(['../Tooltip/Tooltip']);
  });

  it('flags double-quoted specifiers (the shape babel emits)', () => {
    expect(scanSource(`import {mergeProps} from "../utils";`)).toEqual([
      '../utils',
    ]);
  });

  it('flags extensions outside the allowlist, e.g. .stylex', () => {
    // Source says './tokens.stylex' but the built file is tokens.stylex.js —
    // an emitted .stylex specifier is exactly as unresolvable as no extension.
    expect(scanSource(`import {vars} from './theme/tokens.stylex';`)).toEqual([
      './theme/tokens.stylex',
    ]);
  });

  it('handles CRLF line endings', () => {
    const source =
      `// import {x} from './commented-out';\r\n` +
      `import {x} from './nope';\r\n`;
    expect(scanSource(source)).toEqual(['./nope']);
  });

  it('accepts fully specified and non-relative specifiers', () => {
    const source = [
      `import {jsx} from "react/jsx-runtime";`,
      `import {Tooltip} from "../Tooltip/Tooltip.js";`,
      `import "./reset.css";`,
      `import data from "./data.json";`,
      `const p = import("../Tooltip/Tooltip.js");`,
      `const q = import(someVariable);`,
    ].join('\n');
    expect(scanSource(source)).toEqual([]);
  });

  it('flags an extensionless backtick dynamic import() specifier', () => {
    // A no-substitution template literal is a static specifier in disguise —
    // it escapes babel-plugin-add-extensions (which rewrites only string
    // literals), so the gate must catch it.
    expect(scanSource('const p = import(`../Tooltip/Tooltip`);')).toEqual([
      '../Tooltip/Tooltip',
    ]);
  });

  it('accepts backtick specifiers that are fully specified or computed', () => {
    const source = [
      'const p = import(`../Tooltip/Tooltip.js`);',
      'const q = (n) => import(`./locales/${n}`);',
    ].join('\n');
    expect(scanSource(source)).toEqual([]);
  });

  it('ignores specifiers on comment lines', () => {
    // dist keeps JSDoc usage examples, e.g. layerAnimations.stylex.js and
    // globalIconRegistry.js — those must not fail the gate.
    const source = [
      `/**`,
      ` * import {layerAnimations} from '../Layer/layerAnimations.stylex';`,
      ` * import { brandIcons } from './brand-icons';`,
      ` */`,
      `// import {x} from './commented-out';`,
      `export const ok = 1;`,
    ].join('\n');
    expect(scanSource(source)).toEqual([]);
  });
});

describe('findOffenders', () => {
  let distDir;

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fully-specified-'));
    fs.writeFileSync(
      path.join(distDir, 'clean.js'),
      `import {x} from './other.js';\nexport const y = 1;\n`,
    );
    fs.mkdirSync(path.join(distDir, 'Text'));
    fs.writeFileSync(
      path.join(distDir, 'Text', 'Text.js'),
      `const L = lazy(() => import('../Tooltip/Tooltip'));\n`,
    );
    // Declarations are scanned too: NodeNext consumers need the extension
    // (#7702). Other non-runtime files are not scanned.
    fs.writeFileSync(
      path.join(distDir, 'Text', 'Text.d.ts'),
      `export * from '../types';\nexport * from '.';\n`,
    );
    fs.writeFileSync(
      path.join(distDir, 'Text', 'Text.d.ts.map'),
      `{"sources":["../types"]}\n`,
    );
  });

  afterAll(() => {
    fs.rmSync(distDir, {recursive: true, force: true});
  });

  it('reports offending runtime and declaration files with their bad specifiers', () => {
    const {checked, offenders} = findOffenders(distDir);
    // clean.js + Text/Text.js + Text/Text.d.ts — the source map is not scanned.
    expect(checked).toBe(3);
    expect(offenders).toHaveLength(2);
    expect(offenders).toContainEqual({
      file: path.join('Text', 'Text.js'),
      specifiers: ['../Tooltip/Tooltip'],
    });
    expect(offenders).toContainEqual({
      file: path.join('Text', 'Text.d.ts'),
      specifiers: ['../types', '.'],
    });
  });

  it('aggregates offenders across files, several per file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fully-specified-agg-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'a.js'),
        `import {x} from './one';\nconst p = import('./two');\n`,
      );
      fs.writeFileSync(path.join(dir, 'b.mjs'), `export * from '../three';\n`);
      fs.writeFileSync(path.join(dir, 'ok.js'), `import './fine.css';\n`);
      const {checked, offenders} = findOffenders(dir);
      expect(checked).toBe(3);
      expect(offenders).toHaveLength(2);
      expect(offenders).toContainEqual({
        file: 'a.js',
        specifiers: ['./one', './two'],
      });
      expect(offenders).toContainEqual({
        file: 'b.mjs',
        specifiers: ['../three'],
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('declaration scan by package type', () => {
  const SCRIPT = path.join(ROOT, 'scripts', 'check-fully-specified.mjs');

  /** Run the check in a package of `type` whose only dist file is a .d.ts. */
  const runIn = type => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fully-specified-pkg-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify(type ? {name: 'example', type} : {name: 'example'}),
      );
      fs.mkdirSync(path.join(dir, 'dist'));
      fs.writeFileSync(
        path.join(dir, 'dist', 'index.d.ts'),
        `export * from './theme';\n`,
      );
      return spawnSync(process.execPath, [SCRIPT], {
        cwd: dir,
        encoding: 'utf-8',
      });
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  };

  it('passes extensionless declarations in a CommonJS package', () => {
    expect(runIn(undefined).status).toBe(0);
  });

  it('fails extensionless declarations in an ESM package', () => {
    const result = runIn('module');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dist/index.d.ts: ./theme');
    expect(result.stderr).toContain('add-declaration-extensions.mjs');
  });
});

describe('failureGuidance', () => {
  it('points maintained themes at --icons-specifier', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fully-specified-theme-'),
    );
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: '@astryxdesign/theme-example'}),
      );
      expect(failureGuidance(dir)).toContain('--icons-specifier');
      expect(failureGuidance(dir)).not.toContain(
        'babel-plugin-add-extensions.cjs',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('retains the Babel hint for packages that use the extension plugin', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fully-specified-babel-'),
    );
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{}');
      fs.writeFileSync(path.join(dir, 'babel-plugin-add-extensions.cjs'), '');
      expect(failureGuidance(dir)).toContain('babel-plugin-add-extensions.cjs');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('gives package-neutral guidance for other build pipelines', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fully-specified-generic-'),
    );
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: '@astryxdesign/example'}),
      );
      expect(failureGuidance(dir)).toContain('build step');
      expect(failureGuidance(dir)).not.toContain('--icons-specifier');
      expect(failureGuidance(dir)).not.toContain(
        'babel-plugin-add-extensions.cjs',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('falls back to neutral guidance when the manifest is unreadable', () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'fully-specified-no-manifest-'),
    );
    try {
      expect(failureGuidance(dir)).toContain('build step');
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });
});

describe('maintained-theme build wiring', () => {
  it('keeps the fully-specified gate wired into every maintained-theme build', () => {
    const themesRoot = path.join(ROOT, 'packages', 'themes');
    const gate = path.join(ROOT, 'scripts', 'check-fully-specified.mjs');
    const packages = fs
      .readdirSync(themesRoot, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(themesRoot, entry.name))
      .filter(dir => fs.existsSync(path.join(dir, 'package.json')))
      .map(dir => ({
        dir,
        pkg: JSON.parse(
          fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
        ),
      }))
      .filter(({pkg}) => pkg.name?.startsWith('@astryxdesign/theme-'));

    expect(packages.length).toBeGreaterThan(0);
    for (const {dir, pkg} of packages) {
      // Derive the specifier so a move of packages/themes fails loudly here
      // instead of silently matching nothing. Any trailing build step or flag
      // is fine — what matters is that the gate still runs.
      const specifier = path.relative(dir, gate).split(path.sep).join('/');
      const invocation = new RegExp(
        `\\bnode\\s+${escapeRegExp(specifier)}(?:\\s|$)`,
      );
      expect(pkg.scripts?.build ?? '', pkg.name).toMatch(invocation);
    }
  });
});
