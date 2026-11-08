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

export const THEME_SOURCE_REL = 'packages/themes/matcha/src/matchaTheme.ts';
export const FULL_PALETTE_REL =
  'packages/themes/matcha/src/matchaPalettes.generated.ts';
export const SELECTED_REFS_REL =
  'packages/themes/matcha/src/matchaPaletteRefs.generated.ts';
export const TEMPLATE_REFS_REL =
  'packages/cli/assets/templates/themes/matcha/matchaPaletteRefs.generated.ts';

const generator = createSelectedPaletteRefGenerator({
  themeDisplayName: 'Matcha',
  paletteRefsIdentifier: 'matchaPaletteRefs',
  themeSourceRel: THEME_SOURCE_REL,
  fullPaletteRel: FULL_PALETTE_REL,
  selectedRefsRel: SELECTED_REFS_REL,
  templateRefsRel: TEMPLATE_REFS_REL,
  regenerateCommand: 'pnpm generate:matcha-palette-refs',
});

export function generateMatchaPaletteRefs({root = ROOT, check = false} = {}) {
  return generator.generateSelectedPaletteRefs({root, check});
}

function main() {
  const check = process.argv.includes('--check');
  const result = generateMatchaPaletteRefs({check});
  const count = countSelectedRefs(result.selected);

  if (check && result.problems.length > 0) {
    process.stderr.write(
      `\nMatcha selected palette refs are out of sync:\n` +
        result.problems
          .map(
            problem =>
              `  - ${path.relative(ROOT, problem.output)} ${problem.reason}`,
          )
          .join('\n') +
        `\nRun: pnpm generate:matcha-palette-refs\n\n`,
    );
    return 1;
  }

  if (check) {
    process.stdout.write(
      `Matcha selected palette refs are in sync (${count} stops).\n`,
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
