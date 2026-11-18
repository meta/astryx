// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text a picture draws too faint to read, as the browser that
 * takes the picture measures it: faint text in a part is found with its
 * part, ratio and colors; the theme's disabled text color, text over a
 * picture or gradient beside it, and text in no part are left out. show
 * notes each part and mode no contrast check names, with its picture.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {screenshot} from './_preview.mjs';
import {drawnContrastNotes} from './_edit.mjs';

const chrome = [
  ...(process.env.PATH ?? '')
    .split(path.delimiter)
    .flatMap(d =>
      ['google-chrome', 'chromium', 'chromium-browser', 'chrome'].map(n =>
        path.join(d, n),
      ),
    ),
].find(f => {
  try {
    fs.accessSync(f, fs.constants.X_OK);
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
});

const PAGE = `<html><body style="margin:0;background:#ffffff">
<div style="--color-text-disabled:#aaaaaa">
  <div class="astryx-top-nav-item" style="background:#bcbee4;color:#5a5146;padding:8px">Projects</div>
  <div class="astryx-button" style="color:#aaaaaa;padding:8px">Disabled look</div>
  <div class="astryx-overlay" style="position:relative;width:200px;height:100px">
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#172554,#67e8f9)"></div>
    <div class="astryx-overlay-scrim" style="position:absolute;inset:0;background:rgba(0,0,0,0.2)">
      <span class="astryx-button" style="color:#ffffff">Quick view</span>
    </div>
  </div>
  <div style="color:#eeeeee">No part</div>
  <div class="astryx-text" style="color:#111111">Readable</div>
</div></body></html>`;

describe('text a picture draws too faint to read', () => {
  it.skipIf(!chrome)(
    'is measured in its part, leaving out disabled text, media and text in no part',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-faint-'));
      try {
        const html = path.join(dir, 'p.html');
        fs.writeFileSync(html, PAGE);
        const r = /** @type {any} */ (
          await screenshot(
            {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
            html,
            path.join(dir, 'p.png'),
            'light',
          )
        );
        expect(r.ok, r.reason).toBe(true);
        expect(r.lowContrast).toEqual([
          {
            part: 'top-nav-item',
            text: 'Projects',
            ratio: 4.3,
            fg: '#5a5146',
            bg: '#bcbee4',
          },
        ]);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000,
  );

  it.skipIf(!chrome)(
    'reports a faint copy of a text drawn earlier over a picture',
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-faint-'));
      try {
        const html = path.join(dir, 'p.html');
        // The same badge text in the same colors twice: first over a
        // picture beside it (left out: no one color is behind it), then on
        // the plain white page, where it is too faint to read.
        fs.writeFileSync(
          html,
          `<html><body style="margin:0;background:#ffffff">
  <div style="position:relative;width:200px;height:60px">
    <div style="position:absolute;inset:0;background:linear-gradient(135deg,#172554,#67e8f9)"></div>
    <span class="astryx-badge" style="position:relative;color:#9ca3af">Draft</span>
  </div>
  <span class="astryx-badge" style="color:#9ca3af">Draft</span>
</body></html>`,
        );
        const r = /** @type {any} */ (
          await screenshot(
            {cwd: dir, req: createRequire(path.join(dir, 'package.json'))},
            html,
            path.join(dir, 'p.png'),
            'light',
          )
        );
        expect(r.ok, r.reason).toBe(true);
        expect(r.lowContrast).toEqual([
          {
            part: 'badge',
            text: 'Draft',
            ratio: expect.any(Number),
            fg: '#9ca3af',
            bg: '#ffffff',
          },
        ]);
        expect(r.lowContrast[0].ratio).toBeLessThan(4.5);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    120_000,
  );
});

describe('show', () => {
  const drawn = [
    {
      page: null,
      file: 'themes/t/sheet-overlays.png',
      part: 'top-nav-item',
      text: 'Projects',
      mode: /** @type {const} */ ('light'),
      ratio: 4.3,
      fg: '#5a5146',
      bg: '#bcbee4',
    },
    {
      page: null,
      file: 'themes/t/sheet-overlays.png',
      part: 'citation',
      text: '1',
      mode: /** @type {const} */ ('light'),
      ratio: 4.46,
      fg: '#5a5146',
      bg: '#bfc1e8',
    },
  ];

  it('notes a part no check names, with its picture and how', () => {
    const notes = drawnContrastNotes(drawn, [
      {text: 'text in citation ("1") is 4.46:1 in light (…); text needs 4.5:1'},
    ]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(
      /^the pictures draw text in top-nav-item \("Projects"\) at 4\.3:1 in light \(#5a5146 on #bcbee4, in themes\/t\/sheet-overlays\.png\), which no check above measures; text needs 4\.5:1; what draws it: .* how top-nav-item$/,
    );
  });

  it('says nothing a check already names in that mode', () => {
    expect(
      drawnContrastNotes(drawn, [
        {text: 'text in top-nav-item ("Projects") is 4.3:1 in light (…)'},
        {text: 'text in citation ("1") is 4.46:1 in light (…)'},
      ]),
    ).toEqual([]);
  });
});
