// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Static reads of a module's exports, without running it: the file that
 * declares an export, and an exported object literal as plain data.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  moduleExportOrigin,
  moduleExportSource,
  staticExportObject,
} from './module-exports.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-export-field-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * @param {string} file
 * @param {string} source
 * @returns {string}
 */
function write(file, source) {
  const filePath = path.join(dir, file);
  fs.writeFileSync(filePath, source);
  return filePath;
}

const DOC_EXPORTS = ['default', 'docs'];

describe('staticExportObject', () => {
  it('reads a default-exported object literal as plain data', () => {
    const file = write(
      'A.doc.mjs',
      "export default {type: 'component', name: 'AcmeCarousel', order: 2, hidden: false, extra: null};\n",
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      type: 'component',
      name: 'AcmeCarousel',
      order: 2,
      hidden: false,
      extra: null,
    });
  });

  it('reads a named export, an export list, and the first export it looks for', () => {
    const named = write(
      'B.doc.mjs',
      "/** @type {object} */\nexport const docs = {\n  name: 'AcmeCarousel',\n};\n",
    );
    const both = write(
      'C.doc.mjs',
      "export const docs = {name: 'Legacy'};\nexport default {name: 'Stamped'};\n",
    );
    const list = write(
      'E.doc.mjs',
      "const local = {name: 'AcmeCarousel'};\nexport {local as docs};\n",
    );
    expect(staticExportObject(named, DOC_EXPORTS)?.name).toBe('AcmeCarousel');
    expect(staticExportObject(both, DOC_EXPORTS)?.name).toBe('Stamped');
    expect(staticExportObject(list, DOC_EXPORTS)?.name).toBe('AcmeCarousel');
  });

  it('follows top-level bindings through TypeScript wrappers, at any depth', () => {
    const file = write(
      'D.doc.ts',
      [
        "const slide = {name: 'AcmeSlide', description: 'One slide.'} as const;",
        "const doc = {name: 'AcmeCarousel', components: [slide, {name: 'AcmeDots', description: 'Dots.'}]} satisfies {name: string};",
        'export default doc;',
        '',
      ].join('\n'),
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      name: 'AcmeCarousel',
      components: [
        {name: 'AcmeSlide', description: 'One slide.'},
        {name: 'AcmeDots', description: 'Dots.'},
      ],
    });
  });

  it('leaves out what it cannot read without running the module', () => {
    const file = write(
      'F.doc.mjs',
      [
        "const prefix = 'Acme';",
        'const shared = {group: "Media"};',
        'export default {',
        '  // A computed string, a call and a spread: none is read.',
        '  name: `${prefix}Carousel`,',
        '  usage: makeUsage(),',
        "  group: 'Overridden',",
        '  ...shared,',
        "  category: 'Media',",
        "  components: [...more, {name: 'AcmeSlide'}],",
        '};',
        '',
      ].join('\n'),
    );
    expect(staticExportObject(file, DOC_EXPORTS)).toEqual({
      category: 'Media',
      components: [{name: 'AcmeSlide'}],
    });
  });

  it('answers null when there is no exported object', () => {
    const files = [
      write(
        'G.doc.mjs',
        "export const docs = {name: 'Legacy'};\nexport default makeDoc();\n",
      ),
      write('H.doc.mjs', 'export default {name: '),
      write('I.doc.mjs', "export const other = {name: 'AcmeCarousel'};\n"),
      write('J.doc.mjs', "export default ['AcmeCarousel'];\n"),
    ];
    for (const file of files) {
      expect(staticExportObject(file, DOC_EXPORTS)).toBeNull();
    }
  });
});

describe('moduleExportSource', () => {
  it('names the file that declares an export, following local re-exports', () => {
    const impl = write(
      'impl.tsx',
      'export function AcmeSlide() { return null; }\n',
    );
    const barrel = write(
      'index.ts',
      "export {AcmeSlide} from './impl';\nexport * from './dots';\nexport function AcmeCarousel() { return null; }\n",
    );
    const dots = write('dots.tsx', 'export const AcmeDots = () => null;\n');
    expect(moduleExportSource(barrel, 'AcmeSlide')).toBe(impl);
    expect(moduleExportSource(barrel, 'AcmeDots')).toBe(dots);
    expect(moduleExportSource(barrel, 'AcmeCarousel')).toBe(barrel);
    expect(moduleExportSource(barrel, 'AcmeMissing')).toBeNull();
  });

  it('does not follow a re-export written in a comment', () => {
    write('legacy.tsx', 'export function AcmeTab() { return null; }\n');
    const barrel = write(
      'tabs.ts',
      "// export * from './legacy';\nexport function AcmeTabs() { return null; }\n",
    );
    expect(moduleExportSource(barrel, 'AcmeTab')).toBeNull();
  });

  it('does not count a type-only export', () => {
    const file = write('types.ts', 'export type AcmeShape = {id: string};\n');
    expect(moduleExportSource(file, 'AcmeShape')).toBeNull();
  });

  it('sees a file npm replaced with one of the same size and mtime', () => {
    // npm stamps every installed file with one mtime and writes new files.
    const npmTime = new Date('1985-10-26T08:15:00Z');
    const file = write('Panel.tsx', 'export function AcmePanel() {}\n');
    fs.utimesSync(file, npmTime, npmTime);
    expect(moduleExportSource(file, 'AcmePanel')).toBe(file);
    const next = write('Panel.next.tsx', 'export function AcmePanol() {}\n');
    fs.utimesSync(next, npmTime, npmTime);
    fs.renameSync(next, file);
    expect(moduleExportSource(file, 'AcmePanel')).toBeNull();
  });
});

describe('a library of thousands of icons', () => {
  it('finds the origin of every export in about linear time', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-many-exports-'));
    try {
      const count = 3000;
      fs.writeFileSync(
        path.join(dir, 'icon.js'),
        'export function make(name) { return function Icon() { return name; }; }\n',
      );
      const lines = ["import {make} from './icon.js';"];
      for (let i = 0; i < count; i++) {
        lines.push(`const Glyph${i} = make('g${i}');`);
        lines.push(
          `export {Glyph${i}, Glyph${i} as Glyph${i}Icon, Glyph${i} as LucideGlyph${i}};`,
        );
      }
      const file = path.join(dir, 'index.js');
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      const started = Date.now();
      for (let i = 0; i < count; i++) {
        expect(moduleExportOrigin(file, `Glyph${i}Icon`)).toEqual({
          file,
          name: `Glyph${i}`,
        });
      }
      // Walking the whole module once per lookup took minutes.
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 60_000);
});
