// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file nativeDateSegments.ts
 * @input Uses the DOM only
 * @output Exports hasEditableDateSegments, resetDateSegmentProbe
 * @position Internal helper for NativeDateField; answers "can the user type
 *   into this engine's `<input type="date">`?"
 *
 * `<input type="date">` is two different controls wearing one tag name: a
 * single untypable run the OS picker drives (iOS, Android), or a row of
 * editable `mm`/`dd`/`yyyy` fields (desktop engines). Hiding the first costs
 * nothing; hiding the second hides what the user is editing.
 *
 * Neither obvious test tells them apart. The pointer is wrong on Chrome's
 * touch simulator, a Windows tablet and a ChromeOS convertible, which report
 * a coarse pointer while Blink still renders segments. And measured, iOS and
 * Chromium BOTH accept every `-webkit-datetime-*` selector, so
 * `CSS.supports('selector(...)')` only proves the parser knows the name. What
 * separates them is which pseudo is a real box, so this measures that.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/DateInput/NativeDateField.tsx (the caller)
 * - /packages/core/src/DateInput/NativeDateField.test.tsx (tests)
 */

/** Marks the throwaway probe element for the probe stylesheet. */
const PROBE_ATTR = 'data-astryx-date-probe';

/** How much padding the probe adds, in px. Large enough to beat rounding. */
const PROBE_PADDING = 100;

type EngineKind = 'segmented' | 'picker-only' | 'unknown';

let cachedEngine: EngineKind | null = null;

/** Whether padding this pseudo-element moves the control's box. */
function pseudoIsRealBox(
  input: HTMLInputElement,
  style: HTMLStyleElement,
  pseudo: string,
  baseWidth: number,
): boolean {
  style.textContent = `[${PROBE_ATTR}]${pseudo}{padding-inline-start:${PROBE_PADDING}px !important}`;
  // Reading geometry flushes style and layout, so this already reflects it.
  return input.getBoundingClientRect().width > baseWidth + PROBE_PADDING / 2;
}

/**
 * Classifies the engine's date control. Cached: the answer is a build-time
 * property of the browser, not of the field or the pointer in use.
 */
function probeEngine(): EngineKind {
  if (cachedEngine !== null) {
    return cachedEngine;
  }
  if (typeof document === 'undefined' || !document.body) {
    return 'unknown';
  }

  const input = document.createElement('input');
  input.setAttribute('type', 'date');
  input.setAttribute(PROBE_ATTR, '');
  // Off-screen, and immune to the page's own `input` rules: the probe reads a
  // width DELTA, so anything pinning the width would swallow the signal.
  input.style.cssText =
    'position:fixed;top:-9999px;left:0;width:auto;min-width:0;max-width:none;' +
    'padding:0;border:0;font-size:16px;box-sizing:content-box;';

  const style = document.createElement('style');

  let kind: EngineKind = 'unknown';
  try {
    document.body.appendChild(input);
    document.head.appendChild(style);
    const base = input.getBoundingClientRect().width;
    if (pseudoIsRealBox(input, style, '::-webkit-datetime-edit', base)) {
      // Chromium's editable field row, and WebKit's on macOS/GTK. Probe the
      // container: the individual field pseudos overflow it rather than
      // expand it, so they do not move the box even in Chromium.
      kind = 'segmented';
    } else if (
      pseudoIsRealBox(input, style, '::-webkit-date-and-time-value', base)
    ) {
      // The single, untypable run iOS Safari and Chrome on Android paint.
      kind = 'picker-only';
    }
  } catch {
    // A hostile CSSOM leaves the answer unknown, resolved by the pointer.
  } finally {
    input.remove();
    style.remove();
  }

  cachedEngine = kind;
  return kind;
}

/**
 * Whether the user can type into this engine's `<input type="date">`.
 *
 * Firefox exposes neither pseudo-element, so it — and any future engine —
 * comes back `'unknown'` and the pointer breaks the tie. That is the right
 * fallback precisely where the probe is blind: the pointer is wrong for
 * Chromium because Blink's answer is fixed at build time and contradicts it,
 * and an engine we cannot see is not in that position. It lands Firefox on
 * the desktop (segmented) and on Android (picker-only) correctly.
 *
 * @param isTouchPointer Whether `(pointer: coarse)` matches.
 * @internal Exported for tests.
 */
export function hasEditableDateSegments(isTouchPointer: boolean): boolean {
  const engine = probeEngine();
  return engine === 'unknown' ? !isTouchPointer : engine === 'segmented';
}

/**
 * Drops the cached classification.
 *
 * @internal Exists for tests, which render against several engines in one
 *   document.
 */
export function resetDateSegmentProbe(): void {
  cachedEngine = null;
}
