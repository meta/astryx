// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file snapOffsets.ts
 * @input Pure geometry helpers — no React, no DOM.
 * @output Resolves snap points and converts them to translateY offsets.
 * @position Internal to BottomSheet; consumed by useSheetGestures and
 *   BottomSheetPanel, tested by snapOffsets.test.ts.
 *
 * A detent is represented as an offset in px from the fully-open position
 * (0 = fully open, larger = more collapsed). The panel may render that offset
 * as a translate or as a reduction in layout height. These
 * helpers turn snap points into the shared offset list; they are pure so the
 * geometry can be unit-tested without a DOM.
 */

/**
 * A height the sheet can rest at, expressed as the sheet's VISIBLE height:
 *
 * - a number in `(0, 1]` — a fraction of the viewport (`0.5` is half the
 *   screen), so the stop tracks rotation and window resizes;
 * - a `'<n>%'` string — the same thing spelled in CSS;
 * - a `'<n>px'` string — an absolute height that does not scale.
 *
 * Anything else — a unitless string, `calc()`, `vh`, `rem`, a number outside
 * `(0, 1]` — is ignored with a dev warning. Percentages resolve against the
 * layout viewport (`window.innerHeight`), the same box the height budgets are
 * written against, so the mobile keyboard never moves a stop.
 */
export type BottomSheetSnapPoint = number | string;

/**
 * Detents whose resting offsets land within this many px of each other are
 * treated as the same stop (the taller one wins). Stops the sheet from having
 * two near-identical rest positions — e.g. when a content-hugging height sits
 * a hair away from a fractional snap point.
 */
export const DETENT_DEDUP_PX = 48;

/**
 * Largest share of the fully open sheet the shortest stop may fill and still
 * be a peek. Above it the stop is a working surface — it lays its content out
 * and keeps a full scrim — so a two-stop sheet like `[0.5]` behaves like the
 * half-height panel it asks for rather than like a glance.
 */
export const PEEK_MAX_HEIGHT_RATIO = 0.25;

// A snap point string: a positive number with a `px` or `%` unit. Deliberately
// narrow — every accepted unit has to be resolvable by arithmetic on the
// viewport height, because this runs inside the drag loop. Units that need the
// DOM to resolve (`rem`, `em`, `calc()`) would cost a layout per frame.
const SNAP_POINT_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)(px|%)$/i;

/**
 * Resolve one snap point to a visible height in px, or `null` when it is not a
 * snap point this sheet can honor.
 */
function parseSnapPoint(
  point: BottomSheetSnapPoint,
  viewportPx: number,
): number | null {
  if (typeof point === 'number') {
    // A bare number is a viewport fraction. Anything above 1 is a px value in
    // disguise; the caller warns rather than guessing which was meant.
    return Number.isFinite(point) && point > 0 && point <= 1
      ? point * viewportPx
      : null;
  }
  const match = SNAP_POINT_PATTERN.exec(point.trim());
  if (match === null) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  if (!(value > 0)) {
    return null;
  }
  return match[2].toLowerCase() === '%' ? (value / 100) * viewportPx : value;
}

/**
 * Whether a snap point can be resolved at all. The viewport only scales the
 * result, so validity is independent of it.
 */
export function isValidSnapPoint(point: BottomSheetSnapPoint): boolean {
  return parseSnapPoint(point, 1) !== null;
}

/**
 * Resolve snap points to candidate visible heights in px, dropping the ones
 * this sheet cannot honor. Callers warn about those separately — this stays
 * silent because it runs on every drag frame.
 */
export function resolveSnapPoints(
  points: ReadonlyArray<BottomSheetSnapPoint>,
  viewportPx: number,
): number[] {
  const heights: number[] = [];
  for (const point of points) {
    const height = parseSnapPoint(point, viewportPx);
    if (height !== null) {
      heights.push(height);
    }
  }
  return heights;
}

/**
 * Given the sheet's full height (px, as rendered fully open) and a set of
 * candidate detent *visible heights* (px), return the resting offsets from
 * fully-open, ascending and de-duplicated.
 *
 * - `0` (fully open) is always the first detent.
 * - Only heights strictly shorter than the sheet become collapsed detents; a
 *   height >= the sheet is already covered by the fully-open stop.
 * - Offsets closer than `dedupPx` collapse to the smaller (taller) offset, so
 *   near-identical detents — e.g. a hug height ≈ a snap point — become one stop.
 */
export function computeDetentOffsets(
  sheetHeight: number,
  detentHeights: ReadonlyArray<number>,
  dedupPx: number = DETENT_DEDUP_PX,
): number[] {
  const collapsed = detentHeights
    .filter(h => h > 0 && h < sheetHeight)
    .map(h => sheetHeight - h);
  const ascending = [0, ...collapsed].sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const offset of ascending) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || offset - last >= dedupPx) {
      deduped.push(offset);
    }
  }
  return deduped;
}

/** Nearest value in `offsets` to `value` (offsets must be non-empty). */
export function nearestOffset(
  value: number,
  offsets: ReadonlyArray<number>,
): number {
  return offsets.reduce(
    (best, o) => (Math.abs(o - value) < Math.abs(best - value) ? o : best),
    offsets[0],
  );
}

/**
 * Minimum scrim opacity at the peek detent. The scrim thins to a glance state
 * but never fully vanishes, because a modal sheet keeps the background inert —
 * a fully clear backdrop would read as "interactive" when it isn't. (For a
 * genuinely interactive, undimmed peek, use a non-modal sheet, `hasScrim=false`.)
 */
export const MIN_PEEK_SCRIM_OPACITY = 0.3;

/**
 * The peek detent's offset, or `null` when this sheet has no peek.
 *
 * A peek is the shortest stop AND a sliver — at most `PEEK_MAX_HEIGHT_RATIO`
 * of the fully open sheet. It is the one detent the sheet does NOT express as
 * layout height: at a sliver there is nothing useful to lay out, and reflowing
 * the content into it (then back out on the way up) is churn the user sees, so
 * it keeps the full layout height and slides below the viewport instead. It is
 * also the only stop that thins the scrim.
 *
 * A sheet whose shortest stop is a working height — `[0.5]`, say — has no
 * peek: half a screen of content deserves to be laid out at half a screen, and
 * a scrim that thinned there would read as a dismissed sheet.
 */
export function peekOffsetFor(
  offsets: ReadonlyArray<number>,
  visibleSheetHeight: number,
): number | null {
  if (offsets.length < 2 || visibleSheetHeight <= 0) {
    return null;
  }
  const shortest = offsets[offsets.length - 1];
  const heightAtShortest = visibleSheetHeight - shortest;
  return heightAtShortest <= PEEK_MAX_HEIGHT_RATIO * visibleSheetHeight
    ? shortest
    : null;
}

/**
 * Scrim opacity (1 = fully visible) for a drag/settle `offset`.
 *
 * The scrim is full down to the shortest stop that is still a working surface,
 * and only thins past it — onto a peek, where it holds at
 * `MIN_PEEK_SCRIM_OPACITY` (a glance state, and the sheet is still modal), or
 * out toward `dismissOffset`, linearly, clearing completely there. Pass the
 * dismissed position (the sheet's top at the bottom of the screen): UIKit's
 * dim is linear in the sheet's position from its shortest detent to there.
 *
 * So a sheet whose stops are all working heights keeps a full scrim at every
 * one of them; only the sliver of a peek, or a sheet on its way out, dims less.
 */
export function scrimOpacityForOffset(
  offset: number,
  offsets: ReadonlyArray<number>,
  dismissOffset: number,
  peekOffset: number | null,
): number {
  const hasPeek = peekOffset !== null;
  // The last stop that is still a working surface — the peek's neighbor when
  // there is a peek, otherwise the shortest stop itself.
  const fadeStart = hasPeek
    ? offsets[offsets.length - 2]
    : offsets[offsets.length - 1];
  const fadeEnd = hasPeek ? peekOffset : dismissOffset;
  const floor = hasPeek ? MIN_PEEK_SCRIM_OPACITY : 0;
  if (offset <= fadeStart) {
    return 1;
  }
  if (offset >= fadeEnd) {
    return floor;
  }
  return 1 - (1 - floor) * ((offset - fadeStart) / (fadeEnd - fadeStart));
}

/**
 * Settle target for a released drag. Restricts candidates to the drag
 * direction so a committed drag never snaps *back past* where it started
 * (a down-drag settles at/below the start, an up-drag at/above), then picks
 * the nearest remaining detent. `dir`: 1 = dragged down, -1 = up, 0 = neither.
 */
export function resolveSettleOffset(
  value: number,
  offsets: ReadonlyArray<number>,
  dir: number,
  baseOffset: number,
): number {
  let candidates = offsets;
  if (dir > 0) {
    const downward = offsets.filter(o => o >= baseOffset);
    if (downward.length > 0) {
      candidates = downward;
    }
  } else if (dir < 0) {
    const upward = offsets.filter(o => o <= baseOffset);
    if (upward.length > 0) {
      candidates = upward;
    }
  }
  return nearestOffset(value, candidates);
}
