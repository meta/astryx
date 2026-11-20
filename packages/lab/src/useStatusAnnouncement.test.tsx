// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useStatusAnnouncement.test.tsx
 * @input useStatusAnnouncement with a mocked announcement channel
 * @output Proof of once-per-occasion status delivery, optional page-load
 *   silence, and live-container ownership (`spec:AST-086` FR4, FR6, FR8, FR11)
 * @position Unit test beside useStatusAnnouncement.ts
 */

import {StrictMode, useRef} from 'react';
import {render, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useStatusAnnouncement} from './useStatusAnnouncement';

const {announce} = vi.hoisted(() => ({announce: vi.fn()}));
vi.mock('@astryxdesign/core/hooks', async importOriginal => ({
  ...(await importOriginal<object>()),
  useAnnounce: () => announce,
}));

function Owner({isBusy}: {isBusy: boolean}) {
  useStatusAnnouncement(isBusy ? 'Loading events' : null, 'polite', {
    skipPageLoad: true,
  });
  return null;
}

function Status({message}: {message: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  useStatusAnnouncement(message, 'assertive', {ref});
  return <span ref={ref}>{message}</span>;
}

beforeEach(() => {
  announce.mockClear();
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
});
afterEach(() => vi.restoreAllMocks());

describe('useStatusAnnouncement', () => {
  it('announces each busy start once, and nothing while busy or idle', () => {
    const {rerender} = render(<Owner isBusy={false} />);
    expect(announce).not.toHaveBeenCalled();
    rerender(<Owner isBusy={true} />);
    rerender(<Owner isBusy={true} />);
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading events',
      'polite',
    );
    rerender(<Owner isBusy={false} />);
    rerender(<Owner isBusy={true} />);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('announces an owner that mounts busy after page load once in StrictMode', () => {
    render(
      <StrictMode>
        <Owner isBusy={true} />
      </StrictMode>,
    );
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading events',
      'polite',
    );
  });

  it.each(['loading', 'interactive'] as const)(
    'skips a busy start while the document is %s, then re-arms for a later start',
    readyState => {
      const ready = vi
        .spyOn(document, 'readyState', 'get')
        .mockReturnValue(readyState);
      const {rerender} = render(<Owner isBusy={true} />);
      expect(announce).not.toHaveBeenCalled();
      ready.mockReturnValue('complete');
      rerender(<Owner isBusy={true} />);
      expect(announce).not.toHaveBeenCalled();
      rerender(<Owner isBusy={false} />);
      rerender(<Owner isBusy={true} />);
      expect(announce).toHaveBeenCalledExactlyOnceWith(
        'Loading events',
        'polite',
      );
    },
  );

  it('announces changed words after page load, but not a repeated message', () => {
    const ready = vi
      .spyOn(document, 'readyState', 'get')
      .mockReturnValue('loading');
    const {rerender} = renderHook(
      ({message}) =>
        useStatusAnnouncement(message, 'polite', {skipPageLoad: true}),
      {initialProps: {message: 'Loading events'}},
    );
    expect(announce).not.toHaveBeenCalled();
    ready.mockReturnValue('complete');
    rerender({message: 'Loading more events'});
    rerender({message: 'Loading more events'});
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Loading more events',
      'polite',
    );
  });

  it('preserves default status delivery during page load and re-arms for empty text', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const {rerender} = render(<Status message="Could not load comments" />);
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      'Could not load comments',
      'assertive',
    );
    rerender(<Status message="" />);
    expect(announce).toHaveBeenCalledTimes(1);
    rerender(<Status message="Could not load comments" />);
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('leaves referenced content and its updates to the enclosing live container', () => {
    const {rerender} = render(
      <div role="log">
        <Status message="Could not load comments" />
      </div>,
    );
    rerender(
      <div role="log">
        <Status message="Could not save comment" />
      </div>,
    );
    expect(announce).not.toHaveBeenCalled();
  });
});
