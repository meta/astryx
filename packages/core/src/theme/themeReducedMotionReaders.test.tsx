// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themeReducedMotionReaders.test.tsx
 * @input Theme, useReducesMotion and useStreamingText, on the client and in a
 *   server render, with themeMotion mocked so one test theme resolves to
 *   `reducedMotion: 'always'`
 * @output Verifies a hook that holds no element reads a theme's 'always'
 *   (with the person's setting off), that a nested theme keeps an ancestor's,
 *   and that the server markup already shows the reduced result
 * @position Companion to themeReducedMotionMark.test.tsx, which covers the
 *   DOM mark that code holding an element reads
 */

import type {ReactElement, ReactNode} from 'react';
import {renderHook} from '@testing-library/react';
import {renderToString} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {useReducesMotion} from '../motion/reducedMotion';
import {useStreamingText} from '../hooks/useStreamingText';
import {defineTheme} from './defineTheme';
import {Theme} from './Theme';
import type * as ThemeMotion from './themeMotion';

// No public theme can set reducedMotion yet, so a theme whose motion has
// tempo 0.76 resolves to 'always' through this mock.
vi.mock('./themeMotion', async importOriginal => {
  const actual = await importOriginal<typeof ThemeMotion>();
  return {
    ...actual,
    resolveMotionKnobs: (config?: {tempo?: number}) => {
      const resolved = actual.resolveMotionKnobs(config);
      return config?.tempo === 0.76
        ? {...resolved, reducedMotion: 'always' as const}
        : resolved;
    },
  };
});

const still = defineTheme({name: 'ReadersStill', motion: {tempo: 0.76}});
const moving = defineTheme({name: 'ReadersMoving', motion: {tempo: 1.2}});

function under(...themes: (typeof still)[]) {
  return function Wrapper({children}: {children: ReactNode}): ReactElement {
    return themes.reduceRight<ReactElement>(
      (inner, theme) => <Theme theme={theme}>{inner}</Theme>,
      <>{children}</>,
    );
  };
}

describe("a hook that holds no element and a theme's reducedMotion: 'always'", () => {
  it("reads 'always' with the setting off", () => {
    const {result} = renderHook(() => useReducesMotion(), {
      wrapper: under(still),
    });
    expect(result.current).toBe(true);
  });

  it("keeps an ancestor theme's 'always' under a nested theme", () => {
    const {result} = renderHook(() => useReducesMotion(), {
      wrapper: under(still, moving),
    });
    expect(result.current).toBe(true);
  });

  it('leaves motion on under a theme that leaves it to the setting', () => {
    const {result} = renderHook(() => useReducesMotion(), {
      wrapper: under(moving),
    });
    expect(result.current).toBe(false);
  });

  it("streaming text shows the full text under 'always', and reveals it progressively otherwise", () => {
    const shown = (theme: typeof still) =>
      renderHook(() => useStreamingText('Hello world', true), {
        wrapper: under(theme),
      }).result.current;
    expect(shown(still)).toBe('Hello world');
    expect(shown(moving)).toBe('');
  });

  it("the server markup shows the full streaming text and the mark under 'always'", () => {
    function Stream(): ReactElement {
      return <p>{useStreamingText('Hello world', true)}</p>;
    }
    const html = renderToString(
      <Theme theme={still}>
        <Stream />
      </Theme>,
    );
    expect(html).toContain('data-astryx-reduced-motion');
    expect(html).toContain('<p>Hello world</p>');
  });
});
