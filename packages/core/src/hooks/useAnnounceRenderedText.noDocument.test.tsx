// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounceRenderedText renders where there is no document.
 * @input renderToString of a component that uses the hook, with `document`
 *   stubbed away (core's suites run in jsdom; a server render has no document)
 * @output A server render that completes instead of throwing
 * @position Regression guard: 0.7.5 reads `document.readyState` in a useState
 *   initializer whenever the render is not hydrating, so a client render with
 *   no DOM (react-test-renderer, a host's non-DOM test harness) of an adopter
 *   such as Selector, CommandPalette or ChatComposer throws "document is not
 *   defined". A react-dom server render is safe today only because
 *   useIsHydrating's server snapshot is true; this pins the hook itself.
 */

import {useRef} from 'react';
import {renderToString} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {useAnnounceRenderedText} from './useAnnounceRenderedText';

// A client render that is not hydrating, as react-test-renderer is.
vi.mock('./useIsHydrating', () => ({useIsHydrating: () => false}));

function Status() {
  const ref = useRef<HTMLDivElement>(null);
  useAnnounceRenderedText(ref, true, 'status', {skipFirstRender: true});
  return <div ref={ref}>Ready</div>;
}

describe('useAnnounceRenderedText without a document', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders without a document when not hydrating', () => {
    vi.stubGlobal('document', undefined);
    expect(typeof document).toBe('undefined');
    expect(renderToString(<Status />)).toContain('Ready');
  });
});
