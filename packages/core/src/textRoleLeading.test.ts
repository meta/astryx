// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards that a style which sets a text role's size also sets its leading.
 * @input Every Core component source under packages/core/src.
 * @output Fails when a style sets `--text-<role>-size` without that role's leading.
 * @position Repo-wide style guard, sibling of inputFontFloor.test.ts.
 *
 * Text that sets a role size but no line height inherits the line height of
 * whatever contains it, so a theme's leading for that role never reaches it.
 * Each such style sets `--text-<role>-leading` beside the size, or is listed
 * in OWN_LINE_HEIGHT with the reason it keeps another line height.
 */

import {describe, expect, it} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';
import {join, relative} from 'node:path';

const ROOT = __dirname;

/**
 * Styles that set a text role's size with a line height other than that
 * role's leading, with the reason. Key: `<file relative to src>:<style key>`.
 */
const OWN_LINE_HEIGHT: Record<string, string> = {
  // The trigger's line box is set per size in sizeStyles, capped to the size
  // token it sits in.
  'Selector/Selector.tsx:triggerContainer': 'line box set per size',
  // Inline code sits in a line of running text and keeps that line's height.
  'Code/Code.tsx:base': 'inherits the surrounding line',
  // A caption under its label, on the --spacing-4 step.
  'Stepper/Step.tsx:description': 'fixed 16px caption line',
  // The collapse label lines up with the drawer's --spacing-5 row.
  'Chat/ChatComposerDrawer.tsx:collapseLabel': 'fixed row line',
  // The composer measures its rows in this line height to grow and scroll.
  'Chat/ChatComposerInput.tsx:editable': 'measured line height',
  'Chat/ChatComposerInput.tsx:placeholder': 'measured line height',
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
      const role = /--text-([a-z0-9-]+)-size/.exec(
        text.slice(at, valueEnd),
      )?.[1];
      if (!role) {
        continue;
      }
      const open = openOf(text, at);
      const style = text.slice(open, closeOf(text, open) + 1);
      if (style.includes(`--text-${role}-leading`)) {
        continue;
      }
      const key =
        /([A-Za-z0-9_]+)\s*:\s*(?:\([^)]*\)\s*=>\s*\(\s*)?$/.exec(
          text.slice(Math.max(0, open - 200), open),
        )?.[1] ?? '?';
      const id = `${relative(ROOT, file)}:${key}`;
      if (!OWN_LINE_HEIGHT[id]) {
        out.push(id);
      }
    }
  }
  return out;
}

describe('text role leading', () => {
  it("is set, or its exemption named, by every style that sets a text role's size", () => {
    expect(missingLeading()).toEqual([]);
  });
});
