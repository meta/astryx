// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file layoutReset.test.tsx
 * @input Layout's and Section's source files, and `layoutReset` applied to an
 *   element inside a padded Section.
 * @output Proof that the reset covers every layout custom property Layout
 *   writes (`component:Layout` FR8): a new property fails here until the
 *   reset stops it too.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {render, screen} from '@testing-library/react';
import * as stylex from '@stylexjs/stylex';
import {describe, expect, it} from 'vitest';
import {layoutReset} from './layoutReset';
import {Section} from '../Section/Section';

const SRC = path.resolve(__dirname, '..');

/** The directories whose components publish layout custom properties. */
const WRITERS = ['Layout', 'Section'];

/** Every layout custom property written as a style key in a writer's source. */
function writtenLayoutProperties(): string[] {
  const names = new Set<string>();
  for (const dir of WRITERS) {
    for (const file of fs.readdirSync(path.join(SRC, dir), {recursive: true})) {
      const name = String(file);
      if (!/\.tsx?$/.test(name) || /\.(test|spec)\./.test(name)) {
        continue;
      }
      const source = fs.readFileSync(path.join(SRC, dir, name), 'utf8');
      for (const match of source.matchAll(
        /['"](--(?:layout|_layout|container|_section)[\w-]*)['"]\s*:/g,
      )) {
        names.add(match[1]);
      }
    }
  }
  return [...names].sort();
}

/** The custom properties `layoutReset` sets, as its readers see them. */
const RESET_VALUES: Record<string, string[]> = {
  '0px': [
    '--container-padding-inline-start',
    '--container-padding-inline-end',
    '--container-padding-block-start',
    '--container-padding-block-end',
  ],
  initial: [
    '--layout-padding-outer-x',
    '--layout-padding-outer-y',
    '--layout-padding-own-outer-x',
    '--layout-padding-own-outer-y',
    '--layout-padding-inner-x',
    '--layout-padding-inner-y',
    '--layout-content-width',
    '--layout-alignment-width',
    '--_layout-flush-block-start',
    '--_layout-flush-block-end',
    '--_section-padding-propagated',
    '--container-max-height',
  ],
};
const RESET_PROPERTIES = Object.values(RESET_VALUES).flat().sort();

describe('layoutReset (component:Layout FR8)', () => {
  it('covers every layout custom property Layout and Section write', () => {
    const written = writtenLayoutProperties();
    expect(written.length).toBeGreaterThan(0);
    expect(RESET_PROPERTIES).toEqual(written);
  });

  it('stops each of them at the element it is applied to', () => {
    render(
      <Section padding={10}>
        <div data-testid="root" {...stylex.props(layoutReset)} />
      </Section>,
    );
    const computed = getComputedStyle(screen.getByTestId('root'));
    for (const name of RESET_VALUES['0px']) {
      expect(computed.getPropertyValue(name), name).toBe('0px');
    }
    for (const name of RESET_VALUES.initial) {
      // An empty value would mean the reset declares nothing.
      expect(computed.getPropertyValue(name), name).toBe('initial');
    }
  });
});
