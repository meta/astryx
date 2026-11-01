// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^internal/a11y-spec/src/harness

/**
 * @file chromium.chromium.spec.ts
 * @input Uses @playwright/test and the public Chromium harness seam
 * @output Focused accessibility-tree mapping, clipping-aware rendered-visibility, and pointer hover/away tests
 * @position Harness regression coverage; proves browser AX properties are exposed without DOM substitution.
 */

import {expect, test} from '@playwright/test';
import {createChromiumHarness, holdMotionStill} from './chromium';

test('computed node exposes selected state for tabs', async ({page}) => {
  await page.setContent(`
    <div role="tablist" aria-label="Views">
      <button role="tab" aria-selected="true">Overview</button>
      <button role="tab" aria-selected="false">Activity</button>
    </div>
  `);
  const cdp = await page.context().newCDPSession(page);

  const selected = await createChromiumHarness({
    page,
    subject: page.getByRole('tab', {name: 'Overview'}),
    cdp,
  })
    .subject()
    .then(subject => subject.computed());
  const unselected = await createChromiumHarness({
    page,
    subject: page.getByRole('tab', {name: 'Activity'}),
    cdp,
  })
    .subject()
    .then(subject => subject.computed());

  expect(selected.selected).toBe(true);
  expect(unselected.selected).toBe(false);
});

test('contains compares semantic subjects rather than pointer targets', async ({
  page,
}) => {
  await page.setContent(`
    <div id="pointer-wrapper">
      <div id="semantic-subject"></div>
      <div id="semantic-candidate"></div>
    </div>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#semantic-subject'),
    pointerTarget: page.locator('#pointer-wrapper'),
    cdp,
    related: {candidate: page.locator('#semantic-candidate')},
  });

  expect(
    await harness.contains(
      await harness.subject(),
      await harness.related('candidate'),
    ),
  ).toBe(false);
});

test('semantic containment follows aria-owns and excludes hidden descendants', async ({
  page,
}) => {
  await page.setContent(`
    <div id="tablist" role="tablist" aria-owns="owned-tab">
      <button id="hidden-tab" role="tab" aria-hidden="true">Hidden</button>
    </div>
    <button id="owned-tab" role="tab">Owned</button>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#tablist'),
    cdp,
    related: {
      owned: page.locator('#owned-tab'),
      hidden: page.locator('#hidden-tab'),
    },
  });

  expect(
    await harness.containsSemantically(
      await harness.subject(),
      await harness.related('owned'),
    ),
  ).toBe(true);
  expect(
    await harness.containsSemantically(
      await harness.subject(),
      await harness.related('hidden'),
    ),
  ).toBe(false);
});

test('references compares resolved node identity when ids are duplicated', async ({
  page,
}) => {
  await page.setContent(`
    <button id="source" aria-controls="panel">Tab</button>
    <div id="panel">Wrong duplicate</div>
    <div id="panel" data-expected>Expected panel</div>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#source'),
    cdp,
    related: {target: page.locator('[data-expected]')},
  });

  expect(
    await harness.references(
      await harness.subject(),
      'aria-controls',
      await harness.related('target'),
    ),
  ).toBe(false);
});

test('holding motion still prevents intermediate transition frames', async ({
  page,
}) => {
  await page.setContent(`
    <div id="panel" style="opacity:1; transition:opacity 10s">Panel</div>
  `);
  await holdMotionStill(page);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#panel'),
    cdp,
  });

  await page.locator('#panel').evaluate(element => {
    element.style.opacity = '0';
  });

  expect(await (await harness.subject()).isVisible()).toBe(false);
});

test('subjects report rendered visibility', async ({page}) => {
  await page.setContent(`
    <div id="visible">Visible</div>
    <div id="hidden" style="display:none">Hidden</div>
    <div id="transparent" style="opacity:0">Transparent</div>
    <div id="clipped" style="clip-path:inset(100%)">Clipped</div>
    <div id="partially-clipped" style="clip-path:inset(25%)">Partially clipped</div>
    <div id="offscreen" style="position:absolute;left:-10000px">Offscreen</div>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#visible'),
    cdp,
    related: {
      hidden: page.locator('#hidden'),
      transparent: page.locator('#transparent'),
      clipped: page.locator('#clipped'),
      partiallyClipped: page.locator('#partially-clipped'),
      offscreen: page.locator('#offscreen'),
    },
  });

  expect(await (await harness.subject()).isVisible()).toBe(true);
  expect(await (await harness.related('hidden')).isVisible()).toBe(false);
  expect(await (await harness.related('transparent')).isVisible()).toBe(false);
  expect(await (await harness.related('clipped')).isVisible()).toBe(false);
  expect(await (await harness.related('partiallyClipped')).isVisible()).toBe(
    true,
  );
  expect(await (await harness.related('offscreen')).isVisible()).toBe(true);
});

test('hover rests the pointer on a subject and pointerAway moves it off every subject', async ({
  page,
}) => {
  await page.setContent(`
    <div style="padding:40px">
      <button id="trigger">Trigger</button>
      <span id="tip" style="display:inline-block;padding:8px">Tip</span>
    </div>
    <output id="log"></output>
    <script>
      for (const id of ['trigger', 'tip']) {
        const element = document.getElementById(id);
        element.addEventListener('mouseenter', () => { log.textContent += id + '+ '; });
        element.addEventListener('mouseleave', () => { log.textContent += id + '- '; });
      }
    </script>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#trigger'),
    cdp,
    related: {tip: page.locator('#tip')},
  });

  await harness.hover(await harness.subject());
  await harness.hover(await harness.related('tip'));
  await harness.pointerAway();

  await expect(page.locator('#log')).toHaveText('trigger+ trigger- tip+ tip-');
});

test('pointerAway skips a candidate point a related subject covers', async ({
  page,
}) => {
  await page.setContent(`
    <button id="trigger">Trigger</button>
    <div id="corner" style="position:fixed;right:0;bottom:0;width:80px;height:80px">Corner</div>
    <output id="log"></output>
    <script>
      const corner = document.getElementById('corner');
      corner.addEventListener('mouseenter', () => { log.textContent += 'corner+ '; });
      corner.addEventListener('mouseleave', () => { log.textContent += 'corner- '; });
    </script>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#trigger'),
    cdp,
    related: {corner: page.locator('#corner')},
  });

  await harness.hover(await harness.related('corner'));
  await harness.pointerAway();

  await expect(page.locator('#log')).toHaveText('corner+ corner-');
});

test('pointerAway skips a candidate point the subject pointer target covers', async ({
  page,
}) => {
  await page.setContent(`
    <label id="target" style="position:fixed;right:0;bottom:0;width:120px;height:60px">
      <input id="box" type="checkbox"> Remember me
    </label>
    <output id="log"></output>
    <script>
      const target = document.getElementById('target');
      target.addEventListener('mouseenter', () => { log.textContent += 'target+ '; });
      target.addEventListener('mouseleave', () => { log.textContent += 'target- '; });
    </script>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#box'),
    pointerTarget: page.locator('#target'),
    cdp,
  });

  await harness.hover(await harness.subject());
  await harness.pointerAway();

  await expect(page.locator('#log')).toHaveText('target+ target-');
});

test('pointerAway refuses when every candidate point is on a watched subject', async ({
  page,
}) => {
  await page.setContent(
    '<div id="cover" style="position:fixed;inset:0">Cover</div>',
  );
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#cover'),
    cdp,
  });

  await expect(harness.pointerAway()).rejects.toThrow(
    'nowhere to move the pointer away to',
  );
});
