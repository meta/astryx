// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylex-size-boundary.browser.test.mjs
 * @input Core's compact StyleX key (touchKeys.compact, alone and nested in
 *   the touch key, as the touch presentation notes nest it) compiled by core's
 *   build; run with
 *   ASTRYX_STYLEX_BROWSER=1 after installing Chromium (CI's test-build job
 *   does both)
 * @output Real-browser proof that the compact key matches at 767px wide and
 *   499px tall and not at 768px or 500px, alone, nested in the touch key, and
 *   beside another media key on the same property in either order, under a
 *   fine and a coarse pointer, with and without Reduce Motion; and that the
 *   range spelling StyleX lowers does match at the edge (the control)
 * @position The browser half of
 *   packages/core/src/theme/themeAdaptations.edges.test.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import {transformSync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {chromium} from 'playwright';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

import {TOUCH_QUERY} from '../packages/core/src/utils/touchQueries';

const CORE = path.resolve(import.meta.dirname, '../packages/core');

const OFF = 'rgb(0, 0, 255)';
const ON = 'rgb(255, 0, 0)';
const OTHER = 'rgb(0, 128, 0)';

// The compact key exactly as Core spells it. The `.stylex.ts` module only
// loads compiled, so the test reads its literal.
const COMPACT = /^\s*compact:\s*'([^']+)'/m.exec(
  fs.readFileSync(
    path.join(CORE, 'src/utils/touchPresentation.stylex.ts'),
    'utf8',
  ),
)[1];
const TOUCH = `@media ${TOUCH_QUERY}`;
const MOTION = '@media (prefers-reduced-motion: reduce)';
const WIDE = '@media (min-width: 1024px)';
// The range spelling the compact definition gives script: the control.
const RANGE = '@media (width < 768px), (height < 500px)';

// Each case: its color entries after `default`, as Core writes literal keys.
// StyleX makes an earlier key exclude the later ones, so the later key wins
// where both match.
const CASES = {
  compact: `'${COMPACT}': '${ON}'`,
  compactTouch: `'${TOUCH}': {default: null, '${COMPACT}': '${ON}'}`,
  touchThenCompact: `'${TOUCH}': '${OTHER}', '${COMPACT}': '${ON}'`,
  compactThenTouch: `'${COMPACT}': '${ON}', '${TOUCH}': '${OTHER}'`,
  motionThenCompact: `'${MOTION}': '${OTHER}', '${COMPACT}': '${ON}'`,
  compactThenMotion: `'${COMPACT}': '${ON}', '${MOTION}': '${OTHER}'`,
  wideThenCompact: `'${WIDE}': '${OTHER}', '${COMPACT}': '${ON}'`,
  range: `'${RANGE}': '${ON}'`,
};

/** The color each case must show in one environment. */
function expected(name, {width, height, coarse, motion}) {
  const compact = width < 768 || height < 500;
  const atEdge = compact || width === 768 || height === 500;
  const first = (a, b) => (a ? ON : b ? OTHER : OFF);
  const last = (a, b) => (b ? OTHER : a ? ON : OFF);
  switch (name) {
    case 'compact':
      return compact ? ON : OFF;
    case 'compactTouch':
      return compact && coarse ? ON : OFF;
    case 'touchThenCompact':
      return first(compact, coarse);
    case 'compactThenTouch':
      return last(compact, coarse);
    case 'motionThenCompact':
      return first(compact, motion);
    case 'compactThenMotion':
      return last(compact, motion);
    case 'wideThenCompact':
      return first(compact, width >= 1024);
    default:
      return atEdge ? ON : OFF;
  }
}

const PROBE = `
import * as stylex from '@stylexjs/stylex';
export const styles = stylex.create({
${Object.entries(CASES)
  .map(
    ([name, entries]) => `  ${name}: {color: {default: '${OFF}', ${entries}}},`,
  )
  .join('\n')}
});
`;

// Each edge, a pixel below it and a pixel above it, and the wide point.
const SIZES = [
  [767, 900],
  [768, 900],
  [769, 900],
  [1024, 900],
  [1280, 499],
  [1280, 500],
  [1280, 501],
];

function compileProbe() {
  const result = transformSync(PROBE, {
    filename: path.join(CORE, 'src/SizeBoundaryProbe.tsx'),
    configFile: path.join(CORE, 'babel.config.json'),
    cwd: CORE,
  });
  const classes = name =>
    new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`)
      .exec(result.code)[1]
      .match(/"(x\w+(?: x\w+)*)"/g)
      .map(value => value.slice(1, -1))
      .join(' ');
  return {
    css: stylexBabelPlugin.processStylexRules(result.metadata.stylex, false),
    classes: Object.fromEntries(
      Object.keys(CASES).map(name => [name, classes(name)]),
    ),
  };
}

describe.runIf(process.env.ASTRYX_STYLEX_BROWSER === '1')(
  "core's compact StyleX key at the edges, in Chromium",
  () => {
    let browser;
    let probe;
    beforeAll(async () => {
      probe = compileProbe();
      browser = await chromium.launch({args: ['--no-sandbox']});
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
    });

    for (const coarse of [false, true]) {
      for (const motion of [false, true]) {
        it(`matches below the edges only, with a ${coarse ? 'coarse' : 'fine'} pointer${motion ? ' and Reduce Motion' : ''}`, async () => {
          const context = await browser.newContext({
            hasTouch: coarse,
            reducedMotion: motion ? 'reduce' : 'no-preference',
          });
          const page = await context.newPage();
          try {
            await page.setContent(
              `<style>${probe.css}</style>` +
                Object.entries(probe.classes)
                  .map(
                    ([name, cls]) => `<div id="${name}" class="${cls}"></div>`,
                  )
                  .join(''),
            );
            const seen = [];
            const want = [];
            for (const [width, height] of SIZES) {
              await page.setViewportSize({width, height});
              seen.push(
                await page.evaluate(names => {
                  const colors = {size: `${innerWidth}x${innerHeight}`};
                  for (const name of names) {
                    colors[name] = getComputedStyle(
                      document.getElementById(name),
                    ).color;
                  }
                  return colors;
                }, Object.keys(CASES)),
              );
              const environment = {width, height, coarse, motion};
              want.push({
                size: `${width}x${height}`,
                ...Object.fromEntries(
                  Object.keys(CASES).map(name => [
                    name,
                    expected(name, environment),
                  ]),
                ),
              });
            }
            expect(seen).toEqual(want);
          } finally {
            await context.close();
          }
        });
      }
    }
  },
);
