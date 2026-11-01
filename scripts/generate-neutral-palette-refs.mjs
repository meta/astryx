#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

/**
 * @file Generates Neutral's runtime-sized palette reference module from the
 * palette stops used by the theme source and the values in the committed full
 * palette. The default mode writes both the package artifact and its CLI theme
 * template copy; `--check` compares both without writing.
 * @input Neutral's theme source and committed full palette.
 * @output The selected runtime palette-reference module and matching CLI copy.
 * @position Repository maintenance command and Neutral build drift guard.
 */

import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  countSelectedRefs,
  createSelectedPaletteRefGenerator,
  syncOutputs,
} from './generate-selected-palette-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const THEME_SOURCE_REL = 'packages/themes/neutral/src/neutralTheme.ts';
export const FULL_PALETTE_REL =
  'packages/themes/neutral/src/neutralPalettes.generated.ts';
export const SELECTED_REFS_REL =
  'packages/themes/neutral/src/neutralPaletteRefs.generated.ts';
export const TEMPLATE_REFS_REL =
  'packages/cli/assets/templates/themes/neutral/neutralPaletteRefs.generated.ts';

const generator = createSelectedPaletteRefGenerator({
  themeDisplayName: 'Neutral',
  paletteRefsIdentifier: 'neutralPaletteRefs',
  themeSourceRel: THEME_SOURCE_REL,
  fullPaletteRel: FULL_PALETTE_REL,
  selectedRefsRel: SELECTED_REFS_REL,
  templateRefsRel: TEMPLATE_REFS_REL,
  regenerateCommand: 'pnpm generate:neutral-palette-refs',
});

export const parseFullPalette = generator.parseFullPalette;
export const discoverSelectedRefs = generator.discoverSelectedRefs;
export const renderSelectedRefs = generator.renderSelectedRefs;
export {countSelectedRefs, syncOutputs};

export function generateNeutralPaletteRefs({root = ROOT, check = false} = {}) {
  return generator.generateSelectedPaletteRefs({root, check});
}

function main() {
  const check = process.argv.includes('--check');
  const result = generateNeutralPaletteRefs({check});
  const count = countSelectedRefs(result.selected);

  if (check && result.problems.length > 0) {
    process.stderr.write(
      `\nNeutral selected palette refs are out of sync:\n` +
        result.problems
          .map(
            problem =>
              `  - ${path.relative(ROOT, problem.output)} ${problem.reason}`,
          )
          .join('\n') +
        `\nRun: pnpm generate:neutral-palette-refs\n\n`,
    );
    return 1;
  }

  if (check) {
    process.stdout.write(
      `Neutral selected palette refs are in sync (${count} stops).\n`,
    );
  } else {
    for (const output of result.outputs) {
      process.stdout.write(`Wrote ${path.relative(ROOT, output)}\n`);
    }
    process.stdout.write(`Selected ${count} referenced palette stops.\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(main());
}
