// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {fontFaceRules} from '../../foundation/fonts/font-stylesheet.mjs';
import {baseFontsSheet} from './_preview.mjs';

/** A project whose base theme package ships `fonts.css`. @param {string} css */
function projectWithBaseFonts(css) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-base-fonts-'));
  const pkgDir = path.join(cwd, 'node_modules/@astryxdesign/theme-neutral');
  fs.mkdirSync(pkgDir, {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@astryxdesign/theme-neutral',
      exports: {'./fonts.css': './fonts.css'},
    }),
  );
  fs.writeFileSync(path.join(pkgDir, 'fonts.css'), css);
  return cwd;
}

describe('baseFontsSheet', () => {
  /** @type {string[]} */
  const made = [];
  afterEach(() => {
    for (const dir of made.splice(0))
      fs.rmSync(dir, {recursive: true, force: true});
  });

  /** @param {string} css */
  const sheetOf = css => {
    const cwd = projectWithBaseFonts(css);
    made.push(cwd);
    return baseFontsSheet(
      /** @type {any} */ ({project: {cwd}}),
      /** @type {any} */ ({like: 'neutral', name: 'mine'}),
    );
  };

  it('reads the families and weights of a font service import', () => {
    const sheet = sheetOf(
      "@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@400;600&display=swap');",
    );
    expect(sheet?.families).toEqual(['Figtree']);
    expect(sheet?.weights.get('Figtree')).toEqual([400, 600]);
    expect(sheet?.remote).toHaveLength(1);
  });

  it('reads the families and weights of font-face rules', () => {
    const sheet = sheetOf(
      [
        '/* A variable face */',
        "@font-face { font-family: 'Figtree'; font-weight: 400 700; src: url('https://fonts.example/f.woff2') format('woff2'); }",
        "@font-face { font-family: 'Figtree Fallback'; src: local('Arial'); }",
        "@font-face { font-family: Mono; font-weight: 500; src: url('https://fonts.example/m.woff2'); }",
      ].join('\n'),
    );
    expect(sheet?.families).toEqual(['Figtree', 'Figtree Fallback', 'Mono']);
    // A weight range is a variable face: its span keeps both ends.
    expect(sheet?.spans.get('Figtree')).toEqual([[400, 700]]);
    expect(sheet?.spans.get('Mono')).toEqual([[500, 500]]);
    // A face of fonts already on the device loads no file and no weight.
    expect(sheet?.spans.has('Figtree Fallback')).toBe(false);
    expect([...(sheet?.localFaces ?? [])]).toEqual(['Figtree Fallback']);
    expect(sheet?.weights.size).toBe(0);
    // The faces load remote files, which a static page cannot load.
    expect(sheet?.remote).toEqual([
      'https://fonts.example/f.woff2',
      'https://fonts.example/m.woff2',
    ]);
  });
});

describe('fontFaceRules', () => {
  it('reads each rule’s family, weight span, remote files and local-only faces', () => {
    expect(
      fontFaceRules(
        [
          '/* @font-face { font-family: Hidden; } */',
          "@font-face { font-family: 'A'; font-weight: 100 900; src: url('https://f.example/a.woff2') format('woff2'); }",
          '@font-face { font-family: B; font-weight: bold; src: url(./b.woff2); }',
          "@font-face { font-family: 'C Fallback'; src: local('Arial'), local('Arimo'); }",
          '@font-face { font-family: D; font-weight: var(--w); }',
          '@font-face { font-family: Gill\\ Sans; }',
        ].join('\n'),
      ),
    ).toEqual([
      {
        family: 'A',
        span: [100, 900],
        remote: ['https://f.example/a.woff2'],
        isLocalOnly: false,
      },
      {family: 'B', span: [700, 700], remote: [], isLocalOnly: false},
      {family: 'C Fallback', span: [400, 400], remote: [], isLocalOnly: true},
      {family: 'D', span: null, remote: [], isLocalOnly: false},
      {family: 'Gill Sans', span: [400, 400], remote: [], isLocalOnly: false},
    ]);
  });
});
