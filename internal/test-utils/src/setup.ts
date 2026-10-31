// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setup.ts
 * @input Uses @testing-library/jest-dom/vitest
 * @output Extends Vitest expect with jest-dom matchers (toBeInTheDocument, etc.)
 * @position Test setup; loaded by vitest.config.ts before all tests
 *
 * SYNC: When modified, update this header and /internal/test-utils/src/README.md
 */

/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import {configure} from '@testing-library/react';
import {afterEach} from 'vitest';
import {__resetClickGuardForTest} from '../../../packages/core/src/utils/clickGuard';

// Text queries (getByText/findByText/…) target VISIBLE text. Astryx's
// `useAnnounce` renders a visually-hidden aria-live region
// (`data-astryx-live-region`) that MIRRORS visible labels for screen readers —
// used by ~17 components (Calendar, Pagination, Typeahead, Switch, …). So a bare
// `getByText('January 2026')` can match BOTH the label and its announcement, and
// whether both are present is timing-dependent (the region updates on an effect
// after interaction). That makes such assertions liable to flaky "found multiple
// elements" failures under load. Ignore live regions in text matching (tests
// that assert an announcement query the region directly, e.g. by role="status").
// Keeps the jsdom defaults (script, style).
configure({defaultIgnore: 'script, style, [data-astryx-live-region]'});

// The click guard (packages/core/src/utils/clickGuard.ts) is armed per
// document by a gesture that already acted and disarms itself 400 ms later.
// A test that ends inside that window would leave the timer to fire after
// the environment tears its window down, during a later file. Disarm every
// guard as each test ends.
afterEach(() => {
  __resetClickGuardForTest();
});

// Polyfill for matchMedia (not supported in jsdom).
//
// `(hover: hover)` reports TRUE: jsdom models a desktop browser driven by a
// mouse, and userEvent's hover()/unhover() dispatch real mouseenter/mouseleave.
// Reporting false made every hover-gated behavior (useMenuHover, HoverCard,
// Tooltip) silently dead in tests — the hover-then-click bug fixed in #3121
// went unnoticed in three components partly because no unit test could reach
// the hover path. Tests that need a touch device override this per-test.
const HOVER_CAPABLE = /\(\s*hover\s*:\s*hover\s*\)/;

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => {
    const mql: MediaQueryList = {
      matches: HOVER_CAPABLE.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    };
    return mql;
  };
}

// Polyfill for Popover API (not supported in jsdom)
// This prevents errors when testing components that use XDSTooltip
if (typeof HTMLElement.prototype.showPopover === 'undefined') {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  HTMLElement.prototype.togglePopover = function () {
    return false;
  };
}

// Polyfill for matchMedia (not supported in jsdom)
// Used by useMediaQuery → useXDSTheme → useXDSStreamingText
if (typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: HOVER_CAPABLE.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// Polyfill for localStorage (this jsdom build exposes none).
// Used by useResizable's `autoSaveId` persistence.
if (typeof window.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    } satisfies Storage,
  });
}
