// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useValueReplacesEntry.test.tsx
 * @input Uses vitest, @testing-library/react, useValueReplacesEntry
 * @output Unit tests for when a new value replaces a field's kept entry
 * @position Testing; validates Field/useValueReplacesEntry.ts
 */

import {useState} from 'react';
import {describe, it, expect} from 'vitest';
import {render, screen} from '@testing-library/react';
import {useValueReplacesEntry} from './useValueReplacesEntry';

/** Keeps one entry and drops it when a new value replaces it. */
function KeptEntry({value, keepSignal}: {value: unknown; keepSignal: number}) {
  const [entry, setEntry] = useState<string | null>('kept');
  const isReplaced = useValueReplacesEntry(value, keepSignal);
  if (isReplaced && entry !== null) {
    setEntry(null);
  }
  return <output>{entry ?? 'replaced'}</output>;
}

describe('useValueReplacesEntry', () => {
  it('replaces the entry with a new value', () => {
    const {rerender} = render(<KeptEntry value="a" keepSignal={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
    rerender(<KeptEntry value="b" keepSignal={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('replaced');
  });

  it('keeps the entry for a value that arrives with a new keep signal, and replaces it with a later value', () => {
    const {rerender} = render(<KeptEntry value="a" keepSignal={0} />);
    rerender(<KeptEntry value="b" keepSignal={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
    rerender(<KeptEntry value="b" keepSignal={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
    rerender(<KeptEntry value="c" keepSignal={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('replaced');
  });

  it('keeps the entry at every keep signal, not only the first', () => {
    const {rerender} = render(<KeptEntry value="a" keepSignal={0} />);
    rerender(<KeptEntry value="b" keepSignal={1} />);
    rerender(<KeptEntry value="c" keepSignal={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
  });

  it('keeps the entry when only the keep signal changes', () => {
    const {rerender} = render(<KeptEntry value="a" keepSignal={0} />);
    rerender(<KeptEntry value="a" keepSignal={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
  });

  it('compares values with Object.is, so NaN is not a new value', () => {
    const {rerender} = render(<KeptEntry value={NaN} keepSignal={0} />);
    rerender(<KeptEntry value={NaN} keepSignal={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('kept');
  });
});
