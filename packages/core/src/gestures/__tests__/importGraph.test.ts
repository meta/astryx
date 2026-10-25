// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file importGraph.test.ts
 * @input Uses vitest and node:fs over the gestures sources
 * @output A gesture-only component's imports (useGestureRecognizer, the pan
 *   recognizers, the gesture host) reach neither the press tracker nor
 *   haptics; usePressTracker reaches the press tracker, and the haptics
 *   module stays reachable from its own entry
 * @position Unit test of packages/core/src/gestures' module graph
 *
 * Static imports only: a type-only import is erased and costs nothing, and
 * nothing here loads lazily. Run from the source, the graph is what a bundler
 * that keeps every reachable module would ship.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const GESTURES = path.resolve(__dirname, '..');

/** The relative modules `file` imports for their values. */
function valueImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  const statement =
    /^\s*(import|export)\s+(type\s+)?([^'";]*?\s+from\s+)?'([^']+)';/gms;
  for (const match of source.matchAll(statement)) {
    const [, , isTypeOnly, , specifier] = match;
    if (isTypeOnly == null && specifier.startsWith('.')) {
      specifiers.push(specifier);
    }
  }
  return specifiers.map(specifier => resolveModule(file, specifier));
}

function resolveModule(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `${path.relative(GESTURES, from)}: cannot resolve ${specifier}`,
  );
}

/** Every module `entry` reaches through value imports, as names relative to gestures/. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [path.join(GESTURES, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) {
      continue;
    }
    seen.add(file);
    queue.push(...valueImports(file));
  }
  return new Set([...seen].map(file => path.relative(GESTURES, file)));
}

describe('the gestures module graph', () => {
  it.each([
    'useGestureRecognizer.ts',
    'PanGestureRecognizer.ts',
    'ScrollViewPanGestureRecognizer.ts',
    'GestureHost.ts',
    'useFingerScroll.ts',
  ])('%s reaches neither the press tracker nor haptics', entry => {
    const modules = reachable(entry);
    expect(modules.has(entry)).toBe(true);
    expect(modules).not.toContain('PressTracker.ts');
    expect(modules).not.toContain('usePressTracker.ts');
    expect(modules).not.toContain('haptics.ts');
  });

  it('reaches the press tracker from usePressTracker, and haptics from its own entry', () => {
    expect(reachable('usePressTracker.ts')).toContain('PressTracker.ts');
    expect(reachable('haptics.ts')).toContain('hapticSwitch.ts');
    // The host shares only the switch's attribute with haptics.
    expect(reachable('GestureHost.ts')).toContain('hapticSwitch.ts');
  });

  it('reads type-only imports as free', () => {
    // GestureRecognizer imports GestureArena for its types alone.
    expect(reachable('GestureRecognizer.ts')).not.toContain('GestureArena.ts');
  });
});
