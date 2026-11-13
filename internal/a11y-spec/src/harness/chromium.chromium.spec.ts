// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^internal/a11y-spec/src/harness

/**
 * @file chromium.chromium.spec.ts
 * @input Uses @playwright/test and the public Chromium harness seam
 * @output Focused accessibility-tree mapping, clipping-aware rendered-visibility, pointer hover/away and pointer reach tests
 * @position Harness regression coverage; proves browser AX properties are exposed without DOM substitution.
 */

import {expect, test} from '../playwright';
import type {Page} from '../playwright';
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

/**
 * Keeps the page's main thread busy for `ms` from its next task, as on a
 * starved machine: no script, frame or event handler runs meanwhile.
 */
async function busyMainThread(page: Page, ms: number): Promise<void> {
  await page.evaluate(duration => {
    setTimeout(() => {
      const end = performance.now() + duration;
      while (performance.now() < end) {
        // Busy on purpose.
      }
    }, 0);
  }, ms);
}

// Longer than the 2 s that 120 frames take on an idle page.
const BUSY_MS = 3_000;

// At 40 ms of script in every frame, the page renders about 25 frames each
// second.
const BUSY_FRAME_MS = 40;

test('a click reaches a control while the page is busy for longer than 120 idle frames take', async ({
  page,
}) => {
  await page.setContent(
    '<button id="go" onclick="this.dataset.clicks = Number(this.dataset.clicks || 0) + 1">Go</button>',
  );
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();

  await busyMainThread(page, BUSY_MS);
  await harness.click(subject);

  await expect(page.locator('#go')).toHaveAttribute('data-clicks', '1');
});

test('hover reaches a subject while the page is busy for longer than 120 idle frames take', async ({
  page,
}) => {
  await page.setContent(
    '<button id="go" onmouseenter="this.dataset.entered = \'yes\'">Go</button>',
  );
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();

  await busyMainThread(page, BUSY_MS);
  await harness.hover(subject);

  await expect(page.locator('#go')).toHaveAttribute('data-entered', 'yes');
});

test('canReceivePointer is true for a control while the page is busy for longer than 120 idle frames take', async ({
  page,
}) => {
  await page.setContent('<button id="go">Go</button>');
  const cdp = await page.context().newCDPSession(page);
  const subject = await createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  }).subject();

  await busyMainThread(page, BUSY_MS);

  expect(await subject.canReceivePointer()).toBe(true);
});

test('a control under a covering element cannot receive a pointer, and a click on it says why', async ({
  page,
}) => {
  await page.setContent(`
    <button id="go">Go</button>
    <div id="shield" style="position:fixed;inset:0"></div>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();

  expect(await subject.canReceivePointer()).toBe(false);
  const error = await harness.click(subject).then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toMatch(
    /^a pointer could not reach this control within /,
  );
  // The failure names the element that takes the pointer.
  const cause = (error as Error).cause as Error | undefined;
  expect(`${(error as Error).message} ${cause?.message ?? ''}`).toContain(
    'shield',
  );
});

test('a control that never holds still cannot receive a pointer', async ({
  page,
}) => {
  await page.setContent(`
    <style>
      @keyframes drift {
        from { transform: translateX(0); }
        to { transform: translateX(80px); }
      }
      #go { animation: drift 0.5s linear infinite; }
    </style>
    <button id="go">Go</button>
  `);
  const cdp = await page.context().newCDPSession(page);
  const subject = await createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  }).subject();

  // The button moves from one frame to the next before the check starts.
  const moves = await page.locator('#go').evaluate(
    button =>
      new Promise<boolean>(resolve => {
        requestAnimationFrame(() => {
          const before = button.getBoundingClientRect().x;
          requestAnimationFrame(() => {
            resolve(button.getBoundingClientRect().x !== before);
          });
        });
      }),
  );
  expect(moves).toBe(true);

  expect(await subject.canReceivePointer()).toBe(false);
});

test('a click on the trigger of an open popover closes it', async ({page}) => {
  // The press decides from the state it starts in, as a menu trigger does.
  // Light dismiss closes the popover. The click opens it only when the press
  // started with it closed.
  await page.setContent(`
    <button id="trigger">Menu</button>
    <div id="menu" popover>Choices</div>
    <script>
      let openAtPress = false;
      trigger.addEventListener('pointerdown', () => {
        openAtPress = menu.matches(':popover-open');
      });
      trigger.addEventListener('click', () => {
        if (!openAtPress) menu.showPopover();
      });
    </script>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#trigger'),
    cdp,
  });
  const subject = await harness.subject();

  await harness.click(subject);
  await expect(page.locator('#menu')).toBeVisible();
  await harness.click(subject);
  await expect(page.locator('#menu')).toBeHidden();
});

/**
 * Spends `ms` of every frame in script from now on, as on a machine that stays
 * busy: the page keeps rendering, only more slowly.
 */
async function busyEveryFrame(page: Page, ms: number): Promise<void> {
  await page.evaluate(duration => {
    const burn = () => {
      const end = performance.now() + duration;
      while (performance.now() < end) {
        // Busy on purpose.
      }
      requestAnimationFrame(burn);
    };
    requestAnimationFrame(burn);
  }, ms);
}

test('a pointer reaches a control on a page that spends most of every frame in script', async ({
  page,
}) => {
  await page.setContent(
    '<button id="go" onclick="this.dataset.clicks = Number(this.dataset.clicks || 0) + 1">Go</button>',
  );
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();

  await busyEveryFrame(page, BUSY_FRAME_MS);

  expect(await subject.canReceivePointer()).toBe(true);
  await harness.click(subject);
  await expect(page.locator('#go')).toHaveAttribute('data-clicks', '1');
});

test('a hover onto a subject that hides as the pointer leaves the trigger returns', async ({
  page,
}) => {
  // The tip hides when the pointer leaves the trigger, so moving onto it hides
  // it. The hover still returns, and the page shows what happened.
  await page.setContent(`
    <div style="padding:40px">
      <button id="trigger">Trigger</button>
      <div id="tip" hidden style="margin-top:24px;padding:8px">Tip</div>
    </div>
    <script>
      trigger.addEventListener('mouseenter', () => { tip.hidden = false; });
      trigger.addEventListener('mouseleave', () => { tip.hidden = true; });
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
  await expect(page.locator('#tip')).toBeVisible();
  await harness.hover(await harness.related('tip'));
  await expect(page.locator('#tip')).toBeHidden();
});

test('a link that wraps onto two lines can receive a pointer', async ({
  page,
}) => {
  await page.setContent(`
    <p style="width:200px;margin:0;font:16px/24px monospace">
      aaaaaaaaaaaaa
      <a id="go" href="#" onclick="event.preventDefault(); this.dataset.clicks = Number(this.dataset.clicks || 0) + 1">bbbbbb cccccccc</a>
      dddd eeee
    </p>
  `);
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();
  // The link has two boxes, and the centre of its whole box is not the link.
  const layout = await page.locator('#go').evaluate(link => {
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      parts: link.getClientRects().length,
      centreIsLink: hit === link || link.contains(hit),
    };
  });
  expect(layout).toEqual({parts: 2, centreIsLink: false});

  expect(await subject.canReceivePointer()).toBe(true);
  await harness.click(subject);
  await expect(page.locator('#go')).toHaveAttribute('data-clicks', '1');
});

test('a control under a sticky header can receive a pointer', async ({
  page,
}) => {
  await page.setContent(`
    <style>
      body { margin: 0; }
      #bar { position: fixed; top: 0; left: 0; right: 0; height: 120px; background: #eee; }
    </style>
    <div id="bar">Header</div>
    <div style="height:1500px"></div>
    <button id="go" onclick="this.dataset.clicks = Number(this.dataset.clicks || 0) + 1">Go</button>
    <div style="height:1500px"></div>
  `);
  await page.evaluate(() => {
    const button = document.getElementById('go');
    if (button != null) {
      window.scrollTo(0, button.offsetTop - 40);
    }
  });
  const cdp = await page.context().newCDPSession(page);
  const harness = createChromiumHarness({
    page,
    subject: page.locator('#go'),
    cdp,
  });
  const subject = await harness.subject();
  // The header covers the button where it starts.
  const covered = await page.locator('#go').evaluate(button => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit?.id ?? null;
  });
  expect(covered).toBe('bar');

  expect(await subject.canReceivePointer()).toBe(true);
  await harness.click(subject);
  await expect(page.locator('#go')).toHaveAttribute('data-clicks', '1');
});
