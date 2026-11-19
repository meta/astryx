// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounceRenderedText.test.tsx
 * @input Rendered content, fallback text in both extraction modes, and visibility
 * @output Regression tests for fallback text and shared announcement ownership
 * @position Unit tests for the internal own-content announcement hook
 */

import {useRef, type HTMLAttributes} from 'react';
import {render} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {renderedText, useAnnounceRenderedText} from './useAnnounceRenderedText';

const {announce} = vi.hoisted(() => ({announce: vi.fn()}));
vi.mock('./useAnnounce', () => ({useAnnounce: () => announce}));

function Message({
  fallbackText,
  ...props
}: HTMLAttributes<HTMLDivElement> & {fallbackText?: string}) {
  const ref = useRef<HTMLDivElement>(null);
  useAnnounceRenderedText(ref, true, '', {fallbackText});
  return <div ref={ref} {...props} />;
}

beforeEach(() => announce.mockClear());

describe('useAnnounceRenderedText text priority', () => {
  it('prefers rendered text over referenced and fallback names', () => {
    render(
      <>
        <Message fallbackText="Loading" aria-labelledby="label">
          Fetching records
        </Message>
        <span id="label">Referenced name</span>
      </>,
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Fetching records',
      'polite',
    );
  });

  it('prefers referenced text in ID order over the fallback', () => {
    render(
      <>
        <Message fallbackText="Loading" aria-labelledby="action missing file" />
        <span id="file"> files </span>
        <span id="action" hidden>
          Uploading
        </span>
      </>,
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Uploading files',
      'polite',
    );
  });

  it('uses the fallback when rendered and referenced text are unavailable', () => {
    render(
      <Message fallbackText="Loading" aria-labelledby="missing">
        <span aria-hidden="true">Decorative ring</span>
        <span hidden>Hidden label</span>
      </Message>,
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith('Loading', 'polite');
  });

  it('keeps empty content silent when no fallback is provided', () => {
    render(
      <>
        <Message aria-labelledby="label" />
        <span id="label">Referenced name</span>
      </>,
    );
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('renderedText reads block boxes apart (AST-086 FR7)', () => {
  it('separates the inline children of a flex or grid stack, as the layout blockifies them', () => {
    const {container} = render(
      <div>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <span>Fetching data</span>
          <span>This may take a moment</span>
        </div>
        <div style={{display: 'grid'}}>
          <span>One</span>
          <span>Two</span>
        </div>
      </div>,
    );
    expect(renderedText(container.firstElementChild as HTMLElement)).toBe(
      'Fetching data This may take a moment One Two',
    );
  });

  it('keeps inline runs together and still skips hidden parts', () => {
    const {container} = render(
      <p>
        Saving <strong>3</strong> files<span aria-hidden="true">…</span>
      </p>,
    );
    expect(renderedText(container.firstElementChild as HTMLElement)).toBe(
      'Saving 3 files',
    );
  });
});
