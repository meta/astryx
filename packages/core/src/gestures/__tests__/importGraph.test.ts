// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file importGraph.test.ts
 * @input Uses vitest and node:fs over the gestures sources
 * @output A gesture-only component's imports (useGestureRecognizer, the pan
 *   recognizers, the gesture host) reach neither the press tracker nor
 *   haptics, nor the hover recognizer, the page hold or the finger-scroll
 *   watch; each of those stays reachable from the entry that uses it; the
 *   host and touch-action reach no recognizer class
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
    // The host shares only the switch's attribute with haptics, from utils/,
    // where the click guard reads it too.
    expect(reachable('haptics.ts')).toContain('../utils/hapticSwitch.ts');
    expect(reachable('GestureHost.ts')).toContain('../utils/hapticSwitch.ts');
    expect(reachable('GestureHost.ts')).not.toContain('hapticSwitch.ts');
  });

  it.each([
    'useGestureRecognizer.ts',
    'PanGestureRecognizer.ts',
    'GestureHost.ts',
  ])(
    '%s reaches neither the hover recognizer, the page hold nor the finger-scroll watch',
    entry => {
      const modules = reachable(entry);
      expect(modules).not.toContain('HoverGestureRecognizer.ts');
      expect(modules).not.toContain('pageHold.ts');
      expect(modules).not.toContain('fingerScroll.ts');
    },
  );

  it('reaches the finger-scroll watch from useFingerScroll, and the page hold from its own entry', () => {
    expect(reachable('useFingerScroll.ts')).toContain('fingerScroll.ts');
    // The page hold takes the host it holds for: it imports none of it.
    expect(reachable('pageHold.ts')).not.toContain('GestureHost.ts');
    expect(reachable('HoverGestureRecognizer.ts')).toContain(
      'GestureRecognizer.ts',
    );
  });

  it.each(['GestureHost.ts', 'touchAction.ts', 'PressTracker.ts'])(
    '%s reaches no recognizer class: each brands its family',
    entry => {
      const modules = reachable(entry);
      expect(modules).not.toContain('TapGestureRecognizer.ts');
      expect(modules).not.toContain('LongPressGestureRecognizer.ts');
      expect(modules).not.toContain('PanGestureRecognizer.ts');
      expect(modules).not.toContain('HoverGestureRecognizer.ts');
    },
  );

  it('reads type-only imports as free', () => {
    // GestureRecognizer imports GestureArena for its types alone.
    expect(reachable('GestureRecognizer.ts')).not.toContain('GestureArena.ts');
  });
});
