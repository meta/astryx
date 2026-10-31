// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stubMatchMedia.test.ts
 * @input Uses vitest, stubMatchMedia
 * @output Unit coverage for the shared query-aware matchMedia stub
 * @position Testing; guards the helper other suites trust to route queries
 *
 * The helper exists because a stub that ignores its query silently reroutes
 * code branching on a different one — the failure mode leaves every test
 * green. A helper sold on that promise has to be held to it, so these assert
 * the routing itself rather than any component behaviour.
 */

import {describe, it, expect, afterEach, vi} from 'vitest';
import {stubMatchMedia} from './stubMatchMedia';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('stubMatchMedia', () => {
  it('routes prefers-reduced-motion independently of every other query', () => {
    // The exact combination the blanket stub could not express: below a
    // breakpoint (matches) while motion is NOT reduced.
    stubMatchMedia({reduceMotion: false, matches: true});

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(matchMedia('(max-width: 768px)').matches).toBe(true);
  });

  it('answers no-preference as the opposite of reduce', () => {
    // Two spellings, opposite meanings. A substring test on
    // 'prefers-reduced-motion' alone would hand both the same answer.
    stubMatchMedia({reduceMotion: true});

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    expect(matchMedia('(prefers-reduced-motion: no-preference)').matches).toBe(
      false,
    );
  });

  it('treats the bare preference query as reduce', () => {
    stubMatchMedia({reduceMotion: true});
    expect(matchMedia('(prefers-reduced-motion)').matches).toBe(true);

    stubMatchMedia({reduceMotion: false});
    expect(matchMedia('(prefers-reduced-motion)').matches).toBe(false);
  });

  it('defaults to full motion and matching everything else', () => {
    stubMatchMedia();

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(false);
    expect(matchMedia('(max-width: 768px)').matches).toBe(true);
  });

  it('answers the pointer queries from their own knob, fine by default', () => {
    stubMatchMedia();
    expect(matchMedia('(pointer: coarse)').matches).toBe(false);
    expect(matchMedia('(pointer: fine)').matches).toBe(true);

    stubMatchMedia({pointer: 'coarse'});
    expect(matchMedia('(pointer: coarse)').matches).toBe(true);
    expect(matchMedia('(pointer: fine)').matches).toBe(false);
    expect(matchMedia('(max-width: 768px)').matches).toBe(true);
  });

  it('lets a non-motion query be answered false', () => {
    // Above the breakpoint, motion still reduced — the other axis of the
    // combination, so neither knob can be quietly driving both.
    stubMatchMedia({reduceMotion: true, matches: false});

    expect(matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    expect(matchMedia('(max-width: 768px)').matches).toBe(false);
  });

  it('echoes the query and exposes the listener API components subscribe to', () => {
    stubMatchMedia();
    const mql = matchMedia('(max-width: 768px)');

    // useMediaQuery subscribes; a stub without these throws on mount rather
    // than failing an assertion, which reads as an unrelated crash.
    expect(mql.media).toBe('(max-width: 768px)');
    expect(typeof mql.addEventListener).toBe('function');
    expect(typeof mql.removeEventListener).toBe('function');
    expect(typeof mql.addListener).toBe('function');
    expect(typeof mql.removeListener).toBe('function');
  });
});
