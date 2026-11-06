// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useCollator.test.tsx
 * @input packages/core/src/i18n/useCollator.ts, InternationalizationProvider
 * @output Unit tests for the internal provider-aware Intl.Collator hook
 * @position Colocated tests; targets the default (no-provider) fallback,
 *   locale-driven comparison order, option threading, and memoization.
 */

import type {ReactNode} from 'react';
import {describe, expect, test} from 'vitest';
import {render, renderHook} from '@testing-library/react';
import {useCollator} from '../useCollator';
import {InternationalizationProvider} from '../InternationalizationProvider';

function wrapperFor(locale: string) {
  return ({children}: {children: ReactNode}) => (
    <InternationalizationProvider locale={locale}>
      {children}
    </InternationalizationProvider>
  );
}

describe('useCollator', () => {
  test('compares using the en fallback when rendered without a provider', () => {
    const {result} = renderHook(() => useCollator());
    expect(result.current.compare('a', 'b')).toBeLessThan(0);
  });

  test('orders "ä" before "z" under Swedish, and after "z" under German', () => {
    const {result: sv} = renderHook(() => useCollator(), {
      wrapper: wrapperFor('sv-SE'),
    });
    expect(['z', 'ä'].sort((a, b) => sv.current.compare(a, b))).toEqual([
      'z',
      'ä',
    ]);

    const {result: de} = renderHook(() => useCollator(), {
      wrapper: wrapperFor('de-DE'),
    });
    expect(['z', 'ä'].sort((a, b) => de.current.compare(a, b))).toEqual([
      'ä',
      'z',
    ]);
  });

  test('threads options through to the underlying Intl.Collator (numeric)', () => {
    const {result} = renderHook(() => useCollator({numeric: true}));
    expect(
      ['item2', 'item10'].sort((a, b) => result.current.compare(a, b)),
    ).toEqual(['item2', 'item10']);
  });

  test('without numeric, orders "item10" before "item2" lexicographically', () => {
    const {result} = renderHook(() => useCollator());
    expect(
      ['item2', 'item10'].sort((a, b) => result.current.compare(a, b)),
    ).toEqual(['item10', 'item2']);
  });

  test('memoizes the collator when locale and options identity are unchanged', () => {
    const options = {numeric: true} satisfies Intl.CollatorOptions;
    const {result, rerender} = renderHook(
      ({collatorOptions}) => useCollator(collatorOptions),
      {
        initialProps: {collatorOptions: options},
        wrapper: wrapperFor('en'),
      },
    );
    const first = result.current;
    rerender({collatorOptions: options});
    expect(result.current).toBe(first);
  });

  test('rebuilds the collator when options identity changes', () => {
    const {result, rerender} = renderHook(
      ({collatorOptions}) => useCollator(collatorOptions),
      {
        initialProps: {
          collatorOptions: {numeric: true} satisfies Intl.CollatorOptions,
        },
        wrapper: wrapperFor('en'),
      },
    );
    const first = result.current;
    rerender({collatorOptions: {numeric: true}});
    expect(result.current).not.toBe(first);
  });

  test('re-renders with a new collator when the provider locale changes', () => {
    let latestCollator: Intl.Collator | undefined;
    function Probe() {
      latestCollator = useCollator();
      const order = ['z', 'ä'].sort((a, b) => latestCollator!.compare(a, b));
      return <span data-testid="order">{order.join(',')}</span>;
    }
    const {getByTestId, rerender} = render(
      <InternationalizationProvider locale="sv-SE">
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('order').textContent).toBe('z,ä');
    const svCollator = latestCollator;

    rerender(
      <InternationalizationProvider locale="de-DE">
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('order').textContent).toBe('ä,z');
    expect(latestCollator).not.toBe(svCollator);
  });

  test('ignores external mutations after hook returns (options immutability)', () => {
    const mutableOptions = {numeric: true};
    const {result, rerender} = renderHook(({opts}) => useCollator(opts), {
      initialProps: {opts: mutableOptions},
      wrapper: wrapperFor('en'),
    });
    const firstCollator = result.current;
    const sortedBefore = ['item10', 'item2'].sort((a, b) =>
      firstCollator.compare(a, b),
    );

    // Mutate the caller's options object after the hook has captured it.
    // Without cloning, this would change the collator's behavior; with it,
    // the collator remains stable until the next render with different opts.
    mutableOptions.numeric = false;
    // Re-render with same object identity to trigger the dependency check.
    rerender({opts: mutableOptions});
    const secondCollator = result.current;

    // Collator should be the same instance (same locale + options identity)
    expect(secondCollator).toBe(firstCollator);
    // And its behavior must remain unchanged despite the mutation.
    const sortedAfter = ['item10', 'item2'].sort((a, b) =>
      secondCollator.compare(a, b),
    );
    expect(sortedBefore).toEqual(sortedAfter);
  });

  test('new collator is created when cloned options differ', () => {
    const {result, rerender} = renderHook(({opts}) => useCollator(opts), {
      initialProps: {opts: {numeric: false}},
      wrapper: wrapperFor('en'),
    });
    const before = ['item2', 'item10'].sort((a, b) =>
      result.current.compare(a, b),
    );
    rerender({opts: {numeric: true}});
    const after = ['item2', 'item10'].sort((a, b) =>
      result.current.compare(a, b),
    );
    // Different numeric settings produce different ordering.
    expect(before).not.toEqual(after);
    expect(before).toEqual(['item10', 'item2']);
    expect(after).toEqual(['item2', 'item10']);
  });
});
