// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx theme build` of a theme with color-mode blocks
 * @input A theme file whose component overrides hold `@light` and `@dark`
 *   blocks, built by the CLI against the compiled `@astryxdesign/core`
 * @output Assertions that the built stylesheet carries each block as rules
 *   for its mode only (the theme root's mode, the system preference, a media
 *   surface), with pseudo-classes and pseudo-elements after the
 *   mode conditions, and nothing for a theme without blocks
 * @position Build evidence for color-mode blocks
 *   (`architecture:theme-compilation` INV18)
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-theme-modes-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** Build a theme file and read its stylesheet. */
async function build(name, components) {
  const file = path.join(tmpDir, `${name}.mjs`);
  fs.writeFileSync(
    file,
    `export default ${JSON.stringify({name, tokens: {}, components})};\n`,
  );
  const result = await runCli(
    ['theme', 'build', path.relative(tmpDir, file)],
    tmpDir,
  );
  expect(result.code, result.stderr).toBe(0);
  return fs.readFileSync(path.join(tmpDir, `${name}.css`), 'utf-8');
}

const OUTSIDE_SURFACES = ':where(:not(:scope [data-astryx-media] *))';

describe('theme build with color-mode blocks', () => {
  it('writes each block for its mode only', async () => {
    const css = await build('modes-theme', {
      button: {
        'variant:ghost': {
          backgroundColor: 'transparent',
          '@dark': {
            backgroundColor: '#ff00ff',
            ':hover': {backgroundColor: '#aa00aa'},
          },
        },
      },
      'text-input': {
        base: {
          '@light': {borderColor: '#00ff00', '::placeholder': {color: 'gray'}},
        },
      },
    });
    const ghost = ':is(.astryx-button[data-variant="ghost"])';
    expect(css).toContain(
      `${ghost}:where(:scope[data-theme="dark"] *)${OUTSIDE_SURFACES} {`,
    );
    expect(css).toMatch(
      /@media \(prefers-color-scheme: dark\) \{\s*:is\(\.astryx-button\[data-variant="ghost"\]\):where\(:scope:not\(\[data-theme="light"\], \[data-theme="dark"\]\) \*\)/,
    );
    expect(css).toMatch(
      /:is\(\.astryx-button\[data-variant="ghost"\]\):where\(:scope \[data-astryx-media="dark"\] \*\) \{\s*background-color: #ff00ff;/,
    );
    expect(css).toContain(
      `${ghost}:where(:scope[data-theme="dark"] *)${OUTSIDE_SURFACES}:hover`,
    );
    expect(css).toContain(
      `:is(.astryx-text-input):where(:scope[data-theme="light"] *)${OUTSIDE_SURFACES}::placeholder {`,
    );
    // The values are never paired across modes.
    expect(css).not.toMatch(/light-dark\([^;]*#ff00ff/);
  });

  it('writes no mode rules for a theme without blocks', async () => {
    const css = await build('plain-theme', {
      button: {'variant:ghost': {backgroundColor: 'transparent'}},
    });
    expect(css).not.toMatch(
      /prefers-color-scheme|data-theme=|:scope \[data-astryx-media/,
    );
  });
});
