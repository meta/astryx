// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sliderTouchBundle.test.ts
 * @input Slider's source files and the modules they import
 * @output Checks that Slider reaches its touch layer (the controller, the
 *   gesture recognizers, the animator) only through sliderTouchController.ts,
 *   imported from one site
 * @position Test for the touch layer's module boundary: a build can swap that
 *   one module (a desktop build without the touch layer), which keeps touch
 *   code out of a fine-pointer bundle (`architecture:component-style-authoring`
 *   INV6)
 */

import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SRC = path.resolve(__dirname, '..');

/**
 * The relative modules `file` loads when it runs: its value imports and
 * re-exports, not `import type` / `export type`, not `import()`.
 */
function staticImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const pattern =
    /^\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm;
  const specifiers: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[1] == null) {
      specifiers.push(match[2]);
    }
  }
  return specifiers;
}

function resolve(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (/\.(ts|tsx)$/.test(candidate) && existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`cannot resolve ${specifier} from ${from}`);
}

/**
 * Every module `entry` loads statically, as paths relative to src, with the
 * modules that import each one; `stop` is listed but not walked into.
 */
function staticGraph(entry: string, stop?: string): Map<string, Set<string>> {
  const importers = new Map<string, Set<string>>();
  const stack: [string, string | null][] = [[path.join(SRC, entry), null]];
  while (stack.length > 0) {
    const [file, from] = stack.pop() as [string, string | null];
    const key = path.relative(SRC, file);
    const known = importers.get(key);
    if (known != null) {
      if (from != null) {
        known.add(from);
      }
      continue;
    }
    importers.set(key, new Set(from == null ? [] : [from]));
    if (key === stop) {
      continue;
    }
    for (const specifier of staticImports(file)) {
      stack.push([resolve(file, specifier), key]);
    }
  }
  return importers;
}

const TOUCH_ONLY =
  /^(gestures\/(GestureHost|GestureArena|PressTracker|\w+GestureRecognizer)|motion\/animator)\.ts$/;

const LAYER = 'Slider/sliderTouchController.ts';

describe('Slider’s touch layer is one module, imported from one site', () => {
  it('imports sliderTouchController.ts from useSliderTouch.ts alone', () => {
    const graph = staticGraph('Slider/index.ts');
    expect([...(graph.get(LAYER) ?? [])]).toEqual(['Slider/useSliderTouch.ts']);
  });

  it('reaches no recognizer, gesture host or animator but through it', () => {
    const graph = staticGraph('Slider/index.ts', LAYER);
    expect(graph.has('Slider/Slider.tsx')).toBe(true);
    expect([...graph.keys()].filter(file => TOUCH_ONLY.test(file))).toEqual([]);
  });

  it('reads the UIKit gesture groups it uses, never their union', () => {
    // One export per recognizer group lets a touch module bundle only the
    // groups it reads; `UIKIT_GESTURES` carries every group.
    const text = readFileSync(path.join(SRC, LAYER), 'utf8');
    expect(text).not.toMatch(/\bUIKIT_GESTURES\b/);
    expect(text).toMatch(
      /import \{[^}]*\bUIKIT_PAN\b[^}]*\} from '\.\.\/motion\/uikit\/gestures'/,
    );
  });

  it('finds them from the layer itself (the walk sees them)', () => {
    const graph = staticGraph(LAYER);
    expect(graph.has('gestures/GestureHost.ts')).toBe(true);
    expect(graph.has('gestures/PanGestureRecognizer.ts')).toBe(true);
    expect(graph.has('motion/animator.ts')).toBe(true);
  });
});
