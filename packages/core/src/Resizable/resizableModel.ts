// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file resizableModel.ts
 * @input Size values (pixels, `Npx`, `N%`, pixel() and percent()), a basis,
 *   bounds, snap points, and a storage key
 * @output The resize model's pure parts: size parsing and resolution against a
 *   basis, clamping and snapping, persistence, and the content-box measurement
 *   of a percentage basis
 * @position Shared by useResizable and createResizable, so both resolve,
 *   clamp, snap and persist alike; no React, and no DOM work on import
 */

import {devWarn} from '../utils/devWarning';

export type ResizableDirection = 'horizontal' | 'vertical';

export const DEFAULT_MIN = 50;
export const DEFAULT_COLLAPSED_SIZE = 40;
export const STORAGE_PREFIX = 'astryx-resizable:';

export function clampSize(
  size: number,
  min: number,
  max: number,
  snaps: number[],
): number {
  const clamped = Math.min(max, Math.max(min, size));

  // When snap points are defined, always snap to the nearest one.
  // No intermediate positions — the panel can only rest at snap values.
  if (snaps.length > 0) {
    let nearest = snaps[0];
    let nearestDist = Math.abs(clamped - nearest);
    for (let i = 1; i < snaps.length; i++) {
      const dist = Math.abs(clamped - snaps[i]);
      if (dist < nearestDist) {
        nearest = snaps[i];
        nearestDist = dist;
      }
    }
    return Math.min(max, Math.max(min, nearest));
  }

  return clamped;
}

export interface PersistedResizableState {
  /** Expanded size in px, or null when the entry carries no usable size. */
  size: number | null;
  /**
   * Collapse state when the entry was written, or null when the entry
   * predates collapse persistence and says nothing about it.
   */
  isCollapsed: boolean | null;
}

/**
 * Reads a persisted entry. Three formats exist in storage:
 * - `{size, isCollapsed}` — the current format; `size` is the expanded size,
 *   so the pre-collapse width survives a collapsed session
 * - a plain non-zero number — a legacy width-only entry that never recorded
 *   collapse, so `isCollapsed` is null (unknown)
 * - a plain `0` — written by legacy collapse, which restored the region as a
 *   zero-width expanded panel (#4790); read as "collapsed, no saved size"
 */
export function loadPersistedState(
  key: string,
): PersistedResizableState | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'number') {
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return parsed === 0
        ? {size: null, isCollapsed: true}
        : {size: parsed, isCollapsed: null};
    }
    if (typeof parsed === 'object' && parsed != null) {
      const {size, isCollapsed} = parsed as {
        size?: unknown;
        isCollapsed?: unknown;
      };
      const hasSize =
        typeof size === 'number' && Number.isFinite(size) && size > 0;
      if (hasSize || isCollapsed === true) {
        return {
          size: hasSize ? size : null,
          isCollapsed: isCollapsed === true,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function persistState(
  key: string,
  state: PersistedResizableState,
): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** The released compatibility basis when there is no window to measure. */
export const SERVER_BASIS = 1200;

export const DEFAULT_SIZE_FALLBACK = 250;
export const RESIZABLE_SIZE_GUIDANCE =
  'Use a non-negative number of pixels, an exact "Npx" string, an exact ' +
  '"N%" string from 0% to 100%, pixel(value), or ' +
  'percent(value, {min: pixel(value)}) / percent(value, {max: pixel(value)}).';

/** Parsed, validated input. */
export type ParsedSize =
  | {kind: 'px'; value: number}
  | {kind: 'percent'; value: number; min?: number; max?: number};

const PX_PATTERN = /^(\d+(?:\.\d+)?)px$/;
const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)%$/;

function parseSizeString(value: string): ParsedSize | null {
  // Preserve the released atomic fast path exactly.
  const px = PX_PATTERN.exec(value);
  if (px) {
    const parsed = Number(px[1]);
    return Number.isFinite(parsed) ? {kind: 'px', value: parsed} : null;
  }
  const percentValue = PERCENT_PATTERN.exec(value);
  if (percentValue) {
    const parsed = Number(percentValue[1]);
    return Number.isFinite(parsed) && parsed <= 100
      ? {kind: 'percent', value: parsed}
      : null;
  }
  return null;
}

function parsePixelSize(value: unknown): number | null {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return null;
  }
  const candidate = value as {type?: unknown; value?: unknown};
  return candidate.type === 'pixel' &&
    typeof candidate.value === 'number' &&
    Number.isFinite(candidate.value) &&
    candidate.value >= 0
    ? candidate.value
    : null;
}

function parsePercentSize(value: object): ParsedSize | null {
  if (Array.isArray(value)) {
    return null;
  }
  const candidate = value as {
    type?: unknown;
    value?: unknown;
    min?: unknown;
    max?: unknown;
  };
  if (
    candidate.type !== 'percent' ||
    typeof candidate.value !== 'number' ||
    !Number.isFinite(candidate.value) ||
    candidate.value < 0 ||
    candidate.value > 100
  ) {
    return null;
  }

  const hasMin = candidate.min !== undefined;
  const hasMax = candidate.max !== undefined;
  // Exactly one bound is required. The helper's public type enforces this for
  // typed callers; this branch preserves it for JavaScript and `any`.
  if (hasMin === hasMax) {
    return null;
  }
  if (hasMin) {
    const min = parsePixelSize(candidate.min);
    return min == null ? null : {kind: 'percent', value: candidate.value, min};
  }
  const max = parsePixelSize(candidate.max);
  return max == null ? null : {kind: 'percent', value: candidate.value, max};
}

export function parseSize(value: unknown): ParsedSize | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? {kind: 'px', value} : null;
  }
  if (typeof value === 'string') {
    return parseSizeString(value);
  }
  if (typeof value === 'object' && value != null) {
    const pixelValue = parsePixelSize(value);
    return pixelValue == null
      ? parsePercentSize(value)
      : {kind: 'px', value: pixelValue};
  }
  return null;
}

/** Whether this parsed value must be recomputed when its basis changes. */
export function dependsOnBasis(parsed: ParsedSize | null): boolean {
  return parsed?.kind === 'percent';
}

/** Resolve a parsed size against its basis, then apply its one pixel bound. */
export function toPixels(
  parsed: ParsedSize,
  basis: number | null,
): number | null {
  if (parsed.kind === 'px') {
    return parsed.value;
  }
  if (basis == null) {
    return null;
  }
  const percentagePx = Math.round((parsed.value / 100) * basis);
  if (parsed.min !== undefined) {
    return Math.max(percentagePx, parsed.min);
  }
  if (parsed.max !== undefined) {
    return Math.min(percentagePx, parsed.max);
  }
  return percentagePx;
}

function describeUnknown(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describePixelCandidate(value: unknown): string {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) {
    return describeUnknown(value);
  }
  const candidate = value as {type?: unknown; value?: unknown};
  return candidate.type === 'pixel'
    ? `{"type":"pixel","value":${describeUnknown(candidate.value)}}`
    : describeUnknown(value);
}

function describeSize(value: unknown): string {
  if (typeof value === 'object' && value != null && !Array.isArray(value)) {
    const candidate = value as {
      type?: unknown;
      value?: unknown;
      min?: unknown;
      max?: unknown;
    };
    if (candidate.type === 'pixel') {
      return describePixelCandidate(value);
    }
    if (candidate.type === 'percent') {
      const fields = [
        '"type":"percent"',
        `"value":${describeUnknown(candidate.value)}`,
      ];
      if (candidate.min !== undefined) {
        fields.push(`"min":${describePixelCandidate(candidate.min)}`);
      }
      if (candidate.max !== undefined) {
        fields.push(`"max":${describePixelCandidate(candidate.max)}`);
      }
      return `{${fields.join(',')}}`;
    }
  }
  return describeUnknown(value);
}

/**
 * Resolves one configured value, applying its role's fallback when the input is
 * not accepted. The warning remains development-only through `devWarn`; every
 * build takes the same deterministic fallback.
 */
export function resolveBound(
  raw: unknown,
  parsed: ParsedSize | null,
  basis: number | null,
  fallback: number,
  label: string,
  accepted: string,
  didWarnRef: {current: boolean},
  source = 'useResizable',
): number {
  if (raw === undefined) {
    return fallback;
  }
  // Preserve the released explicit unbounded maximum. Other roles still
  // reject non-finite numbers.
  if (raw === Infinity && fallback === Infinity) {
    return Infinity;
  }
  if (parsed == null) {
    if (!didWarnRef.current) {
      didWarnRef.current = true;
      devWarn(
        source,
        `${label}: ${describeSize(raw)} is not a size. ${accepted} ` +
          `Falling back to ${fallback}.`,
      );
    }
    return fallback;
  }
  return toPixels(parsed, basis) ?? fallback;
}

/**
 * The container's content-box size on the active axis.
 *
 * Content box, not border box: a bordered or padded container would otherwise
 * report a basis a few pixels larger than the space a percentage is actually a
 * share of, and that error lands in `aria-valuemax`. The observer entry
 * carries `contentBoxSize` natively, which is already writing-mode aware;
 * measuring the element is the fallback for the synthetic entry
 * `observeResize` fires on registration.
 */
export function measureContentBox(
  element: HTMLElement,
  direction: ResizableDirection,
  entry?: ResizeObserverEntry,
): number | null {
  const box = entry?.contentBoxSize?.[0];
  if (box) {
    return direction === 'vertical' ? box.blockSize : box.inlineSize;
  }
  const style =
    typeof window === 'undefined' ? null : window.getComputedStyle(element);
  if (style == null) {
    return null;
  }
  const size =
    direction === 'vertical'
      ? element.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom)
      : element.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
  return Number.isFinite(size) ? size : null;
}
