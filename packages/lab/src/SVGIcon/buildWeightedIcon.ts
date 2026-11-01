// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file buildWeightedIcon.ts
 * @input One SVG drawing per icon weight (300-700)
 * @output A WeightedIconDef: one layer per distinct drawing, each covering a contiguous weight range
 * @position Pure build step shared by the generator script, tests, and stories
 *
 * Identical drawings at neighboring weights share one layer, so an icon whose
 * 400 and 500 drawings match ships that drawing once. Passing `weights` keeps
 * only the drawings a product can reach; every other weight shows the nearest
 * kept drawing, so the icon never renders empty.
 */

export const ICON_WEIGHTS = [300, 400, 500, 600, 700] as const;
export type IconWeight = (typeof ICON_WEIGHTS)[number];

export interface WeightedIconPath {
  /** SVG path data. */
  d: string;
  /** Use the even-odd fill rule for this path. */
  evenOdd?: boolean;
}

export interface WeightedIconLayer {
  /** Lightest weight this drawing covers (inclusive). */
  from: IconWeight;
  /** Heaviest weight this drawing covers (inclusive). */
  to: IconWeight;
  /** Filled paths that make up the drawing. */
  paths: readonly WeightedIconPath[];
}

/** One icon whose drawing changes with the surrounding font weight. */
export interface WeightedIconDef {
  /** Unique icon name; also the sprite symbol id suffix. */
  name: string;
  /** ViewBox dimensions (default: "0 0 24 24"). */
  viewBox?: string;
  /** Drawings ordered from lightest to heaviest. Together they cover 300-700. */
  layers: readonly WeightedIconLayer[];
}

export interface BuildWeightedIconOptions {
  /** ViewBox dimensions (default: "0 0 24 24"). */
  viewBox?: string;
  /**
   * The weights a product can reach. Drawings for other weights are dropped,
   * and those weights show the nearest kept drawing (the heavier one on a tie).
   * @default all five weights
   */
  weights?: readonly IconWeight[];
}

/** Extracts the filled paths of a single-color SVG drawing. */
export function parseSVGPaths(svg: string): WeightedIconPath[] {
  const paths: WeightedIconPath[] = [];
  for (const match of svg.matchAll(/<path\b([^>]*)>/g)) {
    const attrs = match[1];
    const d = /\sd="([^"]+)"/.exec(attrs)?.[1];
    if (d == null) {
      continue;
    }
    paths.push(/fill-rule="evenodd"/.test(attrs) ? {d, evenOdd: true} : {d});
  }
  return paths;
}

function nearestKept(weight: IconWeight, kept: readonly IconWeight[]) {
  let best = kept[0];
  for (const candidate of kept) {
    const distance = Math.abs(candidate - weight);
    const bestDistance = Math.abs(best - weight);
    if (
      distance < bestDistance ||
      (distance === bestDistance && candidate > best)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * Builds a weighted icon from one drawing per weight.
 *
 * @example
 * ```
 * const bell = buildWeightedIcon('bell', {300: svg300, 400: svg400, 500: svg500, 600: svg600, 700: svg700});
 * ```
 */
export function buildWeightedIcon(
  name: string,
  drawings: Partial<Record<IconWeight, string | readonly WeightedIconPath[]>>,
  options: BuildWeightedIconOptions = {},
): WeightedIconDef {
  const available = ICON_WEIGHTS.filter(w => drawings[w] != null);
  const kept = (options.weights ?? ICON_WEIGHTS).filter(w =>
    available.includes(w),
  );
  if (kept.length === 0) {
    throw new Error(
      `buildWeightedIcon(${name}): no drawing for any kept weight`,
    );
  }

  const pathsFor = (w: IconWeight): readonly WeightedIconPath[] => {
    const drawing = drawings[nearestKept(w, kept)];
    return typeof drawing === 'string'
      ? parseSVGPaths(drawing)
      : (drawing ?? []);
  };

  const layers: WeightedIconLayer[] = [];
  for (const weight of ICON_WEIGHTS) {
    const paths = pathsFor(weight);
    const previous = layers[layers.length - 1];
    if (
      previous != null &&
      JSON.stringify(previous.paths) === JSON.stringify(paths)
    ) {
      previous.to = weight;
    } else {
      layers.push({from: weight, to: weight, paths});
    }
  }

  return options.viewBox != null
    ? {name, viewBox: options.viewBox, layers}
    : {name, layers};
}
