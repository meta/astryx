// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file editor-look.ts
 * @input The token mapping `mapPalette` has made, and its palette
 * @output The colors the theme editor grows beyond `themePalette()`'s
 *   mapping
 * @position The theme editor's own rules, its `context.editor`. Its own
 *   module, so an app that imports only `themePalette()` ships none of it
 */

import {deriveLookColors} from './derive-look';
import type {
  PaletteDial,
  PaletteMapping,
  PaletteMappingContext,
  PaletteMode,
  PaletteTools,
} from './mapping';
import type {TonalPaletteCandidate} from './types';

/** What `mapPalette` hands the editor's rules. */
export interface EditorLookInput {
  candidate: TonalPaletteCandidate;
  dials: ReadonlyArray<PaletteDial>;
  context: PaletteMappingContext;
  tokens: PaletteMapping['tokens'];
  modes: PaletteMode[];
  setExactly: (token: string) => boolean;
  t: PaletteTools;
}

/** The editor's rules as `mapPalette` reads them (`context.editor`): this module. */
export interface PaletteEditorRules {
  growLook(input: EditorLookInput): EditorLookResult;
}

/** What the editor's rules add to a mapping. */
export interface EditorLookResult {
  categories: PaletteMapping['categories'];
}

/**
 * The colors the theme editor grows beyond `themePalette()`'s mapping,
 * written into `tokens` as shades of the palette.
 */
export function growLook(input: EditorLookInput): EditorLookResult {
  const {candidate, context, tokens, modes, setExactly, t} = input;
  const {alphaOf, exactOf, parseColor, stops, surfaces} = t;
  const {base, has} = context;
  const categories: PaletteMapping['categories'] = mapCategories();
  /**
   * The category colors (Badge, Token and Card tints) and the chart colors
   * the palette derives (deriveLookColors), written as its shades. A token
   * the theme sets by hand keeps its value; a set the palette cannot
   * draw readable and apart keeps the base theme's.
   */
  function mapCategories(): PaletteMapping['categories'] {
    /** The theme's color for a token in a mode. */
    const themeColor = (k: string, m: PaletteMode): string | null => {
      const v =
        exactOf(k, m) ??
        tokens[k]?.[m]?.color ??
        t.colorIn(base?.[m]?.[k] ?? '', m);
      return v && parseColor(v) && alphaOf(v) >= 1 ? v : null;
    };
    const derived = deriveLookColors({
      palette: candidate.palette as unknown as Record<
        string,
        Record<PaletteMode, Record<string | number, string>>
      >,
      stops,
      modes,
      text: m =>
        // Card text, secondary text and links all sit on a card tint.
        [
          '--color-text-primary',
          '--color-text-secondary',
          '--color-text-accent',
        ]
          .map(k => themeColor(k, m))
          .filter((c): c is string => Boolean(c)),
      grounds: m => surfaces(m, 'neutral').map(([, c]) => c),
      wanted: k => has(k) && !setExactly(k),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {
      badges: derived.badges,
      chart: derived.chart,
      merged: derived.merged,
      unreadable: derived.unreadable.map(
        u =>
          `${u.token} reads at only ${u.ratio}:1 in ${u.mode} (needs ${u.needs}:1)`,
      ),
    };
  }
  return {categories};
}
