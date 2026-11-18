// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards that a style which sets a text role's size also sets its leading.
 * @input Every Core component source under packages/core/src.
 * @output Fails when a style object sets `--text-<role>-size` and no line height.
 * @position Repo-wide style guard, sibling of inputFontFloor.test.ts.
 *
 * Text that sets a role size but no line height inherits the line height of
 * whatever contains it, so a theme's leading for that role never reaches it.
 * Each such style sets `--text-<role>-leading` beside the size.
 */

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const ROOT = __dirname;

/**
 * Styles that set their line box another way, with the reason.
 * Key: `<file relative to src>:<style key>`.
 */
const SETS_LINE_BOX_ELSEWHERE: Record<string, string> = {
  // The trigger's line box is set per size in sizeStyles, capped to the size
  // token it sits in.
  'Selector/Selector.tsx:triggerContainer': 'sizeStyles',
};

function sources(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sources(path);
    }
    return /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

/** Index of the `{` that opens the object containing `at`. */
function openOf(text: string, at: number): number {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (text[i] === '}') {
      depth++;
    } else if (text[i] === '{') {
      if (depth === 0) {
        return i;
      }
      depth--;
    }
  }
  return -1;
}

/** Index of the `}` that closes the object opened at `open`. */
function closeOf(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}' && --depth === 0) {
      return i;
    }
  }
  return text.length;
}

function missingLeading(): string[] {
  const out: string[] = [];
  for (const file of sources(ROOT)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/fontSize:\s*(\{)?/g)) {
      const at = m.index ?? 0;
      const valueEnd = m[1]
        ? closeOf(text, at + m[0].length - 1)
        : text.indexOf('\n', at);
      if (!/--text-[a-z0-9-]+-size/.test(text.slice(at, valueEnd))) {
        continue;
      }
      const open = openOf(text, at);
      const style = text.slice(open, closeOf(text, open) + 1);
      if (/\blineHeight\s*:/.test(style)) {
        continue;
      }
      const key =
        /([A-Za-z0-9_]+)\s*:\s*(?:\([^)]*\)\s*=>\s*\(\s*)?$/.exec(
          text.slice(Math.max(0, open - 200), open),
        )?.[1] ?? '?';
      const id = `${relative(ROOT, file)}:${key}`;
      if (!SETS_LINE_BOX_ELSEWHERE[id]) {
        out.push(id);
      }
    }
  }
  return out;
}

describe('text role leading', () => {
  it('is set by every style that sets a text role size', () => {
    expect(missingLeading()).toEqual([]);
  });
});
