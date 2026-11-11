// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeReducedMotionMark.test.tsx
 * @input vitest (jsdom), React Testing Library, react-dom/server, Theme and
 *   defineTheme; themeMotion's resolveMotionKnobs, mocked to resolve one
 *   theme to 'always', since no public theme can yet
 * @output Checks the reduced-motion mark: a theme that resolves to 'always'
 *   marks its wrapper (in a server render too) and, as the root theme,
 *   `<html>`, with the attribute and its custom property; 'system' marks
 *   nothing; a nested theme marks only its own wrapper; the mark leaves with
 *   the theme. Every theme resolves to 'system' unmocked
 * @position Testing; validates Theme.tsx's use of themeMotion.ts
 */

import {render} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {defineTheme} from './defineTheme';
import {Theme} from './Theme';
import type * as ThemeMotion from './themeMotion';

type ThemeMotionModule = typeof ThemeMotion;

const MARK = 'data-astryx-reduced-motion';
const PROPERTY = '--_astryx-reduced-motion';
const ALWAYS_NAME = 'StillAlways';

const knobs = vi.hoisted(() => ({isAlwaysOn: false}));

vi.mock('./themeMotion', async importOriginal => {
  const actual = await importOriginal<ThemeMotionModule>();
  return {
    ...actual,
    resolveMotionKnobs: (config?: {tempo?: number}) => {
      const resolved = actual.resolveMotionKnobs(config);
      // The 'always' theme carries a tempo no other theme here uses.
      return knobs.isAlwaysOn && config?.tempo === 0.8
        ? {...resolved, reducedMotion: 'always' as const}
        : resolved;
    },
  };
});

const always = defineTheme({name: ALWAYS_NAME, motion: {tempo: 0.8}});
const system = defineTheme({name: 'StillSystem', motion: {tempo: 1.2}});

function wrapperOf(container: HTMLElement, name: string) {
  return container.querySelector(`[data-astryx-theme="${name}"]`);
}

afterEach(() => {
  knobs.isAlwaysOn = false;
  document.documentElement.removeAttribute(MARK);
  document.documentElement.style.removeProperty(PROPERTY);
});

describe('the reduced-motion mark', () => {
  it("every theme resolves to 'system' and marks nothing", () => {
    const {container} = render(
      <Theme theme={always}>
        <p>content</p>
      </Theme>,
    );
    expect(wrapperOf(container, ALWAYS_NAME)?.hasAttribute(MARK)).toBe(false);
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
  });

  it("'always' marks the wrapper and, at the root, <html>; the mark leaves with the theme", () => {
    knobs.isAlwaysOn = true;
    const {container, unmount} = render(
      <Theme theme={always}>
        <p>content</p>
      </Theme>,
    );
    expect(wrapperOf(container, ALWAYS_NAME)?.hasAttribute(MARK)).toBe(true);
    expect(document.documentElement.hasAttribute(MARK)).toBe(true);
    expect(document.documentElement.style.getPropertyValue(PROPERTY)).toBe('1');
    unmount();
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
    expect(document.documentElement.style.getPropertyValue(PROPERTY)).toBe('');
  });

  it('a nested theme marks its own wrapper only', () => {
    knobs.isAlwaysOn = true;
    const {container} = render(
      <Theme theme={system}>
        <Theme theme={always}>
          <p>content</p>
        </Theme>
      </Theme>,
    );
    expect(wrapperOf(container, 'StillSystem')?.hasAttribute(MARK)).toBe(false);
    expect(wrapperOf(container, ALWAYS_NAME)?.hasAttribute(MARK)).toBe(true);
    expect(document.documentElement.hasAttribute(MARK)).toBe(false);
  });

  it('the server renders the mark, so hydration changes nothing', () => {
    knobs.isAlwaysOn = true;
    expect(
      renderToString(
        <Theme theme={always}>
          <p>content</p>
        </Theme>,
      ),
    ).toContain(MARK);
    expect(
      renderToString(
        <Theme theme={system}>
          <p>content</p>
        </Theme>,
      ),
    ).not.toContain(MARK);
  });
});
