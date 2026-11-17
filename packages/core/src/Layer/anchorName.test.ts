// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file anchorName.test.ts
 * @input Uses vitest, anchorName utilities
 * @output Unit tests for anchor-name list manipulation helpers
 * @position Testing; validates anchorName.ts implementation
 *
 * SYNC: When anchorName.ts changes, update tests to match new behavior
 */

import {describe, it, expect} from 'vitest';
import {
  readAnchorNames,
  writeAnchorNames,
  addAnchorName,
  removeAnchorName,
} from './anchorName';

function createMockElement(): HTMLElement {
  const el = document.createElement('div');
  return el;
}

describe('readAnchorNames', () => {
  it('returns empty array for element with no anchor-name', () => {
    const el = createMockElement();
    expect(readAnchorNames(el)).toEqual([]);
  });

  it('reads a single anchor name', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName = '--layer-1';
    expect(readAnchorNames(el)).toEqual(['--layer-1']);
  });

  it('reads multiple comma-separated anchor names', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName =
      '--layer-1, --layer-2, --layer-3';
    expect(readAnchorNames(el)).toEqual([
      '--layer-1',
      '--layer-2',
      '--layer-3',
    ]);
  });

  it('trims whitespace around names', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName =
      '  --layer-1 ,  --layer-2  ';
    expect(readAnchorNames(el)).toEqual(['--layer-1', '--layer-2']);
  });

  it('returns empty array for empty string value', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName = '';
    expect(readAnchorNames(el)).toEqual([]);
  });
});

describe('writeAnchorNames', () => {
  it('writes names as comma-separated list', () => {
    const el = createMockElement();
    writeAnchorNames(el, ['--layer-1', '--layer-2']);
    expect((el.style as unknown as Record<string, string>).anchorName).toBe(
      '--layer-1, --layer-2',
    );
  });

  it('writes empty string for empty array', () => {
    const el = createMockElement();
    writeAnchorNames(el, []);
    expect((el.style as unknown as Record<string, string>).anchorName).toBe('');
  });
});

describe('addAnchorName', () => {
  it('adds name to element with no existing anchors', () => {
    const el = createMockElement();
    addAnchorName(el, '--layer-1');
    expect((el.style as unknown as Record<string, string>).anchorName).toBe(
      '--layer-1',
    );
  });

  it('appends name to existing anchor list', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName = '--layer-1';
    addAnchorName(el, '--layer-2');
    expect((el.style as unknown as Record<string, string>).anchorName).toBe(
      '--layer-1, --layer-2',
    );
  });

  it('does not duplicate an already-present name', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName = '--layer-1';
    addAnchorName(el, '--layer-1');
    expect((el.style as unknown as Record<string, string>).anchorName).toBe(
      '--layer-1',
    );
  });

  it('supports multiple layers sharing one element', () => {
    const el = createMockElement();
    addAnchorName(el, '--menu-1');
    addAnchorName(el, '--menu-2');
    addAnchorName(el, '--menu-3');
    expect(readAnchorNames(el)).toEqual(['--menu-1', '--menu-2', '--menu-3']);
  });
});

describe('removeAnchorName', () => {
  it('removes name from a multi-anchor list', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName =
      '--layer-1, --layer-2, --layer-3';
    removeAnchorName(el, '--layer-2');
    expect(readAnchorNames(el)).toEqual(['--layer-1', '--layer-3']);
  });

  it('removes the last remaining name, leaving empty string', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName = '--layer-1';
    removeAnchorName(el, '--layer-1');
    expect((el.style as unknown as Record<string, string>).anchorName).toBe('');
  });

  it('is a no-op if name is not present', () => {
    const el = createMockElement();
    (el.style as unknown as Record<string, string>).anchorName =
      '--layer-1, --layer-2';
    removeAnchorName(el, '--layer-3');
    expect(readAnchorNames(el)).toEqual(['--layer-1', '--layer-2']);
  });

  it('writes the style only when the name is present, since a write invalidates style', () => {
    const el = createMockElement();
    let value = '--layer-1';
    let writes = 0;
    Object.defineProperty(el.style, 'anchorName', {
      configurable: true,
      get: () => value,
      set: (next: string) => {
        writes += 1;
        value = next;
      },
    });
    removeAnchorName(el, '--layer-2');
    expect(writes).toBe(0);
    removeAnchorName(el, '--layer-1');
    expect(writes).toBe(1);
    expect(value).toBe('');
  });

  it('handles multiple add/remove cycles correctly', () => {
    const el = createMockElement();
    addAnchorName(el, '--menu-a');
    addAnchorName(el, '--menu-b');
    removeAnchorName(el, '--menu-a');
    addAnchorName(el, '--menu-c');
    expect(readAnchorNames(el)).toEqual(['--menu-b', '--menu-c']);
  });
});
