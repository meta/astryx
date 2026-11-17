// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylex-module-resolution.browser.test.mjs
 * @input Core's `indicatorScope` marker compiled by core's build, and a lab
 *   rule on it compiled by lab's build; run with ASTRYX_STYLEX_BROWSER=1 after
 *   installing Chromium (CI's test-build job does both)
 * @output Real-browser proof that a lab element styled with
 *   `stylex.when.ancestor(':hover', indicatorScope)` changes when the core
 *   element carrying the marker is hovered
 * @position The browser half of stylex-module-resolution.test.mjs: the names
 *   agreeing is what makes the selector match, and this shows it does
 */

import fs from 'node:fs';
import path from 'node:path';

import {transformSync} from '@babel/core';
import stylexBabelPlugin from '@stylexjs/babel-plugin';
import {chromium} from 'playwright';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const CORE = path.join(ROOT, 'packages/core');
const LAB = path.join(ROOT, 'packages/lab');

const PROBE = `
import * as stylex from '@stylexjs/stylex';
import {indicatorScope} from '@astryxdesign/core/Indicator/indicator.markers.stylex';
export const styles = stylex.create({
  child: {
    color: {
      default: 'rgb(255, 0, 0)',
      [stylex.when.ancestor(':hover', indicatorScope)]: 'rgb(0, 0, 255)',
    },
  },
});
`;

describe.runIf(process.env.ASTRYX_STYLEX_BROWSER === '1')(
  "a lab rule on core's marker, in Chromium",
  () => {
    let browser;
    beforeAll(async () => {
      browser = await chromium.launch({args: ['--no-sandbox']});
    }, 60_000);
    afterAll(async () => {
      await browser?.close();
    });

    it('takes effect when the core owner is hovered', async () => {
      // The marker class core's own build gives indicatorScope.
      const markerFile = path.join(
        CORE,
        'src/Indicator/indicator.markers.stylex.ts',
      );
      const marker = /\{\s*(\w+):\s*"\1"/.exec(
        transformSync(fs.readFileSync(markerFile, 'utf8'), {
          filename: markerFile,
          configFile: path.join(CORE, 'babel.config.json'),
          cwd: CORE,
        }).code,
      )[1];
      // The lab rule as lab's build compiles it, and its CSS.
      const lab = transformSync(PROBE, {
        filename: path.join(LAB, 'src/MarkerHoverProbe.tsx'),
        configFile: path.join(LAB, 'babel.config.cjs'),
        cwd: LAB,
      });
      const childClasses = /child:\s*\{([^}]*)\}/
        .exec(lab.code)[1]
        .match(/"(x\w+(?: x\w+)*)"/g)
        .map(value => value.slice(1, -1))
        .join(' ');
      const css = stylexBabelPlugin.processStylexRules(
        lab.metadata.stylex,
        false,
      );

      const page = await browser.newPage();
      try {
        await page.setContent(
          `<style>${css}</style>` +
            `<div id="owner" class="${marker}" style="padding: 40px">` +
            `<span id="child" class="${childClasses}">lab child</span></div>`,
        );
        const color = () =>
          page.$eval('#child', element => getComputedStyle(element).color);
        expect(await color()).toBe('rgb(255, 0, 0)');
        await page.hover('#owner');
        expect(await color()).toBe('rgb(0, 0, 255)');
      } finally {
        await page.close();
      }
    });
  },
);
