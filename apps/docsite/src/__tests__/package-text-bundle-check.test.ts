// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file package-text-bundle-check.test.ts
 * @input The build's check for package text in browser scripts
 * @output Proof that the check reports a script that holds a README or a
 *   changelog, does not report a script that quotes one line, and fails when
 *   it has no script or no text to check
 * @position Docsite unit tests. The docsite build runs the check on the real
 *   scripts.
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  checkPackageTextBundle,
  sampledTexts,
  sampleLines,
  textsInScripts,
} from '../../scripts/check-package-text-bundle.mjs';

const lines = (topic: string, count: number) =>
  Array.from(
    {length: count},
    (_, index) => `Line ${index} of the ${topic} text, long enough to sample.`,
  );

const README = ['# @example/widgets', '', ...lines('README', 30)].join('\n');
const CHANGELOG = ['# 1.2.0', '', ...lines('changelog', 30)].join('\n');
const PACKAGE_TEXT = [
  {name: '@example/widgets', readme: README, changelog: CHANGELOG},
];

/** A script that holds a value the way a minifier writes a string. */
const scriptWith = (value: unknown) =>
  `(self.chunks=self.chunks||[]).push([[1],{1:e=>{e.exports=${JSON.stringify(value)}}}]);`;

describe('sampleLines', () => {
  it('samples at most ten lines, spread over the text', () => {
    const samples = sampleLines(README);
    expect(samples).toHaveLength(10);
    expect(samples[0]).toBe(
      'Line 0 of the README text, long enough to sample.',
    );
    expect(samples[9]).toBe(
      'Line 27 of the README text, long enough to sample.',
    );
  });

  it('takes every line of a text that has ten or fewer', () => {
    expect(sampleLines(lines('short', 4).join('\n'))).toEqual(
      lines('short', 4),
    );
  });

  it('takes one sample of a line that repeats', () => {
    const line = 'Thanks to everyone who contributed to this release:';
    expect(sampleLines([line, line, line].join('\n'))).toEqual([line]);
  });

  it('leaves out a line that a minifier can write in another form', () => {
    const plain = 'A plain line of forty characters or more, kept as it is.';
    expect(
      sampleLines(
        [
          'A short line.',
          'This line has a "double quote" in it, so a script can escape it.',
          "This line has a 'single quote' in it, so a script can escape it.",
          'This line has a `backtick` in it, so a script can change the form.',
          'This line has a \\ backslash in it, so a script must escape it.',
          'This line has a $ dollar sign in it, so a template can escape it.',
          'This line has an em dash — which a script can write as an escape.',
          `  ${plain}  `,
        ].join('\n'),
      ),
    ).toEqual([plain]);
  });
});

describe('textsInScripts', () => {
  const TEXTS = sampledTexts(PACKAGE_TEXT);

  it('reports a script that holds a README', () => {
    expect(
      textsInScripts(TEXTS, [
        {path: 'app/page.js', source: scriptWith('no package text')},
        {path: '123.js', source: scriptWith({readme: README})},
      ]),
    ).toEqual(['@example/widgets README (10 of 10 sampled lines) in 123.js']);
  });

  it('reports a script that holds a changelog', () => {
    expect(
      textsInScripts(TEXTS, [
        {path: '456.js', source: scriptWith([CHANGELOG])},
      ]),
    ).toEqual([
      '@example/widgets changelog (10 of 10 sampled lines) in 456.js',
    ]);
  });

  it('reports each text and each script', () => {
    expect(
      textsInScripts(TEXTS, [
        {path: '1.js', source: scriptWith(PACKAGE_TEXT)},
        {path: '2.js', source: scriptWith(README)},
      ]),
    ).toEqual([
      '@example/widgets README (10 of 10 sampled lines) in 1.js',
      '@example/widgets changelog (10 of 10 sampled lines) in 1.js',
      '@example/widgets README (10 of 10 sampled lines) in 2.js',
    ]);
  });

  it('reports a script that holds more than half of the sampled lines', () => {
    const samples = sampleLines(README);
    expect(
      textsInScripts(TEXTS, [
        {path: 'half.js', source: scriptWith(samples.slice(0, 5))},
        {path: 'most.js', source: scriptWith(samples.slice(0, 6))},
      ]),
    ).toEqual(['@example/widgets README (6 of 10 sampled lines) in most.js']);
  });

  it('does not report a script that quotes one line of a text', () => {
    expect(
      textsInScripts(TEXTS, [
        {path: 'docs.js', source: scriptWith(sampleLines(README)[0])},
      ]),
    ).toEqual([]);
  });
});

describe('sampledTexts', () => {
  it('labels the README and the changelog of a package', () => {
    expect(sampledTexts(PACKAGE_TEXT)).toEqual([
      {label: '@example/widgets README', samples: sampleLines(README)},
      {label: '@example/widgets changelog', samples: sampleLines(CHANGELOG)},
    ]);
  });

  it('skips a package with no text, and a text with one line to sample', () => {
    expect(
      sampledTexts([
        {name: '@example/empty', readme: null, changelog: null},
        {
          name: '@example/tiny',
          readme: 'The one line of this text that is long enough to sample.',
          changelog: '# 0.1.0',
        },
      ]),
    ).toEqual([]);
  });
});

describe('checkPackageTextBundle', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }
  });

  /** A build in the temporary directory of the system, not in the app. */
  function build(files: Record<string, string>, packageText: unknown) {
    const root = mkdtempSync(join(tmpdir(), 'package-text-bundle-'));
    roots.push(root);
    const chunksRoot = join(root, 'chunks');
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(join(chunksRoot, path, '..'), {recursive: true});
      writeFileSync(join(chunksRoot, path), source);
    }
    const textPath = join(root, 'packageText.json');
    writeFileSync(textPath, JSON.stringify(packageText));
    return {chunksRoot, textPath};
  }

  it('passes when no script holds a text, and counts what it checked', () => {
    expect(
      checkPackageTextBundle(
        build(
          {
            'main.js': scriptWith('no package text'),
            'app/page.js': scriptWith(sampleLines(README)[0]),
          },
          PACKAGE_TEXT,
        ),
      ),
    ).toBe(
      'Package text bundle check passed: 2 browser scripts hold none of 2 README and changelog texts',
    );
  });

  it('fails when a script in a nested directory holds a text', () => {
    expect(() =>
      checkPackageTextBundle(
        build(
          {
            'main.js': scriptWith('no package text'),
            'app/docs/page.js': scriptWith(PACKAGE_TEXT),
          },
          PACKAGE_TEXT,
        ),
      ),
    ).toThrow(
      'Only server modules may import src/lib/packageText.ts:\n' +
        '- @example/widgets README (10 of 10 sampled lines) in app/docs/page.js\n' +
        '- @example/widgets changelog (10 of 10 sampled lines) in app/docs/page.js',
    );
  });

  it('reads scripts only', () => {
    expect(
      checkPackageTextBundle(
        build(
          {
            'main.js': scriptWith('no package text'),
            'main.js.map': JSON.stringify({sourcesContent: [README]}),
          },
          PACKAGE_TEXT,
        ),
      ),
    ).toContain('1 browser scripts hold none of 2');
  });

  it('fails when the build has no scripts directory', () => {
    const {textPath} = build({}, PACKAGE_TEXT);
    expect(() =>
      checkPackageTextBundle({chunksRoot: join(textPath, 'missing'), textPath}),
    ).toThrow('is missing: run next build first.');
  });

  it('fails when the build has no script to check', () => {
    expect(() =>
      checkPackageTextBundle(
        build({'styles.css': 'body{margin:0}'}, PACKAGE_TEXT),
      ),
    ).toThrow('No browser script found under');
  });

  it('fails when there is no text to check', () => {
    expect(() =>
      checkPackageTextBundle(
        build({'main.js': scriptWith(PACKAGE_TEXT)}, [
          {name: '@example/empty', readme: null, changelog: null},
        ]),
      ),
    ).toThrow('No README or changelog text to check in');
  });
});
