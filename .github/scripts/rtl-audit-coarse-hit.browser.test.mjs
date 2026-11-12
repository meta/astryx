// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Browser regression proof for D7 native target size and alignment.
 * @input ASTRYX_RTL_BROWSER=1 and installed Chromium; a minimal static story fixture.
 * @output The real RTL CLI passes conforming inputs and rejects independent
 *   width, height, centering, hit-test, and missing-contract mutations.
 * @position Runs in the existing RTL browser lane, not cold-clone unit tests.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const COMPONENTS = ['CheckboxInput', 'RadioList', 'Switch'];
const SCRIPT =
  process.env.ASTRYX_RTL_AUDIT_SCRIPT ??
  path.join(ROOT, 'apps/storybook/rtl-audit/rtl-audit.mjs');

function auditFixture({
  width = 24,
  height = 24,
  offset = 0,
  blocked = false,
  minimumTargetSize = {width: 24, height: 24},
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtl-coarse-hit-'));
  const targets = COMPONENTS.map(component => ({
    component,
    storyId: `core-${component.toLowerCase()}--coarse-fixture`,
    dims: ['D7'],
    sizes: ['sm', 'md'],
    minimumTargetSize,
    selectors: {inputSelector: 'input', wrapperSelector: '[data-wrapper]'},
  }));
  const write = (name, content) =>
    fs.writeFileSync(path.join(dir, name), content);
  write(
    'index.json',
    JSON.stringify({
      entries: Object.fromEntries(
        targets.map(target => [
          target.storyId,
          {
            id: target.storyId,
            title: `Core/${target.component}`,
            type: 'story',
          },
        ]),
      ),
    }),
  );
  write('targets.json', JSON.stringify(targets));
  write('verified-na.json', '[]');
  // A large visible wrapper must never substitute for the native input's box.
  write(
    'iframe.html',
    `<!doctype html><html><body>
    <div id="storybook-root"><span data-wrapper style="display:block;position:relative;width:64px;height:64px;margin:64px;background:#ddd">
      <input aria-label="Choice" style="appearance:none;position:absolute;box-sizing:border-box;margin:0;padding:0;border:0;left:calc(50% + ${offset}px);top:50%;transform:translate(-50%,-50%);width:${width}px;height:${height}px">
      ${blocked ? '<span style="position:absolute;inset:0"></span>' : ''}
    </span></div>
    <script>
      const params = new URLSearchParams(location.search);
      document.documentElement.dir = params.get('globals')?.includes('direction:rtl') ? 'rtl' : 'ltr';
      document.querySelector('input').type = params.get('id').includes('radiolist') ? 'radio' : 'checkbox';
    </script>
  </body></html>`,
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--storybook-dir',
        dir,
        '--targets',
        path.join(dir, 'targets.json'),
        '--verified-not-applicable',
        path.join(dir, 'verified-na.json'),
        '--output',
        path.join(dir, 'report.json'),
        '--curated-only',
        '--packages',
        'core',
        '--filter',
        COMPONENTS.join(','),
      ],
      {encoding: 'utf8', timeout: 30_000},
    );
    expect(result.error, result.stderr).toBeUndefined();
    const report = JSON.parse(
      fs.readFileSync(path.join(dir, 'report.json'), 'utf8'),
    );
    expect(report.curated.results).toHaveLength(COMPONENTS.length);
    return {status: result.status, cards: report.curated.results};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Chromium is installed by pr-rtl; pnpm test must still work without a browser.
describe.runIf(process.env.ASTRYX_RTL_BROWSER === '1')(
  'D7 native coarse target (INV9/INV10, DR8/DR12)',
  () => {
    it('passes the exact minimum in LTR/RTL at sm/md', () => {
      const {status, cards} = auditFixture();
      expect(status).toBe(0);
      for (const card of cards) {
        expect(card.dims.D7).toBe('pass');
        expect(
          card.coarseHits.results.map(({size, rtl}) => [size, rtl]),
        ).toEqual([
          ['sm', false],
          ['sm', true],
          ['md', false],
          ['md', true],
        ]);
        for (const result of card.coarseHits.results) {
          expect(result).toMatchObject({
            coarse: true,
            count: 1,
            allHitsOk: true,
          });
          expect(result.touchPoints).toBeGreaterThan(0);
          expect(result.centers[0]).toMatchObject({
            native: {width: 24, height: 24},
            wrapper: {width: 64, height: 64},
          });
        }
      }
    });

    it.each([
      {width: 23, height: 24},
      {width: 24, height: 23},
      {width: 20, height: 20},
    ])(
      'rejects a centered, hittable $width x $height native input',
      dimensions => {
        const {status, cards} = auditFixture(dimensions);
        expect(status).toBe(1);
        for (const card of cards) {
          expect(card.dims.D7).toBe('fail');
          for (const result of card.coarseHits.results) {
            expect(result.centers[0]).toMatchObject({
              hit: true,
              centered: true,
              meetsMinimum: false,
            });
            expect(result.centers[0].native).toMatchObject(dimensions);
          }
          expect(card.notes.join('\n')).toContain('minimum 24x24');
        }
      },
    );

    it.each([{offset: 3}, {blocked: true}])(
      'keeps center and hit-test enforcement for %j',
      mutation => {
        const {status, cards} = auditFixture(mutation);
        expect(status).toBe(1);
        for (const card of cards) {
          expect(card.dims.D7).toBe('fail');
          const target = card.coarseHits.results[0].centers[0];
          expect(target.meetsMinimum).toBe(true);
          expect(mutation.blocked ? target.hit : target.centered).toBe(false);
        }
      },
    );

    it.each([null, {width: 0, height: 24}, {width: 24}])(
      'fails closed on an invalid minimum %j',
      minimumTargetSize => {
        const {status, cards} = auditFixture({minimumTargetSize});
        expect(status).toBe(1);
        for (const card of cards) {
          expect(card.dims.D7).toBe('ERROR');
          expect(card.notes.join('\n')).toContain(
            'requires positive minimumTargetSize',
          );
        }
      },
    );
  },
);
