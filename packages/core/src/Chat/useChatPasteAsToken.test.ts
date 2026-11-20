// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useChatPasteAsToken.test.ts
 * @input Uses vitest, @testing-library/react, useChatPasteAsToken hook
 * @output Unit tests for the paste-as-token threshold and token factory
 * @position Testing; validates useChatPasteAsToken.ts implementation
 *
 * SYNC: When useChatPasteAsToken.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useChatPasteAsToken} from './useChatPasteAsToken';
import type {
  ChatComposerInputHandle,
  ChatComposerToken,
} from './ChatComposerInput';
import type {ClipboardEvent} from 'react';

// The hook never reads the event (it only inspects the already-extracted
// text), so a bare object stands in for the React synthetic event.
const pasteEvent = {} as ClipboardEvent<HTMLDivElement>;

function makeInputRef() {
  const insertToken = vi.fn<(token: ChatComposerToken) => string | undefined>();
  const ref: React.RefObject<ChatComposerInputHandle | null> = {
    current: {
      insertToken,
      expandToken: vi.fn(),
      insertText: vi.fn(),
      focus: vi.fn(),
      getValue: vi.fn(() => ''),
    },
  };
  return {ref, insertToken};
}

/** A single-line string of exactly `n` characters. */
const chars = (n: number) => 'a'.repeat(n);

describe('useChatPasteAsToken — threshold', () => {
  it('passes the paste through when the text is shorter than the threshold', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    expect(result.current.onPaste(pasteEvent, chars(199))).toBe(false);
    expect(insertToken).not.toHaveBeenCalled();
  });

  it('passes the paste through at exactly the default 200-character threshold', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    expect(result.current.onPaste(pasteEvent, chars(200))).toBe(false);
    expect(insertToken).not.toHaveBeenCalled();
  });

  it('converts the paste to a token one character past the threshold', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    expect(result.current.onPaste(pasteEvent, chars(201))).toBe(true);
    expect(insertToken).toHaveBeenCalledTimes(1);
  });

  it('honors a custom threshold on both sides of the boundary', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() =>
      useChatPasteAsToken({inputRef: ref, threshold: 5}),
    );

    expect(result.current.onPaste(pasteEvent, chars(5))).toBe(false);
    expect(insertToken).not.toHaveBeenCalled();

    expect(result.current.onPaste(pasteEvent, chars(6))).toBe(true);
    expect(insertToken).toHaveBeenCalledTimes(1);
  });

  it('tokenizes any non-empty paste when the threshold is zero', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() =>
      useChatPasteAsToken({inputRef: ref, threshold: 0}),
    );

    expect(result.current.onPaste(pasteEvent, '')).toBe(false);
    expect(insertToken).not.toHaveBeenCalled();

    expect(result.current.onPaste(pasteEvent, 'a')).toBe(true);
    expect(insertToken).toHaveBeenCalledTimes(1);
  });
});

describe('useChatPasteAsToken — default token', () => {
  it('labels a single-line paste with the character count only', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    result.current.onPaste(pasteEvent, chars(240));

    expect(insertToken).toHaveBeenCalledWith({
      value: chars(240),
      label: '240 chars',
      variant: 'neutral',
    });
  });

  it('labels a multi-line paste with both the line and character counts', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    // Three lines, 302 characters (3 x 100 'a' + 2 newlines).
    const text = [chars(100), chars(100), chars(100)].join('\n');
    expect(text.length).toBe(302);

    result.current.onPaste(pasteEvent, text);

    expect(insertToken).toHaveBeenCalledWith({
      value: text,
      label: '3 lines, 302 chars',
      variant: 'neutral',
    });
  });

  it('counts a trailing newline as an extra line', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    const text = `${chars(300)}\n`;
    result.current.onPaste(pasteEvent, text);

    expect(insertToken).toHaveBeenCalledWith(
      expect.objectContaining({label: '2 lines, 301 chars'}),
    );
  });

  it('carries the full pasted text as the token value', () => {
    const {ref, insertToken} = makeInputRef();
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    const text = `SECRET-${chars(300)}`;
    result.current.onPaste(pasteEvent, text);

    expect(insertToken.mock.calls[0][0].value).toBe(text);
  });
});

describe('useChatPasteAsToken — custom token factory', () => {
  it('inserts the token returned by toToken instead of the default', () => {
    const {ref, insertToken} = makeInputRef();
    const toToken = vi.fn((text: string) => ({
      value: text.toUpperCase(),
      label: 'Pasted snippet',
      variant: 'success' as const,
    }));
    const {result} = renderHook(() =>
      useChatPasteAsToken({inputRef: ref, toToken}),
    );

    expect(result.current.onPaste(pasteEvent, chars(201))).toBe(true);
    expect(toToken).toHaveBeenCalledWith(chars(201));
    expect(insertToken).toHaveBeenCalledWith({
      value: chars(201).toUpperCase(),
      label: 'Pasted snippet',
      variant: 'success',
    });
  });

  it('never calls toToken for a paste under the threshold', () => {
    const {ref} = makeInputRef();
    const toToken = vi.fn(() => ({value: 'x', label: 'x'}));
    const {result} = renderHook(() =>
      useChatPasteAsToken({inputRef: ref, toToken}),
    );

    result.current.onPaste(pasteEvent, chars(10));

    expect(toToken).not.toHaveBeenCalled();
  });
});

describe('useChatPasteAsToken — unattached input', () => {
  it('does not throw when the input ref has not been attached yet', () => {
    const ref: React.RefObject<ChatComposerInputHandle | null> = {
      current: null,
    };
    const {result} = renderHook(() => useChatPasteAsToken({inputRef: ref}));

    expect(() => result.current.onPaste(pasteEvent, chars(201))).not.toThrow();
  });
});
