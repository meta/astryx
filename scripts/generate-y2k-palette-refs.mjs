#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  countSelectedRefs,
  createSelectedPaletteRefGenerator,
} from './generate-selected-palette-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const THEME_SOURCE_REL = 'packages/themes/y2k/src/y2kTheme.ts';
export const FULL_PALETTE_REL =
  'packages/themes/y2k/src/y2kPalettes.generated.ts';
export const SELECTED_REFS_REL =
  'packages/themes/y2k/src/y2kPaletteRefs.generated.ts';
export const TEMPLATE_REFS_REL =
  'packages/cli/assets/templates/themes/y2k/y2kPaletteRefs.generated.ts';

const generator = createSelectedPaletteRefGenerator({
  themeDisplayName: 'Y2K',
  paletteRefsIdentifier: 'y2kPaletteRefs',
  themeSourceRel: THEME_SOURCE_REL,
  fullPaletteRel: FULL_PALETTE_REL,
  selectedRefsRel: SELECTED_REFS_REL,
  templateRefsRel: TEMPLATE_REFS_REL,
  regenerateCommand: 'pnpm generate:y2k-palette-refs',
});

export function generateY2KPaletteRefs({root = ROOT, check = false} = {}) {
  return generator.generateSelectedPaletteRefs({root, check});
}

function main() {
  const check = process.argv.includes('--check');
  const result = generateY2KPaletteRefs({check});
  const count = countSelectedRefs(result.selected);

  if (check && result.problems.length > 0) {
    process.stderr.write(
      `\nY2K selected palette refs are out of sync:\n` +
        result.problems
          .map(
            problem =>
              `  - ${path.relative(ROOT, problem.output)} ${problem.reason}`,
          )
          .join('\n') +
        `\nRun: pnpm generate:y2k-palette-refs\n\n`,
    );
    return 1;
  }

  if (check) {
    process.stdout.write(
      `Y2K selected palette refs are in sync (${count} stops).\n`,
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
