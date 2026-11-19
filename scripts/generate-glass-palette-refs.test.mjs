// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused tests for Glass's selected palette-reference wrapper.
 * @input Synthetic Glass theme references and full-palette literals.
 * @output Proof that Glass binds the shared generator to both required outputs.
 * @position Regression coverage for generate-glass-palette-refs.mjs.
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
  generateGlassPaletteRefs,
} from './generate-glass-palette-refs.mjs';

const FULL_PALETTE = `export const palette = {
  blue: {
    name: 'Blue',
    dark: {25: '#778899', 80: '#aabbcc'},
  },
  neutral: {
    name: 'Glass Neutral',
    dark: {5: '#111111'},
  },
} as const;
`;

const THEME_SOURCE = `
const {blue: glassBlue, neutral} = glassPaletteRefs;
export const glassTheme = {
  first: glassBlue.dark[80],
  direct: glassPaletteRefs.blue.dark[25],
  repeated: glassBlue.dark[80],
  surface: neutral.dark[5],
};
`;

describe('Glass selected palette ref generation', () => {
  it('reproduces the committed full palette and receipt from its config', () => {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
    );
    const temp = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-glass-palette-'),
    );
    try {
      fs.copyFileSync(
        path.join(root, 'packages/themes/glass/palette.config.json'),
        path.join(temp, 'palette.config.json'),
      );
      themePaletteGenerate(
        'palette.config.json',
        {
          out: 'glassPalettes.generated.ts',
          preview: 'glass-palette-preview.html',
        },
        {cwd: temp},
      );

      const generated = fs.readFileSync(
        path.join(temp, 'glassPalettes.generated.ts'),
        'utf8',
      );
      const committed = fs
        .readFileSync(
          path.join(
            root,
            'packages/themes/glass/src/glassPalettes.generated.ts',
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
            path.join(temp, 'glassPalettes.generated.receipt.json'),
            'utf8',
          ),
        ),
        JSON.parse(
          fs.readFileSync(
            path.join(
              root,
              'packages/themes/glass/src/glassPalettes.generated.receipt.json',
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-glass-refs-'));
    try {
      const themeSource = path.join(root, THEME_SOURCE_REL);
      const fullPalette = path.join(root, FULL_PALETTE_REL);
      fs.mkdirSync(path.dirname(themeSource), {recursive: true});
      fs.writeFileSync(themeSource, THEME_SOURCE);
      fs.writeFileSync(fullPalette, FULL_PALETTE);

      const generated = generateGlassPaletteRefs({root});

      expect(countSelectedRefs(generated.selected)).toBe(3);
      expect(generated.outputs).toEqual([
        path.join(root, SELECTED_REFS_REL),
        path.join(root, TEMPLATE_REFS_REL),
      ]);
      expect(generated.content).toContain(
        "// Generated from the committed full palette for the stops used by Glass's",
      );
      expect(generated.content).toContain(
        '// theme source. Regenerate with `pnpm generate:glass-palette-refs`.',
      );
      expect(generated.content).toContain('export const glassPaletteRefs = {');
      expect(generated.content).toContain(
        "dark: {25: '#778899', 80: '#aabbcc'}",
      );
      expect(generated.content).toContain('export default glassPaletteRefs;');
      for (const output of generated.outputs) {
        expect(fs.readFileSync(output, 'utf-8')).toBe(generated.content);
      }

      expect(generateGlassPaletteRefs({root, check: true}).problems).toEqual(
        [],
      );
      fs.appendFileSync(path.join(root, TEMPLATE_REFS_REL), '// stale\n');
      expect(generateGlassPaletteRefs({root, check: true}).problems).toEqual([
        {output: path.join(root, TEMPLATE_REFS_REL), reason: 'differs'},
      ]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });
});
