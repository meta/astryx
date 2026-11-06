// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused tests for Stone's selected palette-reference wrapper.
 * @input Synthetic Stone theme references and full-palette literals.
 * @output Proof that Stone binds the shared generator to both required outputs.
 * @position Regression coverage for generate-stone-palette-refs.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {themePaletteGenerate} from '../packages/cli/api/theme/palette/generate/generate.mjs';
import {assertPaletteReceiptsMatch} from './palette-receipt-test-utils.mjs';
import {countSelectedRefs} from './generate-selected-palette-refs.mjs';
import {
  FULL_PALETTE_REL,
  SELECTED_REFS_REL,
  TEMPLATE_REFS_REL,
  THEME_SOURCE_REL,
  generateStonePaletteRefs,
} from './generate-stone-palette-refs.mjs';

const FULL_PALETTE = `export const palette = {
  blue: {
    name: 'Blue',
    light: {25: '#112233', 80: '#445566'},
    dark: {25: '#778899', 80: '#aabbcc'},
  },
  neutral: {
    name: 'Stone Neutral',
    light: {100: '#ffffff'},
    dark: {5: '#111111'},
  },
} as const;
`;

const THEME_SOURCE = `
const {blue: stoneBlue, neutral} = stonePaletteRefs;
export const stoneTheme = {
  first: stoneBlue.dark[80],
  direct: stonePaletteRefs.blue.light[25],
  repeated: stoneBlue.dark[80],
  surface: neutral.light[100],
};
`;

describe('Stone selected palette ref generation', () => {
  it('reproduces the committed full palette and receipt from its config', () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-stone-palette-'),
    );
    try {
      fs.copyFileSync(
        path.join(root, 'packages/themes/stone/palette.config.json'),
        path.join(temp, 'palette.config.json'),
      );
      themePaletteGenerate(
        'palette.config.json',
        {
          out: 'stonePalettes.generated.ts',
          preview: 'stone-palette-preview.html',
        },
        {cwd: temp},
      );

      const generated = fs.readFileSync(
        path.join(temp, 'stonePalettes.generated.ts'),
        'utf8',
      );
      const committed = fs
        .readFileSync(
          path.join(
            root,
            'packages/themes/stone/src/stonePalettes.generated.ts',
          ),
          'utf8',
        )
        .replace(
          '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n',
          '',
        );
      expect(generated).toBe(committed);
      assertPaletteReceiptsMatch(
        JSON.parse(
          fs.readFileSync(
            path.join(temp, 'stonePalettes.generated.receipt.json'),
            'utf8',
          ),
        ),
        JSON.parse(
          fs.readFileSync(
            path.join(
              root,
              'packages/themes/stone/src/stonePalettes.generated.receipt.json',
            ),
            'utf8',
          ),
        ),
      );
    } finally {
      fs.rmSync(temp, {recursive: true, force: true});
    }
  });

  it('generates the package artifact and CLI template through the shared path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-stone-refs-'));
    try {
      const themeSource = path.join(root, THEME_SOURCE_REL);
      const fullPalette = path.join(root, FULL_PALETTE_REL);
      fs.mkdirSync(path.dirname(themeSource), {recursive: true});
      fs.writeFileSync(themeSource, THEME_SOURCE);
      fs.writeFileSync(fullPalette, FULL_PALETTE);

      const generated = generateStonePaletteRefs({root});

      expect(countSelectedRefs(generated.selected)).toBe(3);
      expect(generated.outputs).toEqual([
        path.join(root, SELECTED_REFS_REL),
        path.join(root, TEMPLATE_REFS_REL),
      ]);
      expect(generated.content).toContain(
        "// Generated from the committed full palette for the stops used by Stone's",
      );
      expect(generated.content).toContain(
        '// theme source. Regenerate with `pnpm generate:stone-palette-refs`.',
      );
      expect(generated.content).toContain('export const stonePaletteRefs = {');
      expect(generated.content).toContain("dark: {80: '#aabbcc'}");
      expect(generated.content).toContain("light: {25: '#112233'}");
      expect(generated.content).toContain('export default stonePaletteRefs;');
      for (const output of generated.outputs) {
        expect(fs.readFileSync(output, 'utf-8')).toBe(generated.content);
      }

      expect(generateStonePaletteRefs({root, check: true}).problems).toEqual(
        [],
      );
      fs.appendFileSync(path.join(root, TEMPLATE_REFS_REL), '// stale\n');
      expect(generateStonePaletteRefs({root, check: true}).problems).toEqual([
        {output: path.join(root, TEMPLATE_REFS_REL), reason: 'differs'},
      ]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
