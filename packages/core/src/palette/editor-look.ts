// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file editor-look.ts
 * @input The token mapping `mapPalette` has made, and its palette
 * @output The colors the theme editor grows beyond `themePalette()`'s
 *   mapping
 * @position The theme editor's own rules, its `context.editor`. Its own
 *   module, so an app that imports only `themePalette()` ships none of it
 */

import {
  deriveLookColors,
  deriveStatusColors,
  lookSeeds,
  statusSeeds,
} from './derive-look';
import {STATUS_TOKEN, hex} from './mapping';
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
  statuses: PaletteMapping['statuses'];
}

/**
 * The families the theme editor grows beside the theme's own colors, in
 * order: the category and chart hues of the look (lookSeeds), then the
 * status roles the theme leaves unset, from the base theme's color for
 * each (statusSeeds). Empty without a color setting.
 */
export function grownFamilies(
  dials: ReadonlyArray<PaletteDial>,
  context: Pick<PaletteMappingContext, 'base' | 'reader'>,
): {id: string; name: string; seed: string}[] {
  if (!dials.length) {
    return [];
  }
  const named = (id: string, seed: string) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    seed,
  });
  const accent = dials.find(d => d.id === 'accent')?.seed;
  const out = Object.entries(lookSeeds(accent)).map(([id, seed]) =>
    named(id, seed),
  );
  const baseColors: Record<string, string> = {};
  for (const d of Object.keys(STATUS_TOKEN)) {
    if (dials.some(f => f.id === d)) {
      continue;
    }
    const v = context.base?.light?.[`--color-${STATUS_TOKEN[d]}`];
    const rgb = v ? context.reader.rgb(v) : null;
    if (rgb && context.reader.alpha(v) >= 1) {
      baseColors[d] = hex(rgb);
    }
  }
  for (const [id, seed] of Object.entries(statusSeeds(baseColors, accent))) {
    if (!out.some(f => f.id === id)) {
      out.push(named(id, seed));
    }
  }
  return out;
}

/**
 * The colors the theme editor grows beyond `themePalette()`'s mapping,
 * written into `tokens` as shades of the palette.
 */
export function growLook(input: EditorLookInput): EditorLookResult {
  const {candidate, dials, context, tokens, modes, setExactly, t} = input;
  const {alphaOf, exactOf, parseColor, stops, surfaces} = t;
  const {base, has} = context;
  const categories: PaletteMapping['categories'] = mapCategories();
  const statuses: PaletteMapping['statuses'] = mapStatuses();
  /**
   * The status roles the theme leaves unset, from the palette's families of
   * them (deriveStatusColors), written as its shades; a token set by hand
   * keeps its value, and a role that cannot be drawn readable and apart
   * from the accent keeps the base theme's.
   */
  function mapStatuses(): PaletteMapping['statuses'] {
    const pal = candidate.palette as unknown as Record<
      string,
      Record<PaletteMode, Record<string | number, string>>
    >;
    const roles = Object.keys(STATUS_TOKEN).filter(
      d => !dials.some(f => f.id === d) && pal[d],
    );
    if (!roles.length) {
      return {roles: {}, why: []};
    }
    const derived = deriveStatusColors({
      palette: pal,
      stops,
      modes,
      roles,
      grounds: m => surfaces(m, 'neutral').map(([, c]) => c),
      inks: (m, id) =>
        t.onChoices(id, m).map(r => ({
          stop: r.stop,
          color: r.color,
          family: r.family ?? 'neutral',
        })),
      accent: m => tokens['--color-accent']?.[m]?.color ?? null,
      wanted: k => has(k) && !setExactly(k),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {roles: derived.roles, why: derived.why};
  }
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
  return {categories, statuses};
}
