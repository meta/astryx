// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layerViewportInset.test.ts
 * @input The layer runtime's gutter module and the core source tree
 * @output Proves one gutter definition and the clamp helper (spec:AST-059
 *   FR1, FR6, FR7)
 */

import {readdirSync, readFileSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {layerViewportInset} from './layerViewportInset.stylex';
import {clampInlineSize, isIntrinsicInlineSize} from './clampInlineSize';

const EDGES = ['block-start', 'block-end', 'inline-start', 'inline-end'];

// Surfaces that keep the same gutter by convention but are not anchor-mode
// layers (spec:AST-059 non-goals), plus the module itself. AppShell reads the
// device's insets for the page shell itself (its header and the end of its
// content), not as a layer gutter.
const GUTTER_OWNERS = new Set([
  'Layer/layerViewportInset.stylex.ts',
  'AppShell/AppShell.tsx',
  'Dialog/Dialog.tsx',
  'Toast/ToastViewport.tsx',
  'BottomSheet/BottomSheetPanel.tsx',
  'Drawer/Drawer.tsx',
  'Stepper/Step.tsx',
  'Tokenizer/useEndLaneReserve.ts',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('layerViewportInset (spec:AST-059)', () => {
  it('reads the spacing step, the safe-area inset, and the app-declared inset for every edge (FR1, FR6)', () => {
    expect(layerViewportInset.gutterBlockStart).toBe(
      'calc(max(var(--spacing-4), env(safe-area-inset-top, 0px)) + var(--astryx-layer-inset-block-start, 0px))',
    );
    expect(layerViewportInset.gutterBlockEnd).toBe(
      'calc(max(var(--spacing-4), env(safe-area-inset-bottom, 0px)) + var(--astryx-layer-inset-block-end, 0px))',
    );
    // One inline gutter serves both edges: the larger safe-area inset and the
    // larger app inset, so a flipped layer still clears a notch.
    expect(layerViewportInset.gutterInline).toBe(
      'calc(max(var(--spacing-4), env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + max(var(--astryx-layer-inset-inline-start, 0px), var(--astryx-layer-inset-inline-end, 0px)))',
    );
    for (const edge of EDGES) {
      const property = `--astryx-layer-inset-${edge}`;
      expect(
        layerViewportInset.maxInlineSize + layerViewportInset.maxBlockSize,
      ).toContain(`var(${property}, 0px)`);
    }
  });

  it('caps both axes to the viewport minus both gutters, with env()-less fallbacks (FR2, FR3)', () => {
    expect(layerViewportInset.maxInlineSize).toMatch(/^calc\(100vi - /);
    expect(layerViewportInset.maxBlockSize).toMatch(/^calc\(100dvb - /);
    expect(layerViewportInset.maxInlineSizeFallback).toMatch(/^calc\(100vw - /);
    expect(layerViewportInset.maxBlockSizeFallback).toMatch(/^calc\(100vh - /);
    for (const value of [
      layerViewportInset.maxInlineSizeFallback,
      layerViewportInset.maxBlockSizeFallback,
      layerViewportInset.gutterInlineFallback,
      layerViewportInset.gutterBlockStartFallback,
      layerViewportInset.gutterBlockEndFallback,
    ]) {
      expect(value).not.toContain('env(');
      expect(value).toContain('--astryx-layer-inset-');
    }
    // Never the span beside the trigger.
    for (const value of Object.values(layerViewportInset)) {
      expect(value).not.toContain('100%');
    }
  });

  it('is the only gutter definition among anchor-mode layers (FR1, FR7)', () => {
    const root = join(process.cwd(), 'packages/core/src');
    const offenders = sourceFiles(root)
      .filter(file => {
        const source = readFileSync(file, 'utf8');
        // A gutter of its own, or a size capped to the span beside the
        // trigger: `100%` of a position-area region minus the gutter.
        return (
          /safe-area-inset-(left|right|top|bottom)/.test(source) ||
          /calc\(100% - (max\(|\$\{spacingVars\['--spacing-4'\]\})/.test(source)
        );
      })
      .map(file => file.slice(root.length + 1))
      .filter(file => !GUTTER_OWNERS.has(file));
    expect(offenders).toEqual([]);
  });
});

describe('clampInlineSize (spec:AST-059 FR7)', () => {
  it('clamps a length to the cap and treats a number as pixels', () => {
    expect(clampInlineSize(352, 'CAP')).toBe('min(352px, CAP)');
    expect(clampInlineSize(' 20rem ', 'CAP')).toBe('min(20rem, CAP)');
  });

  it('recognizes keywords that cannot be clamped', () => {
    for (const keyword of [
      'auto',
      'max-content',
      'fit-content(20em)',
      'Inherit',
    ]) {
      expect(isIntrinsicInlineSize(keyword)).toBe(true);
    }
    expect(isIntrinsicInlineSize('352px')).toBe(false);
  });
});
