// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `how <picture.png>` measures the look's traits from the pixels:
 * control height, corners, edge width, gradients, how panels sit, and only
 * where enough boxes agree; everything else is named, never written. The
 * commands go through `set`'s check, and a setting the theme already has
 * keeps its value.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {encodePng} from './_png.mjs';
import {measureBoxes, pixelScale, readTraits} from './_picture-traits.mjs';
import {themeEditHow, themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    /** @type {any} */ (await importOriginal()),
  ),
);

/** @typedef {[number, number, number]} RGB */

/**
 * A canvas that draws boxes the way a browser does: rounded corners
 * antialiased (4x4 samples a pixel), an edge inside the box, a flat or
 * top-to-bottom gradient fill, and dark bars inside for its label.
 * @param {number} w @param {number} h @param {RGB} [page]
 */
function canvas(w, h, page = [255, 255, 255]) {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([...page, 255], i * 4);
  /** @param {number} x @param {number} y @param {RGB} c @param {number} a */
  const blend = (x, y, c, a) => {
    const i = (y * w + x) * 4;
    for (let k = 0; k < 3; k++)
      rgba[i + k] = Math.round(rgba[i + k] * (1 - a) + c[k] * a);
  };
  /**
   * How much of a pixel a rounded rectangle covers.
   * @param {number} px @param {number} py
   * @param {{x: number, y: number, w: number, h: number, r: number}} b
   */
  const cover = (px, py, b) => {
    let n = 0;
    for (let sy = 0; sy < 4; sy++)
      for (let sx = 0; sx < 4; sx++) {
        const x = px + (sx + 0.5) / 4, y = py + (sy + 0.5) / 4;
        if (x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
        const cx = Math.min(Math.max(x, b.x + b.r), b.x + b.w - b.r);
        const cy = Math.min(Math.max(y, b.y + b.r), b.y + b.h - b.r);
        if ((x - cx) ** 2 + (y - cy) ** 2 <= b.r ** 2) n++;
      }
    return n / 16;
  };
  return {
    /**
     * @param {{x: number, y: number, w: number, h: number, r?: number, edge?: number, edgeColor?: RGB, fill: RGB, fillEnd?: RGB, label?: boolean, labelAt?: 'centered' | 'start'}} b
     */
    box(b) {
      const r = b.r ?? 0, e = b.edge ?? 0;
      const outer = {x: b.x, y: b.y, w: b.w, h: b.h, r};
      const inner = {x: b.x + e, y: b.y + e, w: b.w - 2 * e, h: b.h - 2 * e, r: Math.max(0, r - e)};
      for (let y = b.y; y < b.y + b.h; y++)
        for (let x = b.x; x < b.x + b.w; x++) {
          const t = (y - b.y) / Math.max(1, b.h - 1);
          const fill = b.fillEnd
            ? /** @type {RGB} */ (b.fill.map((c, k) => c + ((b.fillEnd ?? b.fill)[k] - c) * t))
            : b.fill;
          const o = cover(x, y, outer);
          if (!o) continue;
          if (e) {
            blend(x, y, b.edgeColor ?? [0, 0, 0], o);
            const i = cover(x, y, inner);
            if (i) blend(x, y, fill, i);
          } else blend(x, y, fill, o);
        }
      if (b.label) {
        const lw = Math.round(b.w * 0.4);
        const lx = b.labelAt === 'start' ? b.x + e + 8 : b.x + Math.round((b.w - lw) / 2);
        const ly = b.y + Math.round(b.h / 2) - 4;
        for (let k = 0; k < lw; k += 4)
          for (let y = ly; y < ly + 8; y++) for (let x = lx + k; x < lx + k + 2; x++) blend(x, y, [20, 20, 20], 1);
      }
    },
    png: () => ({width: w, height: h, rgba}),
  };
}

/** A page of controls drawn alike: 28px tall, 4px corners, a 1px edge. */
function controlsPage() {
  const c = canvas(400, 260);
  for (let k = 0; k < 4; k++)
    c.box({x: 20 + k * 90, y: 20, w: 80, h: 28, r: 4, edge: 1, edgeColor: [0, 80, 180], fill: [40, 150, 230], fillEnd: [10, 100, 205], label: true});
  for (let k = 0; k < 2; k++)
    c.box({x: 20 + k * 180, y: 70, w: 170, h: 28, r: 4, edge: 1, edgeColor: [190, 190, 190], fill: [255, 255, 255], label: true, labelAt: 'start'});
  c.box({x: 20, y: 120, w: 300, h: 120, r: 8, edge: 1, edgeColor: [200, 200, 200], fill: [250, 250, 250]});
  return c.png();
}

describe('measuring boxes', () => {
  it('reads height, corners and edge width as drawn', () => {
    const {boxes} = measureBoxes(controlsPage());
    const buttons = boxes.filter(b => b.h === 28 && b.w === 80);
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(Math.abs(b.radius - 4)).toBeLessThanOrEqual(0.5);
      expect(b.edge).toBe(1);
      expect(b.gradient?.direction).toBe('vertical');
    }
    const panel = boxes.find(b => b.h === 120);
    expect(panel && Math.abs(panel.radius - 8)).toBeLessThanOrEqual(0.5);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(readTraits(controlsPage()))).toBe(
      JSON.stringify(readTraits(controlsPage())),
    );
  });

  it('reads a square box as square and a flat fill as flat', () => {
    const c = canvas(200, 80);
    for (let k = 0; k < 3; k++)
      c.box({x: 10 + k * 60, y: 20, w: 50, h: 24, fill: [30, 30, 30], label: true});
    const {boxes} = measureBoxes(c.png());
    expect(boxes.length).toBe(3);
    for (const b of boxes) {
      expect(b.radius).toBe(0);
      expect(b.edge).toBe(0);
      expect(b.gradient).toBeNull();
    }
  });
});

describe('traits from a picture', () => {
  it('writes the traits enough boxes agree on, as theme-wide settings', () => {
    const {traits} = readTraits(controlsPage());
    const steps = traits.map(t => t.step);
    expect(steps).toContainEqual({verb: 'set', thing: '--size-element-md', value: '28px'});
    expect(steps).toContainEqual({verb: 'set', thing: '--radius-element', value: '4px'});
    expect(steps).toContainEqual({verb: 'set', thing: '--border-width', value: '1px'});
    for (const t of traits) expect(t.read).toMatch(/\d+ of \d+ .*boxes/);
  });

  it('names what too few boxes show instead of writing it', () => {
    const {traits, unsure} = readTraits(controlsPage());
    // One panel: its corners are named, never written.
    expect(traits.some(t => t.on === 'containers')).toBe(false);
    expect(unsure).toContainEqual(
      expect.objectContaining({trait: 'corners', on: 'containers', why: expect.stringMatching(/1 containers box .* read 8px: too few agree/)}),
    );
  });

  it('names gradients with a one-part option, never a write', () => {
    const {traits, unsure} = readTraits(controlsPage());
    expect(traits.some(t => /gradient/.test(JSON.stringify(t.step)))).toBe(false);
    const g = unsure.find(u => u.trait === 'gradient');
    expect(g?.why).toMatch(/vertical gradient/);
    expect(g?.options?.[0]).toMatch(/linear-gradient\(to bottom, #/);
  });

  it('writes no control trait from a crop of badges alone, and says why', () => {
    // Small colored tags with centered labels: one kind of control only,
    // which a picture cannot tell from buttons.
    const c = canvas(420, 60);
    const colors = /** @type {RGB[]} */ ([[70, 165, 70], [248, 148, 6], [196, 60, 53], [98, 207, 252], [120, 120, 120]]);
    colors.forEach((fill, k) => c.box({x: 10 + k * 80, y: 18, w: 64, h: 24, r: 6, fill, label: true}));
    const {traits, unsure} = readTraits(c.png());
    expect(traits.filter(t => t.on === 'button-like' || t.on === 'inputs')).toEqual([]);
    for (const thing of ['--size-element-md', '--radius-element', '--border-width', 'accent'])
      expect(traits.some(t => t.step.thing === thing)).toBe(false);
    const height = unsure.find(u => u.trait === 'height');
    expect(height?.why).toMatch(/read 24px, but only one kind of control shows, so this crop cannot tell controls from badges; send a full page/);
    expect(height?.options).toEqual(['set my --size-element-md 24px']);
  });

  it('never names a typeface', () => {
    const {unsure} = readTraits(controlsPage());
    expect(unsure.find(u => u.trait === 'font')?.why).toMatch(/not read from pictures/);
  });

  it('reads sizes in CSS pixels for a 2x picture', () => {
    const c = canvas(800, 200);
    for (let k = 0; k < 4; k++)
      c.box({x: 20 + k * 180, y: 20, w: 160, h: 56, r: 8, edge: 2, edgeColor: [0, 0, 0], fill: [240, 240, 240], label: true});
    for (let k = 0; k < 2; k++)
      c.box({x: 20 + k * 380, y: 110, w: 360, h: 56, r: 8, edge: 2, edgeColor: [0, 0, 0], fill: [255, 255, 255], label: true, labelAt: 'start'});
    const {traits} = readTraits(c.png(), 2);
    expect(traits.map(t => t.step)).toContainEqual({verb: 'set', thing: '--size-element-md', value: '28px'});
    expect(traits.map(t => t.step)).toContainEqual({verb: 'set', thing: '--radius-element', value: '4px'});
  });

  it("takes the pixel density from the PNG's pHYs chunk", () => {
    const png = encodePng({width: 1, height: 1, rgba: new Uint8Array([0, 0, 0, 255])});
    const phys = Buffer.alloc(21);
    phys.writeUInt32BE(9, 0);
    phys.write('pHYs', 4, 'latin1');
    phys.writeUInt32BE(5669, 8);
    phys.writeUInt32BE(5669, 12);
    phys[16] = 1;
    const retina = Buffer.concat([png.subarray(0, 33), phys, png.subarray(33)]);
    expect(pixelScale(retina)).toBe(2);
    expect(pixelScale(png)).toBe(1);
  });
});

describe('how <picture>', () => {
  /** @type {string} */
  let cwd;
  beforeAll(async () => {
    cwd = makeLinkedFixture('astryx-theme-picture-traits-', FIXTURE_PACKAGES);
    writeFixtureBaseTheme(cwd, 'neutral');
    await themeEditNew('pt', {cwd, like: 'neutral'});
    fs.writeFileSync(path.join(cwd, 'look.png'), encodePng(controlsPage()));
  }, 120_000);
  afterAll(() => removeLinkedFixture(cwd));

  it('answers with checked commands for the measured traits', async () => {
    const d = /** @type {any} */ ((await themeEditHow('look.png', {cwd, theme: 'pt'})).data);
    expect(d.kind).toBe('picture');
    expect(d.colors.length).toBeGreaterThan(0);
    expect(d.look.source).toBe('picture');
    const commands = d.results.flatMap((/** @type {any} */ r) => r.commands);
    expect(commands.some((/** @type {string} */ c) => / set pt --size-element-md 28px$/.test(c))).toBe(true);
    expect(commands.some((/** @type {string} */ c) => / set pt --radius-element 4px$/.test(c))).toBe(true);
    for (const r of d.results) expect(r.text).toMatch(/read from \d+ of \d+/);
    expect(d.unsure.some((/** @type {any} */ u) => /gradient/.test(u.text))).toBe(true);
  });

  it('keeps a value the theme already sets, naming the reading', async () => {
    await themeEditSet('pt', '--radius-element', '10px', {cwd});
    const d = /** @type {any} */ ((await themeEditHow('look.png', {cwd, theme: 'pt'})).data);
    const commands = d.results.flatMap((/** @type {any} */ r) => r.commands);
    expect(commands.some((/** @type {string} */ c) => /--radius-element/.test(c))).toBe(false);
    expect(d.unsure.some((/** @type {any} */ u) => /reads 4px .* sets --radius-element 10px already, which stays/.test(u.text))).toBe(true);
  });

  it('reads points with --at as before, with no traits', async () => {
    const d = /** @type {any} */ ((await themeEditHow('look.png', {cwd, theme: 'pt', at: ['0,0']})).data);
    expect(d.points[0].color).toBe('#ffffff');
    expect(d.look).toBeUndefined();
  });
});
