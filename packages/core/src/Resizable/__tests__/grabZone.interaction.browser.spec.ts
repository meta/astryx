// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file grabZone.interaction.browser.spec.ts
 * @input The "Core/Resizable / Grab Zone On Short Items" story in a real
 *   browser: a 30-minute and a 15-minute calendar event at 48px an hour, each
 *   moved by a drag on its body and resized by the ResizeHandle on its bottom
 *   edge, for each `pillPlacement` and both `position`s
 * @output Checks that the Grab zone stays on the Handle whatever
 *   `pillPlacement` says, and takes at most half of a short item, so the item
 *   keeps its own drag, and that a drag on the Grip pill resizes the item
 *   wherever the pill sits (component:Resizable FR1; the clamp follows
 *   `spec:AST-094` FR42's grown targets that stop at half the gap)
 * @position Browser proof for ResizeHandle.tsx's Grab zone
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {openStory, withStorybook} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

const STORY = 'core-resizable--grab-zone-on-short-items';

type PillPlacement = 'auto' | 'start' | 'center' | 'end';
type Position = 'inline' | 'overlay';

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Geometry {
  event: Box;
  handle: Box;
  zone: Box;
}

async function open(
  page: Page,
  pillPlacement: PillPlacement,
  position: Position,
): Promise<void> {
  await openStory(page, storybook(), STORY, {pillPlacement, position});
  await expect(page.getByTestId('thirty')).toBeVisible();
}

/** The event, its Handle (the separator) and its Grab zone, in page pixels. */
async function measure(page: Page, testId: string): Promise<Geometry> {
  return page.evaluate(id => {
    const event = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    const handle = event?.querySelector<HTMLElement>('[role="separator"]');
    // The Grab zone is the Handle's first child: the invisible element that
    // takes the pointer.
    const zone = handle?.firstElementChild;
    if (event == null || handle == null || zone == null) {
      throw new Error(`no event, Handle or Grab zone for ${id}`);
    }
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      };
    };
    return {event: box(event), handle: box(handle), zone: box(zone)};
  }, testId);
}

/** How much of the event the Grab zone covers, on the resize axis. */
function overlap(geometry: Geometry): number {
  const {event, zone} = geometry;
  return Math.max(
    0,
    Math.min(zone.bottom, event.bottom) - Math.max(zone.top, event.top),
  );
}

const PLACEMENTS: PillPlacement[] = ['auto', 'start', 'center', 'end'];

for (const pillPlacement of PLACEMENTS) {
  test(`the Grab zone stays on the Handle with pillPlacement="${pillPlacement}"`, async ({
    page,
  }) => {
    await open(page, pillPlacement, 'inline');
    for (const id of ['thirty', 'fifteen']) {
      const geometry = await measure(page, id);
      const handleCentre = (geometry.handle.top + geometry.handle.bottom) / 2;
      const zoneCentre = (geometry.zone.top + geometry.zone.bottom) / 2;
      expect(
        Math.abs(zoneCentre - handleCentre),
        `${id}: the Grab zone's centre against the Handle's`,
      ).toBeLessThanOrEqual(0.5);
    }
  });
}

for (const position of ['inline', 'overlay'] as const) {
  for (const pillPlacement of PLACEMENTS) {
    test(`a 30-minute and a 15-minute event keep at least half of themselves for their own drag (${position}, pillPlacement="${pillPlacement}")`, async ({
      page,
    }) => {
      await open(page, pillPlacement, position);
      for (const id of ['thirty', 'fifteen']) {
        const geometry = await measure(page, id);
        const height = geometry.event.bottom - geometry.event.top;
        expect(height, `${id}: the event's height`).toBeCloseTo(
          id === 'thirty' ? 24 : 12,
          0,
        );
        expect(
          overlap(geometry),
          `${id}: how much of the event the Grab zone covers`,
        ).toBeLessThanOrEqual(height / 2 + 0.5);
        // The event's own drag answers just above the Grab zone, over its
        // whole upper half, except on the Grip pill, which resizes it.
        const x = (geometry.event.left + geometry.event.right) / 2;
        const free = await page.evaluate(
          ({id: testId, x: atX, from, to}) => {
            const body = document.querySelector(
              `[data-testid="${testId}-body"]`,
            );
            const pill = document
              .querySelector(`[data-testid="${testId}"]`)
              ?.querySelector('.astryx-resize-handle-pill')
              ?.getBoundingClientRect();
            const onPill = (y: number) =>
              pill != null &&
              atX >= pill.left &&
              atX <= pill.right &&
              y >= pill.top &&
              y <= pill.bottom;
            const missed: number[] = [];
            for (let y = from; y < to; y += 1) {
              const hit = document.elementFromPoint(atX, y);
              if (
                !onPill(y) &&
                (body == null || hit == null || !body.contains(hit))
              ) {
                missed.push(y);
              }
            }
            return missed;
          },
          {
            id,
            x,
            from: Math.ceil(geometry.event.top),
            to: Math.floor(geometry.event.top + height / 2),
          },
        );
        expect(
          free,
          `${id}: points of the event's upper half, off its Grip pill, not on its body`,
        ).toEqual([]);
      }
    });
  }
}

for (const position of ['inline', 'overlay'] as const) {
  for (const pillPlacement of PLACEMENTS) {
    test(`a drag on the Grip pill resizes the 30-minute event wherever the pill sits (${position}, pillPlacement="${pillPlacement}")`, async ({
      page,
    }) => {
      await open(page, pillPlacement, position);
      const event = page.getByTestId('thirty');
      const handle = page.getByRole('separator', {
        name: 'Resize the 30-minute event',
      });
      const pill = handle.locator('.astryx-resize-handle-pill');
      // The pill is present and painted before the drag.
      await expect(pill).toHaveCount(1);
      await expect(pill).toHaveCSS('opacity', '1');
      const box = await pill.boundingBox();
      if (box == null) {
        throw new Error('the Grip pill has no box');
      }
      expect(box.width * box.height, "the Grip pill's area").toBeGreaterThan(0);
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 12, {steps: 4});
      await page.mouse.up();
      await expect(handle).toHaveAttribute('aria-valuenow', '36');
      await expect(event).toHaveAttribute('data-top', '24');
    });
  }
}

test('a drag on a 30-minute event moves it, and a drag on its Handle resizes it', async ({
  page,
}) => {
  await open(page, 'auto', 'inline');
  const event = page.getByTestId('thirty');
  const handle = page.getByRole('separator', {
    name: 'Resize the 30-minute event',
  });
  const before = await measure(page, 'thirty');
  const x = (before.event.left + before.event.right) / 2;
  // A third of the way down the event: its body, which moves it.
  const y = before.event.top + (before.event.bottom - before.event.top) / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 24, {steps: 4});
  await page.mouse.up();
  await expect(event).toHaveAttribute('data-top', '48');
  await expect(handle).toHaveAttribute('aria-valuenow', '24');

  // On the Handle's line: the Grab zone, which resizes it.
  const moved = await measure(page, 'thirty');
  const lineY = (moved.handle.top + moved.handle.bottom) / 2;
  await page.mouse.move(x, lineY);
  await page.mouse.down();
  await page.mouse.move(x, lineY + 12, {steps: 4});
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', '36');
  await expect(event).toHaveAttribute('data-top', '48');
});

const HOVER_PILL_STORY = 'core-resizable--hover-pill-on-overlay-handle';

for (const [dir, pillPlacement] of [
  ['ltr', 'start'],
  ['rtl', 'end'],
] as const) {
  test(`a pill shown on hover beside an overlay Handle stays reachable from the Grab zone (${dir}, pillPlacement="${pillPlacement}")`, async ({
    page,
  }) => {
    await openStory(page, storybook(), HOVER_PILL_STORY, {dir, pillPlacement});
    const handle = page.getByRole('separator', {name: 'Resize sidebar'});
    await expect(handle).toBeVisible();
    const pill = handle.locator('.astryx-resize-handle-pill');
    const zoneBox = await handle.locator(':scope > *').first().boundingBox();
    if (zoneBox == null) {
      throw new Error('the Grab zone has no box');
    }
    // Hovering the zone shows the pill.
    await page.mouse.move(
      zoneBox.x + zoneBox.width / 2,
      zoneBox.y + zoneBox.height / 2,
    );
    await expect(pill).toHaveCSS('opacity', '1');
    const pillBox = await pill.boundingBox();
    if (pillBox == null) {
      throw new Error('the Grip pill has no box');
    }
    // The pill sits outside the zone, so the pointer crosses a gap to it.
    expect(
      pillBox.x >= zoneBox.x + zoneBox.width ||
        pillBox.x + pillBox.width <= zoneBox.x,
      'the pill sits outside the Grab zone',
    ).toBe(true);
    const x = pillBox.x + pillBox.width / 2;
    const y = pillBox.y + pillBox.height / 2;
    // Rest in the gap between the zone and the pill, longer than any hover
    // grace, before reaching the pill.
    const gapX =
      pillBox.x >= zoneBox.x + zoneBox.width
        ? (zoneBox.x + zoneBox.width + pillBox.x) / 2
        : (pillBox.x + pillBox.width + zoneBox.x) / 2;
    await page.mouse.move(gapX, y);
    await page.waitForTimeout(300);
    await expect(pill).toHaveCSS('opacity', '1');
    await page.mouse.move(x, y);
    await expect(pill).toHaveCSS('opacity', '1');
    // The pill's hit area reaches only toward the zone. Just past its far
    // side, the pointer finds the pane, so a short item keeps its own drag.
    const farX =
      pillBox.x >= zoneBox.x + zoneBox.width
        ? pillBox.x + pillBox.width + 3
        : pillBox.x - 3;
    const isPillPastItsFarSide = await pill.evaluate(
      (element, [px, py]) => {
        const hit = document.elementFromPoint(px, py);
        return hit != null && (hit === element || element.contains(hit));
      },
      [farX, y],
    );
    expect(
      isPillPastItsFarSide,
      'the pill takes no pointer past its far side',
    ).toBe(false);
    const before = await handle.getAttribute('aria-valuenow');
    await page.mouse.down();
    await page.mouse.move(x + (dir === 'ltr' ? 40 : -40), y, {steps: 4});
    await page.mouse.up();
    await expect(handle).not.toHaveAttribute('aria-valuenow', before ?? '');
  });
}
