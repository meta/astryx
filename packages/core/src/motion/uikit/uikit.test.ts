// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikit.test.ts
 * @input vitest, the UIKit constants table and its source text
 * @output Enforces `spec:AST-094` FR2 on the table: every leaf has a source of an
 *   allowed kind, every guess and every WebKit value names its measurement
 *   task, every task is listed in motion/MEASUREMENTS.md, and no value ships
 *   its source; checks the plain values (ratios, rates, curves) and that the
 *   press clocks agree with the touch press model they were measured for
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

// Modules in this folder that hold no table of their own (none yet).
const NON_TABLE_FILES: string[] = [];
// Every domain file carries its sources as JSDoc tags: a new one is enforced
// the moment it lands.
const TABLE_FILES = fs
  .readdirSync(__dirname)
  .filter(
    file =>
      file.endsWith('.ts') &&
      file !== 'index.ts' &&
      !file.endsWith('.test.ts') &&
      !NON_TABLE_FILES.includes(file),
  )
  .sort();
// Where a number comes from is documentation: a value that carried it would
// ship it in every bundle that reads the value.
const PROVENANCE_KEYS = new Set(['source', 'guess', 'measure']);
/** A measurement names its subject, the iOS version it ran on and its date. */
const MEASURED =
  /^@source measured: .*iOS \d.*(\b20\d\d-\d\d-\d\d\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? 20\d\d\b)/;
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
  // Every exported object: a row when its own JSDoc carries the source (one
  // spring, exported so a reader takes it alone), otherwise a table or a
  // group of its own (the press clocks) whose leaves carry the sources.
  const starts: number[] = [];
  const rows: Leaf[] = [];
  // The groups and rows this file exports itself: a leaf that only names one
  // of them is checked where it is declared.
  const exported = new Set<string>();
  lines.forEach((line, index) => {
    const match = /^export const (\w+) = \{/.exec(line);
    if (match == null) {
      return;
    }
    exported.add(match[1]);
    const doc = docAbove(lines, index);
    // A one-line export is a row whether or not it is sourced, so an
    // unsourced one fails the source check below instead of being skipped.
    if (/^@source /m.test(doc) || !line.endsWith('{')) {
      rows.push({file, key: match[1], doc});
    } else {
      starts.push(index);
    }
  });
  expect(starts.length).toBeGreaterThan(0);
  return [
    ...starts.flatMap(start => leavesFrom(file, lines, start, exported)),
    ...rows,
  ];
}

/** The JSDoc block right above line `index`, without its comment markers. */
function docAbove(lines: string[], index: number): string {
  if (!lines[index - 1]?.trim().endsWith('*/')) {
    return '';
  }
  let first = index - 1;
  while (first > 0 && !lines[first].trim().startsWith('/**')) {
    first--;
  }
  return lines
    .slice(first, index)
    .map(text => text.trim().replace(/^\/?\*+\/?\s?/, '') + '\n')
    .join('');
}

function leavesFrom(
  file: string,
  lines: string[],
  start: number,
  exported: ReadonlySet<string>,
): Leaf[] {
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
    // A group exported on its own and read back by name (`press,` or
    // `tap: UIKIT_TAP,`): its leaves are checked where it is declared.
    const reference = /^(?:\w+: )?(\w+),$/.exec(trimmed);
    if (reference != null && exported.has(reference[1])) {
      doc = '';
      continue;
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

describe('UIKit constants table: every value is sourced (AST-094 FR2)', () => {
  const leaves = TABLE_FILES.flatMap(leavesOf);

  it('finds the table entries', () => {
    expect(TABLE_FILES).toEqual(
      expect.arrayContaining([
        'gestures.ts',
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
      expect(
        PROVENANCE_KEYS.has(key),
        `${file} › ${key}: a source belongs in the JSDoc, not in the value`,
      ).toBe(false);
      expectSourced(key, doc);
    });
  }
});

describe('UIKit constants table: no source in a value', () => {
  // Where a value comes from stays in its JSDoc, out of the bundle: no
  // domain file writes a provenance key in code, at any depth.
  for (const file of TABLE_FILES) {
    it(file, () => {
      const code = fs
        .readFileSync(path.resolve(__dirname, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/\b(source|guess|measure)\s*:/);
    });
  }
});

describe('UIKit constants table: blocks sourced as a whole', () => {
  it('gestures.ts › HAPTIC_VIBRATION_PATTERNS', () => {
    // Every pattern rests on the same guess, stated once above the object.
    const text = fs.readFileSync(
      path.resolve(__dirname, 'gestures.ts'),
      'utf8',
    );
    const end = text.indexOf('export const HAPTIC_VIBRATION_PATTERNS');
    expect(end).toBeGreaterThan(-1);
    const block = text.slice(text.lastIndexOf('/**', end), end);
    const doc = block
      .split('\n')
      .map(line => line.trim().replace(/^\/?\*+\/?\s?/, ''))
      .join('\n');
    expectSourced('HAPTIC_VIBRATION_PATTERNS', doc);
  });
});

/** The JSDoc rules every sourced value follows. */
function expectSourced(key: string, doc: string) {
  // Collapse each tag's continuation lines onto it.
  const tags = doc
    .split(/\n(?=@)/)
    .map(tag => tag.replace(/\s*\n\s*/g, ' ').trim())
    .filter(tag => tag.startsWith('@'));
  const sources = tags.filter(tag => tag.startsWith('@source '));
  expect(sources.length, `${key} has no @source`).toBeGreaterThan(0);
  for (const source of sources) {
    expect(source, `${key}: unknown source kind`).toMatch(SOURCE_KINDS);
    if (source.startsWith('@source measured: ')) {
      expect(source, `${key}: a measurement needs its date`).toMatch(MEASURED);
    }
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
}

describe('UIKit constants table: values', () => {
  it('names each platform preset for its use, not its source', () => {
    // spec AST-094 FR4: a role is named for its use; the source stays in the
    // JSDoc (SwiftUI .smooth, UISpringTimingParameters(), Core Animation's
    // default curve).
    expect(springs).toMatchObject({
      fingerTracking: {response: 0.15, dampingRatio: 0.86},
      emphasis: {duration: 0.5, bounce: 0.3},
      settle: {duration: 0.5, bounce: 0},
      quickChange: {duration: 0.5, bounce: 0.15},
      viewChange: {mass: 3, stiffness: 1000, damping: 500},
      timedChange: {duration: 0.5, bounce: 0},
      stateChange: {response: 0.55, dampingRatio: 1},
      directChange: {response: 0.5, dampingRatio: 0.825},
    });
    expect(timing.stateChangeMs).toBe(250);
    expect(timing.curves).toEqual({
      viewChange: [0.25, 0.1, 0.25, 1],
      move: [0.42, 0, 0.58, 1],
      exit: [0.42, 0, 1, 1],
      entrance: [0, 0, 0.58, 1],
    });
    const sourceNames = [
      'smooth',
      'snappy',
      'bouncy',
      'interactive',
      'uikitDefault',
      'uikitSpringDuration',
      'swiftUIDefault',
      'swiftUISpring',
    ];
    for (const name of sourceNames) {
      expect(springs).not.toHaveProperty(name);
    }
    expect(timing).not.toHaveProperty('implicitAnimationMs');
  });

  it('rows measured on one spring stay equal', () => {
    // Each row is its own literal so a bundle keeps only the rows it
    // imports (springRows.test.ts); these were measured to share a spring.
    for (const group of [
      // UIKit's default spring.
      ['viewChange', 'sheetPresent', 'sheetDismiss', 'banner'],
      ['navigationPush', 'navigationPop'],
      // The presentation's pace at 80 % damping.
      ['sheetReleaseFast', 'sheetDismissSwipe'],
      // UIKit's legacy 0.404 s spring, critically damped.
      [
        'alertPresent',
        'alertDismiss',
        'actionSheetPresent',
        'actionSheetDismiss',
      ],
      ['menuOpen', 'contextMenuLift'],
      ['menuClose', 'contextMenuDismiss'],
    ] as const) {
      for (const name of group.slice(1)) {
        expect(springs[name], name).toEqual(springs[group[0]]);
      }
    }
  });

  it('UIKit\u2019s default spring has the documented damping ratio 4.56 before clamping', () => {
    const {mass, stiffness, damping} = springs.viewChange;
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
