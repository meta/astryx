// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/react';
import {renderHook} from '@testing-library/react';
import {useLinkify} from './useLinkify';

describe('useLinkify', () => {
  it('returns plain text when no links are found', () => {
    const {result} = renderHook(() => useLinkify('Hello world'));
    expect(result.current).toEqual(['Hello world']);
  });

  it('returns plain text for empty string', () => {
    const {result} = renderHook(() => useLinkify(''));
    expect(result.current).toEqual(['']);
  });

  it('detects URLs', () => {
    const {result} = renderHook(() =>
      useLinkify('Visit https://example.com today'),
    );
    expect(result.current).toHaveLength(3);
    expect(result.current[0]).toBe('Visit ');
    expect(result.current[2]).toBe(' today');
  });

  it('renders URLs as Link elements', () => {
    const {result} = renderHook(() => useLinkify('Visit https://example.com'));
    const {container} = render(<p>{result.current}</p>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
  });

  it('detects email addresses', () => {
    const {result} = renderHook(() =>
      useLinkify('Email hi@example.com for info'),
    );
    expect(result.current).toHaveLength(3);
    expect(result.current[0]).toBe('Email ');
    expect(result.current[2]).toBe(' for info');
  });

  it('renders email links with mailto:', () => {
    const {result} = renderHook(() => useLinkify('Email hi@example.com'));
    const {container} = render(<p>{result.current}</p>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('mailto:hi@example.com');
  });

  it('detects multiple links in one string', () => {
    const {result} = renderHook(() =>
      useLinkify('Go to https://a.com and https://b.com now'),
    );
    expect(result.current).toHaveLength(5);
    expect(result.current[0]).toBe('Go to ');
    expect(result.current[2]).toBe(' and ');
    expect(result.current[4]).toBe(' now');
  });

  it('supports custom patterns', () => {
    const {result} = renderHook(() =>
      useLinkify('Check T1234 for details', {
        patterns: [
          {
            pattern: /\bT(\d+)\b/g,
            href: m => `https://tasks.example.com/${m[1]}`,
          },
        ],
      }),
    );
    expect(result.current).toHaveLength(3);
    expect(result.current[0]).toBe('Check ');
    expect(result.current[2]).toBe(' for details');

    const {container} = render(<p>{result.current}</p>);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://tasks.example.com/1234');
    expect(link?.textContent).toBe('T1234');
  });

  it('custom patterns take priority over builtins', () => {
    // A custom pattern that matches something a URL would also match
    const {result} = renderHook(() =>
      useLinkify('See https://example.com/T1234', {
        patterns: [
          {
            pattern: /https:\/\/example\.com\/T(\d+)/g,
            href: m => `https://tasks.example.com/${m[1]}`,
            label: m => `T${m[1]}`,
          },
        ],
      }),
    );
    const {container} = render(<p>{result.current}</p>);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('T1234');
    expect(link?.getAttribute('href')).toBe('https://tasks.example.com/1234');
  });

  it('supports custom label function', () => {
    const {result} = renderHook(() =>
      useLinkify('See D5678 here', {
        patterns: [
          {
            pattern: /\bD(\d+)\b/g,
            href: m => `https://review.example.com/${m[0]}`,
            label: m => `Diff ${m[1]}`,
          },
        ],
      }),
    );
    const {container} = render(<p>{result.current}</p>);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Diff 5678');
  });

  it('can disable builtins', () => {
    const {result} = renderHook(() =>
      useLinkify('Visit https://example.com', {
        hasBuiltins: false,
      }),
    );
    expect(result.current).toEqual(['Visit https://example.com']);
  });

  it('handles text that starts with a link', () => {
    const {result} = renderHook(() =>
      useLinkify('https://example.com is cool'),
    );
    expect(result.current).toHaveLength(2);
    expect(result.current[1]).toBe(' is cool');
  });

  it('handles text that ends with a link', () => {
    const {result} = renderHook(() => useLinkify('Visit https://example.com'));
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toBe('Visit ');
  });

  it('links the whole local part of an email', () => {
    const {result} = renderHook(() =>
      useLinkify('Mail first.last+tag@sub.example.co.uk now'),
    );
    const {container} = render(<p>{result.current}</p>);
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'mailto:first.last+tag@sub.example.co.uk',
    );
  });

  it('scans a long token without an email in linear time', () => {
    const text = 'a'.repeat(100_000);
    const start = performance.now();
    const {result} = renderHook(() => useLinkify(text));
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.current).toEqual([text]);
  });
});
