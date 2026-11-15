// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file recognizerKind.test.ts
 * @input Each recognizer of the family, and the sources of Core and Lab
 * @output A recognizer is told apart by its `kind`, never by `instanceof`
 *   (architecture:react-component-runtime INV13): each one reports its kind,
 *   a screen-edge pan its own; and no source checks a recognizer's class
 * @position Unit and source boundary test of packages/core/src/gestures
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {LongPressGestureRecognizer} from '../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../PanGestureRecognizer';
import {PinchGestureRecognizer} from '../PinchGestureRecognizer';
import {ScreenEdgePanGestureRecognizer} from '../ScreenEdgePanGestureRecognizer';
import {SwipeGestureRecognizer} from '../SwipeGestureRecognizer';
import {TapGestureRecognizer} from '../TapGestureRecognizer';

const ROOT = path.resolve(__dirname, '../../../../..');

function sourcesUnder(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(full);
      } else if (/\.(m?[jt]sx?)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  if (fs.existsSync(directory)) {
    visit(directory);
  }
  return files;
}

describe('recognizer kinds', () => {
  it('each recognizer reports its kind, a screen-edge pan its own (architecture:react-component-runtime INV13)', () => {
    const kinds = [
      new TapGestureRecognizer(),
      new LongPressGestureRecognizer(),
      new PanGestureRecognizer(),
      new ScreenEdgePanGestureRecognizer({edges: ['leading']}),
      new SwipeGestureRecognizer(),
      new PinchGestureRecognizer(),
    ].map(recognizer => (recognizer as {kind?: string}).kind);
    expect(kinds).toEqual([
      'tap',
      'longPress',
      'pan',
      'screenEdgePan',
      'swipe',
      'pinch',
    ]);
  });

  it('is never told apart by instanceof in Core or Lab (architecture:react-component-runtime INV13)', () => {
    // Built from parts, so this file does not match itself.
    const check = new RegExp(
      ['\\binstanceof\\s+', '[A-Za-z]*', 'GestureRecognizer\\b'].join(''),
    );
    const offenders = [
      ...sourcesUnder(path.join(ROOT, 'packages/core/src')),
      ...sourcesUnder(path.join(ROOT, 'packages/lab/src')),
    ]
      .filter(file => check.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
