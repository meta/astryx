// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.startLineNumber.test.tsx
 * @input Uses vitest, @testing-library/react, CodeBlock component
 * @output Unit tests for the CodeBlock startLineNumber excerpt offset
 * @position Testing; validates startLineNumber gutter and highlight mapping
 *
 * SYNC: When CodeBlock.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import {CodeBlock} from './CodeBlock';
import {__resetLiveRegionsForTest} from '../hooks/useAnnounce';

const EXCERPT = ['const a = 1;', 'const b = 2;', 'const c = 3;'].join('\n');

function lineNumbers(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll('[data-line]')).map(row =>
    row.getAttribute('data-line'),
  );
}

function rowClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-line]')).map(
    row => (row as HTMLElement).className,
  );
}

describe('CodeBlock startLineNumber', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {writeText: vi.fn().mockResolvedValue(undefined)},
    });
  });

  afterEach(() => {
    __resetLiveRegionsForTest();
  });

  it('numbers the gutter from 1 by default', () => {
    const {container} = render(
      <CodeBlock code={EXCERPT} language="plaintext" hasLineNumbers />,
    );
    expect(lineNumbers(container)).toEqual(['1', '2', '3']);
  });

  it('shows file coordinates in the gutter from startLineNumber', () => {
    const {container} = render(
      <CodeBlock
        code={EXCERPT}
        language="plaintext"
        hasLineNumbers
        startLineNumber={40}
      />,
    );
    expect(lineNumbers(container)).toEqual(['40', '41', '42']);
  });

  it('interprets highlightLines in the same file coordinates', () => {
    const {container} = render(
      <CodeBlock
        code={EXCERPT}
        language="plaintext"
        hasLineNumbers
        startLineNumber={40}
        highlightLines={[42]}
      />,
    );
    const classes = rowClasses(container);
    expect(classes).toHaveLength(3);
    // The third rendered line (file line 42) carries the highlight paint,
    // the first two share the unhighlighted row classes.
    expect(classes[0]).toBe(classes[1]);
    expect(classes[2]).not.toBe(classes[0]);
  });

  it('clamps a startLineNumber below 1 to 1', () => {
    const {container} = render(
      <CodeBlock
        code={EXCERPT}
        language="plaintext"
        hasLineNumbers
        startLineNumber={0}
      />,
    );
    expect(lineNumbers(container)).toEqual(['1', '2', '3']);
  });

  it('treats out-of-range highlightLines as a no-op without crashing', () => {
    const {container} = render(
      <CodeBlock
        code={EXCERPT}
        language="plaintext"
        hasLineNumbers
        startLineNumber={40}
        highlightLines={[1, 2, 39, 43, 100]}
      />,
    );
    expect(lineNumbers(container)).toEqual(['40', '41', '42']);
    // No row is highlighted: every row shares the same classes.
    const classes = rowClasses(container);
    expect(classes[0]).toBe(classes[1]);
    expect(classes[1]).toBe(classes[2]);
  });

  it('keeps copy exact while offsetting the gutter', () => {
    const {container} = render(
      <CodeBlock
        code={EXCERPT}
        language="plaintext"
        hasLineNumbers
        startLineNumber={40}
      />,
    );
    expect(lineNumbers(container)).toEqual(['40', '41', '42']);
    fireEvent.click(screen.getByRole('button', {name: 'Copy code'}));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(EXCERPT);
  });
});
