// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Status fills that someone red-weak or green-weak may not tell apart are
 * noted with a line that sets one of them apart, and how answers a
 * color-blind question.
 */

import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-cvd-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('status colors for color-blind readers', () => {
  it('notes two status fills that may look alike, with a line that sets one apart', async () => {
    await themeEditNew('cb', {cwd, like: 'neutral'});
    await themeEditSet('cb', 'success', '#357d2b', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('cb', 'warning', '#8a6d00', {cwd})
    );
    const note = /** @type {string[]} */ (r.data.notes).find(n =>
      /^for color-blind readers, the success and warning fills may look alike/.test(
        n,
      ),
    );
    // (The line it offers keeps the moved fill standing out from the page:
    // set, it asks for no darker one.)
    const line = /set cb (\w+) '(#[0-9a-f]{6})'$/.exec(String(note));
    expect(line).not.toBeNull();
    const after = /** @type {any} */ (
      await themeEditSet('cb', String(line?.[1]), String(line?.[2]), {cwd})
    );
    expect(JSON.stringify(after.data.newProblems ?? [])).not.toMatch(
      /stands out from the page/,
    );
  }, 240_000);

  it('offers a line that stands out from the page in every mode', async () => {
    await themeEditNew('cb2', {cwd, like: 'neutral'});
    await themeEditSet('cb2', 'success', '#357d2b', {cwd});
    const r = /** @type {any} */ (
      await themeEditSet('cb2', 'warning', '#8a6d00', {cwd})
    );
    const note = String(
      /** @type {string[]} */ (r.data.notes).find(n =>
        /^for color-blind readers/.test(n),
      ),
    );
    const to = /set cb2 \w+ '(#[0-9a-f]{6})'$/.exec(note)?.[1];
    if (!to) return;
    const lum = (/** @type {string} */ h) => {
      const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(h.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (/** @type {string} */ a, /** @type {string} */ b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    for (const page of ['#f1f1f1', '#1b1b1b'])
      expect(ratio(to, page), page).toBeGreaterThanOrEqual(3);
  }, 240_000);

  it('keeps a change said in the same piece as a color-blind word', async () => {
    const r = /** @type {any} */ (
      await themeEditHow('a blue accent for color-blind users', {
        cwd,
        theme: 'cb',
      })
    );
    const lines = /** @type {any[]} */ (r.data.results ?? []).flatMap(
      x => x.commands,
    );
    expect(lines.some(c => / set cb accent '#2563eb'$/.test(c))).toBe(true);
  }, 240_000);

  it('how answers a color-blind question', async () => {
    const r = /** @type {any} */ (
      await themeEditHow('are the statuses color-blind safe?', {
        cwd,
        theme: 'cb',
      })
    );
    expect(JSON.stringify(r.data)).toMatch(/color-blind readers/);
  }, 240_000);

  it('answers every color-vision word within 5 s, never asking again forever', async () => {
    for (const ask of [
      'cvd safe status colors',
      'deuteranopia safe statuses',
      'make it protanopia friendly',
    ]) {
      const started = Date.now();
      const r = /** @type {any} */ (
        await Promise.race([
          themeEditHow(ask, {cwd, theme: 'cb'}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${ask}: over 5 s`)), 5000),
          ),
        ])
      );
      expect(Date.now() - started, ask).toBeLessThan(5000);
      expect(JSON.stringify(r.data), ask).toMatch(/color-blind readers/);
    }
  }, 60_000);

  it('asks a change said beside a color-blind word as said', async () => {
    const r = /** @type {any} */ (
      await themeEditHow('warnings darker for color-blind users', {
        cwd,
        theme: 'cb',
      })
    );
    const results = /** @type {any[]} */ (r.data.results ?? []);
    expect(
      results.flatMap(x => x.commands).some(c => / set cb warning '#/.test(c)),
    ).toBe(true);
    expect(results.some(x => /^color-blind readers/.test(x.text))).toBe(true);
  }, 240_000);

  it('keeps any change said beside a color-blind word', async () => {
    const texts = async (/** @type {string} */ ask) =>
      /** @type {any[]} */ (
        /** @type {any} */ (await themeEditHow(ask, {cwd, theme: 'cb'})).data
          .results ?? []
      ).map(x => String(x.text));
    const plain = await texts('make the success color more saturated');
    const blind = await texts(
      'make the success color more saturated for color-blind people',
    );
    expect(blind.some(t => /^color-blind readers/.test(t))).toBe(true);
    for (const t of plain) expect(blind).toContain(t);
  }, 240_000);

  it('answers the other asks said with a color-blind one, and never claims status color is backed by words everywhere', async () => {
    for (const ask of [
      'color-blind friendly statuses and a blue accent',
      'color-blind friendly statuses, a blue accent',
      // (The list keeps its shape: the color piece reads as it does with
      // no color-blind words.)
      'Theme our hospital staff rota app: calm and clinical, soft blue, very legible, status colors that color-blind staff can tell apart, light and dark.',
    ]) {
      const r = /** @type {any} */ (
        await themeEditHow(ask, {cwd, theme: 'cb'})
      );
      const results = /** @type {any[]} */ (r.data.results ?? []);
      const lines = results.flatMap(x => x.commands);
      // (The color piece is a palette color, as it is said alone: "soft
      // blue" is main's pale blue, the neutral.)
      expect(
        lines.some(c => / set cb (?:accent|neutral) '#[0-9a-f]{6}'$/.test(c)),
        ask,
      ).toBe(true);
      expect(
        lines.some(c => / set cb corners /.test(c)),
        ask,
      ).toBe(false);
      const blind = results.find(x => /^color-blind readers/.test(x.text));
      expect(blind, ask).toBeTruthy();
      expect(blind.text).not.toMatch(/never rests on color alone/);
    }
  }, 240_000);
});
