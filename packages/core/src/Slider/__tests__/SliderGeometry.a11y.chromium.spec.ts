// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderGeometry.a11y.chromium.spec.ts
 * @input Built Slider stories in real Chromium, under LTR, RTL and mixed-direction regions, and vertical
 * @output Browser evidence that thumbs and fills sit where their values put them and never leave the control (padding on it included), that the value tooltip anchors to a box layout places at the value, and that a drag of a slider displaying no value lays out nothing per move
 * @position Slider geometry proof; jsdom computes neither container units nor translate, so placement is checked here
 */

import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

// Which direction the slider's own region reads in (Storybook's direction
// global sets it on the story's wrapper), and how the page around it is set.
// The mixed cases are where a flip keyed on any RTL ancestor, rather than on
// the element's own direction, puts thumbs outside the control.
const REGIONS = [
  {name: 'LTR page', page: 'ltr', region: 'ltr', rtl: false},
  {name: 'RTL page', page: 'rtl', region: 'rtl', rtl: true},
  {name: 'LTR region of an RTL page', page: 'rtl', region: 'ltr', rtl: false},
  {name: 'RTL region of an LTR page', page: 'ltr', region: 'rtl', rtl: true},
] as const;

const TOLERANCE = 1;

async function mount(
  page: Page,
  storyId: string,
  pageDir: string,
  regionDir: string,
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story&globals=direction:${regionDir}`,
  );
  await page.locator('.astryx-slider-control').first().waitFor();
  await page.evaluate(pageDirection => {
    document.documentElement.dir = pageDirection;
  }, pageDir);
  await page.evaluate(
    async () =>
      new Promise(resolve => requestAnimationFrame(() => resolve(null))),
  );
}

interface Geometry {
  control: {left: number; right: number};
  thumbs: {left: number; right: number; center: number}[];
  fill: {left: number; right: number} | null;
}

async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const control = document.querySelector<HTMLElement>(
      '.astryx-slider-control',
    );
    if (!control) {
      throw new Error('missing slider control');
    }
    const c = control.getBoundingClientRect();
    const thumbs = Array.from(
      control.querySelectorAll<HTMLElement>('[role="slider"]'),
    ).map(thumb => {
      const r = thumb.getBoundingClientRect();
      return {left: r.left, right: r.right, center: (r.left + r.right) / 2};
    });
    // The painted fill is the bar clipped by its mover and by the fill clip.
    const bar = Array.from(
      control.querySelectorAll<HTMLElement>('[style*="--_slider-fill-end"]'),
    ).at(-1);
    let fill: {left: number; right: number} | null = null;
    if (bar) {
      let left = -Infinity;
      let right = Infinity;
      for (
        let node: HTMLElement | null = bar;
        node && node !== control;
        node = node.parentElement
      ) {
        const r = node.getBoundingClientRect();
        left = Math.max(left, r.left);
        right = Math.min(right, r.right);
      }
      fill = right > left ? {left, right} : {left, right: left};
    }
    return {control: {left: c.left, right: c.right}, thumbs, fill};
  });
}

function expectInside(g: Geometry, label: string) {
  for (const thumb of g.thumbs) {
    expect(thumb.left, `${label}: thumb left edge`).toBeGreaterThanOrEqual(
      g.control.left - TOLERANCE,
    );
    expect(thumb.right, `${label}: thumb right edge`).toBeLessThanOrEqual(
      g.control.right + TOLERANCE,
    );
  }
}

for (const region of REGIONS) {
  test(`a single slider's thumb and fill follow its value: ${region.name}`, async ({
    page,
  }) => {
    await mount(page, 'core-slider--default', region.page, region.region);
    const thumb = page.getByRole('slider');
    const startEdge = (g: Geometry) =>
      region.rtl ? g.control.right : g.control.left;

    // The story starts at 50: the thumb is centred on the control.
    let g = await measure(page);
    expectInside(g, 'value 50');
    const mid = (g.control.left + g.control.right) / 2;
    expect(Math.abs(g.thumbs[0].center - mid)).toBeLessThanOrEqual(TOLERANCE);

    await thumb.focus();
    await page.keyboard.press('Home');
    g = await measure(page);
    expectInside(g, 'value 0');
    // At the minimum the thumb sits flush with the start edge, inside it.
    const atMin = region.rtl ? g.thumbs[0].right : g.thumbs[0].left;
    expect(Math.abs(atMin - startEdge(g))).toBeLessThanOrEqual(TOLERANCE);

    await page.keyboard.press('End');
    g = await measure(page);
    expectInside(g, 'value 100');
    const endEdge = region.rtl ? g.control.left : g.control.right;
    const atMax = region.rtl ? g.thumbs[0].left : g.thumbs[0].right;
    expect(Math.abs(atMax - endEdge)).toBeLessThanOrEqual(TOLERANCE);

    // The fill runs from the start edge to the thumb's center.
    const fill = g.fill;
    if (fill == null) {
      throw new Error('missing fill');
    }
    const fillStart = region.rtl ? fill.right : fill.left;
    const fillEnd = region.rtl ? fill.left : fill.right;
    expect(Math.abs(fillStart - startEdge(g))).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(fillEnd - g.thumbs[0].center)).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });

  test(`a range's thumbs and fill follow its values: ${region.name}`, async ({
    page,
  }) => {
    await mount(page, 'core-slider--range', region.page, region.region);
    const g = await measure(page);
    expectInside(g, 'range 20-80');
    expect(g.thumbs).toHaveLength(2);
    const [lower, upper] = g.thumbs;
    // The lower value sits nearer the region's start edge.
    if (region.rtl) {
      expect(lower.center).toBeGreaterThan(upper.center);
    } else {
      expect(lower.center).toBeLessThan(upper.center);
    }
    // The fill spans exactly between the two thumbs' centers.
    const fill = g.fill;
    if (fill == null) {
      throw new Error('missing fill');
    }
    const span = [lower.center, upper.center].sort((a, b) => a - b);
    expect(Math.abs(fill.left - span[0])).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(fill.right - span[1])).toBeLessThanOrEqual(TOLERANCE);
  });
}

// Moving the thumbs and the fill is a translate in container units, so a
// drag of a slider that displays no value lays out nothing per move; a
// value tooltip or text display still lays out as its text changes.
interface VerticalGeometry {
  control: {top: number; bottom: number};
  thumb: {top: number; bottom: number; center: number};
  fill: {top: number; bottom: number} | null;
}

async function measureVertical(page: Page): Promise<VerticalGeometry> {
  return page.evaluate(() => {
    const control = document.querySelector<HTMLElement>(
      '.astryx-slider-control',
    );
    const thumbEl = control?.querySelector<HTMLElement>('[role="slider"]');
    if (!control || !thumbEl) {
      throw new Error('missing slider control or thumb');
    }
    const c = control.getBoundingClientRect();
    const t = thumbEl.getBoundingClientRect();
    const bar = Array.from(
      control.querySelectorAll<HTMLElement>('[style*="--_slider-fill-end"]'),
    ).at(-1);
    let fill: {top: number; bottom: number} | null = null;
    if (bar) {
      let top = -Infinity;
      let bottom = Infinity;
      for (
        let node: HTMLElement | null = bar;
        node && node !== control;
        node = node.parentElement
      ) {
        const r = node.getBoundingClientRect();
        top = Math.max(top, r.top);
        bottom = Math.min(bottom, r.bottom);
      }
      fill = bottom > top ? {top, bottom} : {top: bottom, bottom};
    }
    return {
      control: {top: c.top, bottom: c.bottom},
      thumb: {top: t.top, bottom: t.bottom, center: (t.top + t.bottom) / 2},
      fill,
    };
  });
}

test("a vertical slider's thumb stays inside the control and its fill follows the value", async ({
  page,
}) => {
  await mount(page, 'core-slider--vertical-orientation', 'ltr', 'ltr');
  const thumb = page.getByRole('slider');
  await thumb.focus();

  // At the minimum the thumb sits flush with the bottom edge, inside it
  // (#5050: half of it used to hang below the control).
  await page.keyboard.press('Home');
  let g = await measureVertical(page);
  expect(Math.abs(g.thumb.bottom - g.control.bottom)).toBeLessThanOrEqual(
    TOLERANCE,
  );
  expect(g.thumb.top).toBeGreaterThanOrEqual(g.control.top - TOLERANCE);

  // At the maximum it sits flush with the top edge.
  await page.keyboard.press('End');
  g = await measureVertical(page);
  expect(Math.abs(g.thumb.top - g.control.top)).toBeLessThanOrEqual(TOLERANCE);
  expect(g.thumb.bottom).toBeLessThanOrEqual(g.control.bottom + TOLERANCE);

  // The fill runs from the bottom edge up to the thumb's center.
  const fill = g.fill;
  if (fill == null) {
    throw new Error('missing fill');
  }
  expect(Math.abs(fill.bottom - g.control.bottom)).toBeLessThanOrEqual(
    TOLERANCE,
  );
  expect(Math.abs(fill.top - g.thumb.center)).toBeLessThanOrEqual(TOLERANCE);
});

test('a drag lays out nothing per move when no value is displayed', async ({
  page,
}) => {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-slider--default&viewMode=story&args=valueDisplay:none`,
  );
  const thumb = page.getByRole('slider');
  await thumb.waitFor();
  const box = await thumb.boundingBox();
  if (box == null) {
    throw new Error('no thumb');
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const layouts = async () => {
    const {metrics} = await cdp.send('Performance.getMetrics');
    return metrics.find(metric => metric.name === 'LayoutCount')?.value ?? 0;
  };
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The press itself may restyle (pressed paint, focus); count the moves.
  await page.mouse.move(x + 2, y);
  await page.evaluate(
    async () =>
      new Promise(resolve => requestAnimationFrame(() => resolve(null))),
  );
  const before = await layouts();
  for (let i = 2; i <= 60; i++) {
    await page.mouse.move(x + i * 2, y);
    await page.evaluate(
      async () =>
        new Promise(resolve => requestAnimationFrame(() => resolve(null))),
    );
  }
  const after = await layouts();
  await page.mouse.up();
  expect(Number(await thumb.getAttribute('aria-valuenow'))).toBeGreaterThan(50);
  expect(after - before).toBe(0);
});

/**
 * The value tooltip's position anchor, measured as layout places it (offsets,
 * which no transform or `translate` moves): CSS anchor positioning reads the
 * anchor's box, and not every engine follows a `translate` on it (Firefox
 * anchors to the untranslated box), so the anchor itself must sit at the value.
 */
async function measureTooltipAnchor(page: Page) {
  return page.evaluate(() => {
    const control = document.querySelector<HTMLElement>(
      '.astryx-slider-control',
    );
    const thumb = control?.querySelector<HTMLElement>('[role="slider"]');
    if (control == null || thumb == null) {
      throw new Error('missing slider');
    }
    const t = thumb.getBoundingClientRect();
    const anchors = Array.from(control.querySelectorAll<HTMLElement>('*'))
      .filter(element => {
        const name = getComputedStyle(element).getPropertyValue('anchor-name');
        return name !== '' && name !== 'none';
      })
      .map(element => {
        let x = 0;
        let y = 0;
        for (
          let node: HTMLElement | null = element;
          node != null;
          node = node.offsetParent as HTMLElement | null
        ) {
          x += node.offsetLeft;
          y += node.offsetTop;
        }
        return {
          x: x - window.scrollX + element.offsetWidth / 2,
          y: y - window.scrollY + element.offsetHeight / 2,
        };
      });
    const tooltip = Array.from(
      document.querySelectorAll<HTMLElement>('[role="tooltip"]'),
    ).find(element => element.getBoundingClientRect().width > 0);
    const tip = tooltip?.getBoundingClientRect();
    return {
      thumb: {x: (t.left + t.right) / 2, y: (t.top + t.bottom) / 2},
      anchors,
      tooltip: tip == null ? null : {x: (tip.left + tip.right) / 2},
    };
  });
}

for (const region of REGIONS) {
  test(`the value tooltip anchors where layout places the value: ${region.name}`, async ({
    page,
  }) => {
    await mount(page, 'core-slider--default', region.page, region.region);
    const thumb = page.getByRole('slider');
    await thumb.focus();
    let m = await measureTooltipAnchor(page);
    // At 50, away from the viewport's edges, the open tooltip is centred on
    // the thumb.
    expect(m.tooltip, 'the value tooltip is open').not.toBeNull();
    expect(Math.abs((m.tooltip?.x ?? 0) - m.thumb.x)).toBeLessThanOrEqual(
      TOLERANCE,
    );
    for (const key of ['Home', 'End', 'ArrowLeft']) {
      await page.keyboard.press(key);
      await page.evaluate(
        async () =>
          new Promise(resolve => requestAnimationFrame(() => resolve(null))),
      );
      m = await measureTooltipAnchor(page);
      expect(m.anchors, `${key}: one anchor`).toHaveLength(1);
      expect(
        Math.abs(m.anchors[0].x - m.thumb.x),
        `${key}: the anchor's layout box is centred on the thumb`,
      ).toBeLessThanOrEqual(TOLERANCE);
      expect(Math.abs(m.anchors[0].y - m.thumb.y)).toBeLessThanOrEqual(
        TOLERANCE,
      );
    }
  });
}

test('the value tooltip of a vertical slider anchors where layout places the value', async ({
  page,
}) => {
  await mount(page, 'core-slider--vertical-orientation', 'ltr', 'ltr');
  const thumb = page.getByRole('slider');
  await thumb.focus();
  for (const key of ['Home', 'End']) {
    await page.keyboard.press(key);
    await page.evaluate(
      async () =>
        new Promise(resolve => requestAnimationFrame(() => resolve(null))),
    );
    const m = await measureTooltipAnchor(page);
    expect(m.anchors, `${key}: one anchor`).toHaveLength(1);
    expect(Math.abs(m.anchors[0].x - m.thumb.x)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(m.anchors[0].y - m.thumb.y)).toBeLessThanOrEqual(TOLERANCE);
  }
});

// The parts sit in the control's padding box (the track and the marks
// always did), so inline padding on the control, from a theme rule or
// `controlStyle`, moves nothing.
test('padding on the control keeps the thumb on the track, the fill and the marks', async ({
  page,
}) => {
  await mount(page, 'core-slider--with-marks', 'ltr', 'ltr');
  await page.addStyleTag({
    content: '.astryx-slider-control { padding-inline: 12px !important; }',
  });
  const thumb = page.getByRole('slider');
  await thumb.focus();
  await page.keyboard.press('End');
  await page.evaluate(
    async () =>
      new Promise(resolve => requestAnimationFrame(() => resolve(null))),
  );
  const g = await measure(page);
  expectInside(g, 'padded, at max');
  expect(Math.abs(g.thumbs[0].right - g.control.right)).toBeLessThanOrEqual(
    TOLERANCE,
  );
  expect(
    Math.abs((g.fill?.right ?? 0) - g.thumbs[0].center),
  ).toBeLessThanOrEqual(TOLERANCE);
  const lastMark = await page.evaluate(() => {
    const marks = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid="slider-mark"]'),
    );
    const r = marks.at(-1)?.getBoundingClientRect();
    return r == null ? null : (r.left + r.right) / 2;
  });
  expect(lastMark).not.toBeNull();
  expect(Math.abs((lastMark ?? 0) - g.thumbs[0].center)).toBeLessThanOrEqual(
    TOLERANCE,
  );
});

// Desktop keeps the pointer model: no touch targets, the control's own
// touch-action and user-select, and none of the touch presentation's inline
// styles (the gesture host sets those only under a finger, while it is down).
test('a desktop slider keeps its pointer styles: no touch targets, no inline touch styles', async ({
  page,
}) => {
  await mount(page, 'core-slider--default', 'ltr', 'ltr');
  // A fine primary pointer in this context (a context without touch can still
  // match coarse under some configurations).
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  const styles = await page.evaluate(() => {
    const control = document.querySelector<HTMLElement>(
      '.astryx-slider-control',
    );
    const thumb = control?.querySelector<HTMLElement>('[role="slider"]');
    if (control == null || thumb == null) {
      throw new Error('missing slider');
    }
    const computed = getComputedStyle(control);
    return {
      hits: control.querySelectorAll('[data-slider-hit]').length,
      touchAction: computed.touchAction,
      userSelect: computed.userSelect,
      inline: [control, thumb].map(element =>
        ['touch-action', 'user-select', '-webkit-user-select'].map(name =>
          element.style.getPropertyValue(name),
        ),
      ),
    };
  });
  expect(styles.hits).toBe(0);
  expect(styles.touchAction).toBe('none');
  expect(styles.userSelect).toBe('none');
  expect(styles.inline.flat().filter(Boolean)).toEqual([]);
});
