// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikit.test.ts
 * @input vitest, the UIKit constants table and its source text
 * @output Enforces law P2 on the table: every leaf has a source of an
 *   allowed kind, every guess and every WebKit value names its measurement
 *   task, every task is listed in motion/MEASUREMENTS.md; checks the plain
 *   values (ratios, rates, curves) and that the press clocks agree with the
 *   touch press model they were measured for
 * @position Testing; validates motion/uikit/*.ts without a browser
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  PRESS_FADE_MS,
  PRESS_FLASH_MS,
  PRESS_ONSET_MS,
  PRESS_SCROLL_BRAKE_MS,
} from '../../utils/pressGesture';
import {scroll, springs, timing} from '.';
import {HAPTIC_VIBRATION_PATTERNS, UIKIT_GESTURES} from './gestures';

// Domain files whose entries are typed constants ({value, unit, source} or
// {value, unit, guess, measure}); the same rules are checked on the values.
const TYPED_TABLE_FILES = ['gestures.ts'];
// Every other domain file carries its sources as JSDoc tags: a new one is
// enforced the moment it lands.
const TABLE_FILES = fs
  .readdirSync(__dirname)
  .filter(
    file =>
      file.endsWith('.ts') &&
      file !== 'index.ts' &&
      !file.endsWith('.test.ts') &&
      !TYPED_TABLE_FILES.includes(file),
  )
  .sort();
const SOURCE_KINDS =
  /^@source (apple-docs https:\/\/developer\.apple\.com\/|wwdc \d{4}-\d+ |webkit Source\/|measured: .*iOS \d|GUESS — )/;

interface Leaf {
  file: string;
  key: string;
  doc: string;
}

/**
 * Every leaf of the exported table object with the JSDoc block right above
 * it. A line ending in `{` opens a group (no source of its own); any other
 * `key: value,` line is a leaf.
 */
function leavesOf(file: string): Leaf[] {
  const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex(line => /^export const \w+ = \{$/.test(line));
  expect(start).toBeGreaterThan(-1);
  const leaves: Leaf[] = [];
  let doc = '';
  let inDoc = false;
  let groupLeafCount: number[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('/**')) {
      inDoc = true;
      doc = '';
    }
    if (inDoc) {
      doc += trimmed.replace(/^\/?\*+\/?\s?/, '') + '\n';
      if (trimmed.endsWith('*/')) {
        inDoc = false;
      }
      continue;
    }
    if (trimmed === '' || trimmed.startsWith('//')) {
      continue;
    }
    const group = /^(\w+): \{$/.exec(trimmed);
    if (group) {
      groupLeafCount.push(0);
      doc = '';
      continue;
    }
    if (/^\},?$/.test(trimmed)) {
      const count = groupLeafCount.pop();
      expect(count, `${file}: empty group`).toBeGreaterThan(0);
      continue;
    }
    if (trimmed.startsWith('} as const')) {
      break;
    }
    const leaf = /^(\w+): .+,$/.exec(trimmed);
    expect(
      leaf,
      `${file}: unexpected line ${JSON.stringify(trimmed)}`,
    ).not.toBeNull();
    if (leaf) {
      leaves.push({file, key: leaf[1], doc});
      groupLeafCount = groupLeafCount.map(n => n + 1);
    }
    doc = '';
  }
  return leaves;
}

const MEASUREMENTS = fs.readFileSync(
  path.resolve(__dirname, '../MEASUREMENTS.md'),
  'utf8',
);

describe('UIKit constants table: every value is sourced (law P2)', () => {
  const leaves = TABLE_FILES.flatMap(leavesOf);

  it('finds the table entries', () => {
    expect(TABLE_FILES).toEqual(
      expect.arrayContaining([
        'navigation.ts',
        'scroll.ts',
        'springs.ts',
        'timing.ts',
      ]),
    );
    expect(leaves.length).toBeGreaterThan(50);
  });

  for (const {file, key, doc} of leaves) {
    it(`${file} › ${key}`, () => {
      // Collapse each tag's continuation lines onto it.
      const tags = doc
        .split(/\n(?=@)/)
        .map(tag => tag.replace(/\s*\n\s*/g, ' ').trim())
        .filter(tag => tag.startsWith('@'));
      const sources = tags.filter(tag => tag.startsWith('@source '));
      expect(sources.length, `${key} has no @source`).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source, `${key}: unknown source kind`).toMatch(SOURCE_KINDS);
      }
      const needsMeasurement = sources.some(source =>
        /^@source (GUESS|webkit)/.test(source),
      );
      const measures = tags.filter(tag => tag.startsWith('@measure '));
      if (needsMeasurement) {
        expect(
          measures.length,
          `${key} is unconfirmed but names no @measure task`,
        ).toBeGreaterThan(0);
      }
      for (const measure of measures) {
        const id = /^@measure (M-[A-Z0-9]+)$/.exec(measure)?.[1];
        expect(id, `${key}: malformed ${measure}`).toBeDefined();
        expect(MEASUREMENTS, `${id} is not in motion/MEASUREMENTS.md`).toMatch(
          new RegExp(`^\\| ${id} +\\|`, 'm'),
        );
      }
    });
  }
});

describe('UIKit constants table: typed domains follow the same rules', () => {
  const constants: [
    string,
    {source?: string; guess?: string; measure?: string},
  ][] = [
    ...Object.entries(UIKIT_GESTURES).flatMap(([group, values]) =>
      Object.entries(values).map(
        ([name, constant]) =>
          [`gestures.${group}.${name}`, constant] as [
            string,
            {source?: string; guess?: string; measure?: string},
          ],
      ),
    ),
    ...Object.entries(HAPTIC_VIBRATION_PATTERNS).map(
      ([kind, constant]) =>
        [`haptics.${kind}`, constant] as [
          string,
          {source?: string; guess?: string; measure?: string},
        ],
    ),
  ];

  it('finds the gesture constants', () => {
    expect(constants.length).toBeGreaterThan(20);
  });

  it.each(constants)('%s', (name, constant) => {
    if (constant.source != null) {
      expect(`@source ${constant.source}`, name).toMatch(SOURCE_KINDS);
    } else {
      expect(
        constant.guess,
        `${name} has neither a source nor a guess`,
      ).toBeTruthy();
      const id = /^(M-[A-Z0-9]+): /.exec(constant.measure ?? '')?.[1];
      expect(
        id,
        `${name}: measure must start with its MEASUREMENTS.md ID`,
      ).toBeDefined();
      expect(MEASUREMENTS, `${id} is not in motion/MEASUREMENTS.md`).toMatch(
        new RegExp(`^\\| ${id} +\\|`, 'm'),
      );
    }
  });
});

describe('UIKit constants table: values', () => {
  it('UIKit\u2019s default spring has the documented damping ratio 4.56 before clamping', () => {
    const {mass, stiffness, damping} = springs.uikitDefault;
    expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeCloseTo(4.56, 2);
  });

  it('deceleration rates are per-millisecond factors in (0, 1), fast below normal', () => {
    expect(scroll.decelerationRate.fast).toBeLessThan(
      scroll.decelerationRate.normal,
    );
    expect(scroll.decelerationRate.normal).toBeLessThan(1);
  });

  it('press clocks agree with the touch press model they were measured for', () => {
    expect(scroll.delaysContentTouchesMs).toBe(PRESS_ONSET_MS);
    expect(timing.press.flashMs).toBe(PRESS_FLASH_MS);
    expect(timing.press.highlightOutMs).toBe(PRESS_FADE_MS);
    expect(timing.press.scrollBrakeMs).toBe(PRESS_SCROLL_BRAKE_MS);
  });

  it('curves are valid cubic-bézier control points', () => {
    for (const [x1, , x2] of Object.values(timing.curves)) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x2).toBeLessThanOrEqual(1);
    }
  });
});
