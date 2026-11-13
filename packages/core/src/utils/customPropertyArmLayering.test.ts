// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file customPropertyArmLayering.test.ts
 * @input Every non-test source file under packages/core/src
 * @output A guard that no StyleX custom property pairs a default of its own
 *   with an attribute-selector arm (`'[data-…]'`, the press arms included)
 * @position Testing; the cascade half of the touch press model's contract
 *   (pressableCoverage.test.ts is the reach half)
 *
 * A layered stylesheet (StyleX's `useLayers`, which Storybook, the Vite
 * integration and the PostCSS plugin use) emits its lowest priority group
 * without a layer: the theme's variables, and with them every custom
 * property's own declarations and pseudo-class arms. An unlayered
 * declaration beats a layered one whatever the specificity. An attribute arm
 * lands in a priority layer, so `'--x': {default: …, '[data-astryx-press="on"]': …}`
 * never applies there, though the flat package stylesheet, which orders by
 * specificity instead, applies it. Put the arm on a plain property instead
 * (as the cards' `::after` does for the press), or give the custom property
 * no default of its own (as `pressedAlpha` does for the press's strength).
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      if (entry !== 'node_modules' && entry !== 'dist') {
        yield* sourceFiles(full);
      }
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

/** The text of the object literal whose `{` sits at `open`, braces balanced. */
function objectAt(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') {
      depth++;
    } else if (code[i] === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(open + 1, i);
      }
    }
  }
  return code.slice(open + 1);
}

/** The value of the object's own `default:` key (not a nested one), if any. */
function ownDefault(body: string): string | null {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '{' || char === '[' || char === '(') {
      depth++;
    } else if (char === '}' || char === ']' || char === ')') {
      depth--;
    } else if (depth === 0 && body.startsWith('default:', i)) {
      const rest = body.slice(i + 'default:'.length);
      return rest.slice(0, rest.search(/,|$/)).trim();
    }
  }
  return null;
}

/**
 * An attribute-selector key (`'[data-astryx-press="on"]'`, `'[aria-busy]'`),
 * or the press arms by their usual constant names.
 */
const ATTRIBUTE_ARM =
  /(['"])\[[\w-]+(?:[~|^$*]?=[^\]]*)?\]\1\s*:|\[PRESSED_(?:ON|FADING)\]\s*:/;

/** Custom-property keys whose own default stands beside an attribute arm. */
function shadowedAttributeArms(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(/(['"])(--[\w-]+)\1\s*:\s*\{/g)) {
    const body = objectAt(code, (match.index ?? 0) + match[0].length - 1);
    const fallback = ownDefault(body);
    if (ATTRIBUTE_ARM.test(body) && fallback != null && fallback !== 'null') {
      out.push(match[2]);
    }
  }
  return out;
}

describe("a custom property's attribute arm is never shadowed by its own default", () => {
  it('finds the pattern it guards against', () => {
    expect(
      shadowedAttributeArms(`'--_x': {default: 'transparent', ':active': 'red',
        '[data-astryx-press="on"]': 'blue'}`),
    ).toEqual(['--_x']);
    expect(
      shadowedAttributeArms(
        `'--_x': {default: '0', '[aria-busy="true"]': '1'}`,
      ),
    ).toEqual(['--_x']);
    expect(
      shadowedAttributeArms(`'--_x': {default: 1, [PRESSED_FADING]: 0}`),
    ).toEqual(['--_x']);
    expect(
      shadowedAttributeArms(`'--_x': {default: null, [PRESSED_ON]: 1}`),
    ).toEqual([]);
    expect(
      shadowedAttributeArms(`'--_x': {default: 'a', ':hover': 'b'}`),
    ).toEqual([]);
  });

  it('holds across the core source', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      // Comments describe the pattern in words; only code counts.
      const code = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const name of shadowedAttributeArms(code)) {
        offenders.push(`${path.relative(SRC, file)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
