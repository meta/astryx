// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useTypeahead.test.tsx
 * @input Uses vitest, @testing-library/react, useTypeahead hook
 * @output Unit tests for useTypeahead first-character search
 * @position Testing; validates useTypeahead.ts
 *
 * SYNC: When useTypeahead.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {Activity, type ReactNode} from 'react';
import {render, renderHook} from '@testing-library/react';
import {useTypeahead} from './useTypeahead';

const LABELS = ['Apple', 'Apricot', 'Banana', 'Cherry'] as const;
const NO_DISABLED: number[] = [];

function setup(opts?: {current?: number; disabledIndices?: number[]}) {
  const onMatch = vi.fn();
  const disabled = opts?.disabledIndices ?? NO_DISABLED;
  const {result} = renderHook(() =>
    useTypeahead({
      getItemLabels: () => LABELS,
      onMatch,
      getCurrentIndex: () => opts?.current ?? -1,
      isDisabled: (i: number) => disabled.includes(i),
    }),
  );
  return {onMatch, api: result.current};
}

function key(k: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {key: k});
}

describe('useTypeahead', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('matches the first item whose label starts with the typed character', () => {
    const {onMatch, api} = setup();
    const handled = api.onKeyDown(key('b'));
    expect(handled).toBe(true);
    expect(onMatch).toHaveBeenCalledWith(2); // Banana
  });

  it('accumulates the buffer to disambiguate (a → ap → apr)', () => {
    const {onMatch, api} = setup();
    api.onKeyDown(key('a')); // Apple (first "a")
    expect(onMatch).toHaveBeenLastCalledWith(0);
    api.onKeyDown(key('p')); // "ap" still Apple
    expect(onMatch).toHaveBeenLastCalledWith(0);
    api.onKeyDown(key('r')); // "apr" → Apricot
    expect(onMatch).toHaveBeenLastCalledWith(1);
  });

  it('cycles through same-letter matches on repeated presses', () => {
    // Start with nothing focused; repeated "a" walks Apple → Apricot → wrap.
    const onMatch = vi.fn();
    let current = -1;
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => LABELS,
        onMatch: (i: number) => {
          current = i;
          onMatch(i);
        },
        getCurrentIndex: () => current,
      }),
    );
    result.current.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenLastCalledWith(0); // Apple (first match)
    result.current.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenLastCalledWith(1); // advance to Apricot
    result.current.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenLastCalledWith(0); // wrap back to Apple
  });

  it('resets the buffer after the timeout', () => {
    const {onMatch, api} = setup();
    api.onKeyDown(key('a')); // Apple
    api.onKeyDown(key('p')); // Apple ("ap")
    vi.advanceTimersByTime(800);
    api.onKeyDown(key('b')); // fresh buffer → Banana
    expect(onMatch).toHaveBeenLastCalledWith(2);
  });

  it('clears the pending buffer reset when the component unmounts', () => {
    const {result, unmount} = renderHook(() =>
      useTypeahead({getItemLabels: () => LABELS, onMatch: vi.fn()}),
    );
    result.current.onKeyDown(key('a'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('empties the buffer when an Activity boundary hides the collection', () => {
    const latest: {api: ReturnType<typeof useTypeahead> | null} = {api: null};
    function Probe(): ReactNode {
      latest.api = useTypeahead({
        getItemLabels: () => LABELS,
        onMatch: vi.fn(),
      });
      return null;
    }
    const {rerender} = render(
      <Activity mode="visible">
        <Probe />
      </Activity>,
    );
    latest.api?.onKeyDown(key('a'));
    rerender(
      <Activity mode="hidden">
        <Probe />
      </Activity>,
    );
    expect(vi.getTimerCount()).toBe(0);
    rerender(
      <Activity mode="visible">
        <Probe />
      </Activity>,
    );
    // The typed prefix went with the hide, so a bare Space is not typeahead.
    expect(latest.api?.onKeyDown(key(' '))).toBe(false);
  });

  it('skips disabled items', () => {
    const {onMatch, api} = setup({disabledIndices: [0]}); // Apple disabled
    api.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenCalledWith(1); // Apricot
  });

  it('ignores control keys and modifier chords', () => {
    const {onMatch, api} = setup();
    expect(api.onKeyDown(key('ArrowDown'))).toBe(false);
    expect(
      api.onKeyDown(new KeyboardEvent('keydown', {key: 'a', metaKey: true})),
    ).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('does not treat a bare Space as typeahead', () => {
    const {onMatch, api} = setup();
    expect(api.onKeyDown(key(' '))).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('extends a live buffer with a space', () => {
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => ['Newark', 'New York'],
        onMatch,
      }),
    );
    for (const k of 'new ') {
      result.current.onKeyDown(key(k));
    }
    result.current.onKeyDown(key('y'));
    // "new y" reaches New York; a space that ended the buffer instead would
    // leave "newy", which matches nothing.
    expect(onMatch).toHaveBeenLastCalledWith(1);
  });

  it('ignores a Space chorded with ctrl or meta even mid-buffer', () => {
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => ['Melon', 'New York'],
        onMatch,
      }),
    );
    expect(result.current.onKeyDown(key('n'))).toBe(true);
    expect(onMatch).toHaveBeenLastCalledWith(1);

    // A chord is not typing. Consuming it would append a raw space and leave
    // the buffer as "n ", poisoning every keystroke until the reset window.
    expect(
      result.current.onKeyDown(
        new KeyboardEvent('keydown', {key: ' ', ctrlKey: true}),
      ),
    ).toBe(false);
    expect(
      result.current.onKeyDown(
        new KeyboardEvent('keydown', {key: ' ', metaKey: true}),
      ),
    ).toBe(false);

    result.current.onKeyDown(key('e'));
    expect(onMatch).toHaveBeenCalledTimes(2);
    expect(onMatch).toHaveBeenLastCalledWith(1);
  });

  it('starts a fresh single-character search after the current item', () => {
    const {onMatch, api} = setup({current: 0}); // Apple is current
    api.onKeyDown(key('a'));
    // A single-character search begins at current + 1, so pressing the current
    // item's own initial advances instead of re-matching it into a dead key.
    expect(onMatch).toHaveBeenCalledWith(1); // Apricot
  });

  it('searches from the top when there is no current item', () => {
    // The last item also matches, so this distinguishes "from the top" from
    // wrapping backwards off -1 and hitting the bottom of the list first.
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => ['Apple', 'Berry', 'Avocado'],
        onMatch,
        getCurrentIndex: () => -1,
      }),
    );
    result.current.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenCalledWith(0); // Apple, not Avocado
  });

  it('keeps the current item in range once the buffer is multi-character', () => {
    const {onMatch, api} = setup({current: 0});
    api.onKeyDown(key('a')); // single char: advances to Apricot
    expect(onMatch).toHaveBeenLastCalledWith(1);
    api.onKeyDown(key('p')); // "ap" refines, so Apple is a candidate again
    expect(onMatch).toHaveBeenLastCalledWith(0);
  });

  it('skips unmatchable label slots without shifting the reported index', () => {
    // Callers may pass null/empty entries to keep the index mapping 1:1 with
    // their own items — menus pass el.textContent, which can be null.
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => [null, '', '   ', undefined, 'Apple'],
        onMatch,
      }),
    );
    result.current.onKeyDown(key('a'));
    expect(onMatch).toHaveBeenCalledWith(4);
  });

  it('treats any negative or stale current index safely', () => {
    // A sentinel other than -1, and an index left over from a longer list:
    // neither may search backwards or report an index outside the list.
    const fromBelowZero = vi.fn();
    const {result: below} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => LABELS,
        onMatch: fromBelowZero,
        getCurrentIndex: () => -5,
      }),
    );
    below.current.onKeyDown(key('a'));
    expect(fromBelowZero).toHaveBeenCalledWith(0); // Apple, from the top

    const fromStale = vi.fn();
    const {result: stale} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => LABELS,
        onMatch: fromStale,
        getCurrentIndex: () => 7,
      }),
    );
    stale.current.onKeyDown(key('b'));
    expect(fromStale).toHaveBeenCalledWith(2); // Banana, in range
  });

  it('wraps onto the only item when the list has one entry', () => {
    // "Advance past the current item" is about cycling; with one item the
    // cycle is itself. The caller decides whether that is a no-op.
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => ['Apple'],
        onMatch,
        getCurrentIndex: () => 0,
      }),
    );
    expect(result.current.onKeyDown(key('a'))).toBe(true);
    expect(onMatch).toHaveBeenCalledWith(0);
  });

  it('matches characters composed with Option/Alt', () => {
    const onMatch = vi.fn();
    const {result} = renderHook(() =>
      useTypeahead({
        getItemLabels: () => ['Ångström', 'Berlin'],
        onMatch,
        getCurrentIndex: () => -1,
      }),
    );
    // Option+a on macOS emits a printable 'å' with altKey set. Excluding it
    // makes accented labels untypeable; real chords still carry ctrl/meta.
    const handled = result.current.onKeyDown(
      new KeyboardEvent('keydown', {key: 'å', altKey: true}),
    );
    expect(handled).toBe(true);
    expect(onMatch).toHaveBeenCalledWith(0);
  });

  it('ignores a key that is part of an input method composition', () => {
    const {onMatch, api} = setup();
    const handled = api.onKeyDown(
      new KeyboardEvent('keydown', {key: 'b', isComposing: true}),
    );
    expect(handled).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('ignores a composing Space even mid-buffer', () => {
    const {onMatch, api} = setup();
    api.onKeyDown(key('a'));
    const handled = api.onKeyDown(
      new KeyboardEvent('keydown', {key: ' ', isComposing: true}),
    );
    expect(handled).toBe(false);
    expect(onMatch).toHaveBeenCalledTimes(1);
  });

  it('ignores Control and Command chords on a letter', () => {
    const {onMatch, api} = setup();
    expect(
      api.onKeyDown(new KeyboardEvent('keydown', {key: 'b', ctrlKey: true})),
    ).toBe(false);
    expect(
      api.onKeyDown(new KeyboardEvent('keydown', {key: 'b', metaKey: true})),
    ).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('leaves the highlight where it was when nothing matches', () => {
    const {onMatch, api} = setup({current: 1});
    const handled = api.onKeyDown(key('z'));
    // The key is still consumed — it is typing, not a shortcut for the host.
    expect(handled).toBe(true);
    expect(onMatch).not.toHaveBeenCalled();
  });

  it('reads a React synthetic event’s isComposing through nativeEvent', () => {
    const {onMatch, api} = setup();
    const synthetic = {
      key: 'b',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      nativeEvent: {isComposing: true},
    } as unknown as React.KeyboardEvent;
    expect(api.onKeyDown(synthetic)).toBe(false);
    expect(onMatch).not.toHaveBeenCalled();
  });
});
