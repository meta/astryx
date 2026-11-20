// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file animatedLayoutAdopters.interaction.browser.spec.ts
 * @input The built Storybook's `Core/Animated layout` story: a TreeList and a
 *   Collapsible that take the handle `useAnimatedLayout` returns for a
 *   ScrollableArea's ref
 * @output The adopters' browser proofs `spec:AST-105` Verification asks for:
 *   with a handle, through a ScrollableArea ref, opening glides the content
 *   after the component while the revealed content enters, and closing
 *   glides it while the closing content exits, inert, until it hides; and a
 *   Collapsible's block-end edge reveal (FR9), its edge on the content after
 *   it on every frame, through a close while it opens
 * @position Testing; `component:Collapsible` FR10 and `component:TreeList`
 *   FR9. The module's own proofs are animatedLayout.interaction.browser.spec.ts
 *
 * SYNC: When modified, update the Verification rows in Collapsible.spec.md
 *   and TreeList.spec.md.
 */

import {expect, test, type Page} from '@astryxdesign/a11y-spec/playwright';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {requireFrames} from '@astryxdesign/interaction-harness';

let storybook: StaticServer | undefined;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const STORY = 'core-animated-layout--animated-layout';

/** Loads the story and waits for its first render and two frames. */
async function openStory(page: Page): Promise<void> {
  await page.goto(
    `${storybook?.origin ?? ''}/iframe.html?id=${STORY}&viewMode=story`,
  );
  await page
    .locator('#storybook-root > *')
    .first()
    .waitFor({state: 'attached'});
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

/** The translate an element's running animation starts from, in px (y). */
async function glideOf(page: Page, selector: string): Promise<number | null> {
  return page.evaluate(sel => {
    const element = document.querySelector(sel);
    for (const animation of element?.getAnimations() ?? []) {
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const first = frames[0]?.translate;
      if (typeof first === 'string') {
        const match = /^(-?[\d.e+-]+)px(?:\s+(-?[\d.e+-]+)px)?/.exec(first);
        return match == null ? 0 : Number(match[2] ?? 0);
      }
    }
    return null;
  }, selector);
}

/** Marks the first element whose own text starts with `text`. */
async function mark(page: Page, text: string, id: string): Promise<void> {
  await page.evaluate(
    ({t, i}) => {
      const element = [...document.querySelectorAll('div')].find(el =>
        el.firstChild?.textContent?.trim().startsWith(t),
      );
      element?.setAttribute('data-test-id', i);
    },
    {t: text, i: id},
  );
}

interface EdgeRideFrame {
  phase: string;
  /** When the page read it, epoch ms. */
  t: number;
  /** From the revealed content's shown bottom edge to the content after it. */
  gap: number;
  /** How much of the revealed content shows. */
  shown: number;
}

interface EdgeRide {
  frames: EdgeRideFrame[];
  /** The gap the layout leaves between the open content and what follows. */
  restGap: number;
  height: number;
  /**
   * How much farther than the content's own height the content after it
   * travels: a gap the open content adds in its own container, which no clip
   * on the content can show.
   */
  beyond: number;
  /** How much shows as the close starts: its conceal's first keyframe. */
  concealStart: number;
}

/**
 * Opens `content` with `trigger`, closes it again 120 ms into the reveal (as
 * the page shows it then: every animation paused there, however far apart the
 * browser draws its frames), and reads on every frame where the content's
 * shown bottom edge stands against the content after it. Both sides are read
 * on the module's own clock: the clip from its animation's keyframes and the
 * content after it from its glide's keyframes, at their current time (WebKit
 * evaluates a main-thread clip and a compositor translate a little apart). It
 * also reads where the close starts: its conceal's first keyframe.
 */
async function edgeRide(
  page: Page,
  selectors: {trigger: string; content: string; after: string},
): Promise<EdgeRide> {
  return page.evaluate(async ({trigger, content: contentSelector, after}) => {
    const button = document.querySelector(trigger) as HTMLElement;
    const content = () => document.querySelector<HTMLElement>(contentSelector);
    const next = document.querySelector(after) as HTMLElement;
    const at = (animation: Animation) => {
      const effect = animation.effect as KeyframeEffect;
      return Math.min(
        1,
        Math.max(
          0,
          Number(animation.currentTime) / Number(effect.getTiming().duration),
        ),
      );
    };
    const bracket = (frames: ComputedKeyframe[], offset: number) => {
      let i = 0;
      while (i < frames.length - 2 && frames[i + 1].computedOffset < offset) {
        i += 1;
      }
      const o0 = frames[i].computedOffset;
      const o1 = frames[i + 1].computedOffset;
      return {i, f: o1 > o0 ? (offset - o0) / (o1 - o0) : 1};
    };
    const bottomOf = (value: unknown, box: DOMRect) => {
      const match = /^inset\(([^)]*)\)$/.exec(
        typeof value === 'string' ? value : '',
      );
      if (match == null) {
        return 0;
      }
      const [t, , b = t] = match[1].trim().split(/\s+/);
      return b.endsWith('%')
        ? (parseFloat(b) / 100) * box.height
        : parseFloat(b);
    };
    // A block edge's reveal slides the element's parts under a still clip:
    // the first part's slide, on its own clock, says how much is hidden.
    const slideOf = (element: HTMLElement) =>
      element.firstElementChild
        ?.getAnimations()
        .filter(a =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .some(k => k.translate != null),
        )
        .at(-1) ?? null;
    const slidHidden = (slide: Animation) => {
      const frames = (slide.effect as KeyframeEffect).getKeyframes();
      const {i, f} = bracket(frames, at(slide));
      const y0 = y(frames[i].translate);
      const y1 = y(frames[i + 1].translate);
      return Math.max(0, -(y0 + (y1 - y0) * f));
    };
    const insetBottom = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const animation = element
        .getAnimations()
        .filter(a =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .some(k => k.clipPath != null),
        )
        .at(-1);
      if (animation == null) {
        const slide = slideOf(element);
        return slide == null
          ? bottomOf(getComputedStyle(element).clipPath, box)
          : slidHidden(slide);
      }
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const {i, f} = bracket(frames, at(animation));
      const b0 = bottomOf(frames[i].clipPath, box);
      const b1 = bottomOf(frames[i + 1].clipPath, box);
      return b0 + (b1 - b0) * f;
    };
    const y = (value: unknown) =>
      [...String(value).matchAll(/(-?[\d.e+-]+)px/g)].map(m =>
        Number(m[1]),
      )[1] ?? 0;
    // An element's glide offset from its keyframes at its current time.
    const glideY = (element: HTMLElement) => {
      const animation = element
        .getAnimations()
        .filter(a =>
          (a.effect as KeyframeEffect)
            .getKeyframes()
            .some(k => k.translate != null),
        )
        .at(-1);
      if (animation == null) {
        return 0;
      }
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      const {i, f} = bracket(frames, at(animation));
      const y0 = y(frames[i].translate);
      const y1 = y(frames[i + 1].translate);
      return y0 + (y1 - y0) * f;
    };
    // A box's top on the module's clock: where layout puts it (offsets ignore
    // transforms), plus each glide that carries it. No evaluated transform is
    // read, because WebKit evaluates a running translate a little ahead.
    // Offsets are whole pixels, as this story lays out.
    const clockTop = (element: HTMLElement) => {
      let top = 0;
      let node: HTMLElement | null = element;
      while (node != null) {
        top += node.offsetTop + (node === element ? 0 : node.clientTop);
        node = node.offsetParent as HTMLElement | null;
      }
      for (let n: HTMLElement | null = element; n != null;) {
        top += glideY(n);
        n = n.parentElement;
      }
      return top;
    };
    const frames: EdgeRideFrame[] = [];
    const read = (phase: string) => {
      const element = content();
      if (element == null) {
        // Gone: the frame still counts in the gaps between frames.
        frames.push({
          phase,
          t: performance.timeOrigin + performance.now(),
          gap: Number.NaN,
          shown: 0,
        });
        return;
      }
      const height = element.offsetHeight;
      const hidden = insetBottom(element);
      frames.push({
        phase,
        t: performance.timeOrigin + performance.now(),
        gap: clockTop(next) - (clockTop(element) + height - hidden),
        shown:
          getComputedStyle(element).display === 'none' ? 0 : height - hidden,
      });
    };
    const frame = async () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => resolve());
      });
    const settle = async () => {
      for (let i = 0; i < 90; i++) {
        await frame();
      }
    };
    const closedTop = next.getBoundingClientRect().top;
    button.click();
    await settle();
    const box = (content() as HTMLElement).getBoundingClientRect();
    const openTop = next.getBoundingClientRect().top;
    const restGap = openTop - box.bottom;
    const height = box.height;
    const beyond = Math.max(0, openTop - closedTop - height);
    button.click();
    await settle();
    const clipOf = () => {
      const element = content();
      if (element == null) {
        return null;
      }
      return (
        element
          .getAnimations()
          .filter(a =>
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .some(k => k.clipPath != null),
          )
          .at(-1) ?? slideOf(element)
      );
    };
    // Until a click's change commits. A component commits in the click's
    // microtasks, before any frame, or in a later task.
    const committed = async (isDone: () => boolean) => {
      for (let i = 0; i < 10 && !isDone(); i++) {
        await new Promise<void>(resolve => {
          queueMicrotask(resolve);
        });
      }
      for (let i = 0; i < 50 && !isDone(); i++) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
      }
    };
    // Pauses `animations` `ms` into their motion: the page as it shows then,
    // however far apart the browser draws its frames.
    const seek = (animations: Animation[], ms: number) => {
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = ms;
      }
    };
    // Open, then close again 120 ms into the reveal, as the page shows it
    // then. The reveal is read at fixed times on its own clock as it commits,
    // so a late frame cannot end it before these reads.
    button.click();
    await committed(() => clipOf() != null);
    for (const ms of [20, 40, 60, 80, 100]) {
      seek(document.getAnimations(), ms);
      read('opening held');
    }
    // Then the reveal plays on from there for two real frames. At its start
    // a reveal shows nothing yet, so those frames would show no ride.
    for (const animation of document.getAnimations()) {
      animation.play();
    }
    for (let i = 0; i < 2; i++) {
      await frame();
      read(clipOf() == null ? 'opening ended' : 'opening');
    }
    seek(document.getAnimations(), 120);
    read('reversed');
    const opening = clipOf();
    const before = new Set(document.getAnimations());
    button.click();
    // Until the close commits, with every animation still paused where the
    // close found it.
    await committed(() => clipOf() !== opening);
    const conceal = clipOf();
    const [start] =
      (conceal?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
    const startBox = (content() as HTMLElement).getBoundingClientRect();
    const concealStart =
      start == null
        ? Number.NaN
        : startBox.height -
          (start.clipPath == null
            ? Math.max(0, -y(start.translate))
            : bottomOf(start.clipPath, startBox));
    // The conceal held at fixed times too, then played from its start on
    // real frames.
    const concealing = document.getAnimations().filter(a => !before.has(a));
    for (const ms of [20, 40, 60, 80, 100]) {
      seek(concealing, ms);
      read('closing held');
    }
    seek(concealing, 0);
    for (const animation of document.getAnimations()) {
      if (animation.playState === 'paused') {
        animation.play();
      }
    }
    for (let i = 0; i < 60; i++) {
      await frame();
      read('closing');
    }
    return {frames, restGap, height, beyond, concealStart};
  }, selectors);
}

/**
 * Wherever the content after it shows, the revealed content reaches it: no gap
 * opens past the one at rest, and none closes past what the content's own
 * container gap accounts for. The close starts from what shows.
 */
function expectEdgeRide(result: EdgeRide): void {
  const shown = result.frames.filter(f => f.shown > 0.5);
  expect(result.beyond).toBeLessThan(8);
  for (const f of shown) {
    const detail = JSON.stringify({
      ...f,
      restGap: result.restGap,
      beyond: result.beyond,
    });
    expect(f.gap, detail).toBeLessThan(result.restGap + 1.5);
    expect(f.gap, detail).toBeGreaterThan(result.restGap - result.beyond - 1.5);
  }
  // The held reads judge the curves. These prove the page drew the motion.
  // Each phase is judged on its own reads, so a gap in the other phase cannot
  // name it starved. Its two drawn reveal frames come while the reveal still
  // rides, so the reversal still finds it.
  requireFrames(
    result.frames.filter(f => f.phase.startsWith('opening')),
    {
      min: 2,
      during: 'the reveal plays',
      where: f => f.phase === 'opening',
    },
  );
  // With those two, the conceal's 6 make the 8 drawn reads this proof always
  // required: its 9 shown reads included the held reversal.
  requireFrames(
    result.frames.filter(f => f.phase.startsWith('closing')),
    {
      min: 6,
      during: 'the conceal plays',
      where: f => f.phase === 'closing' && f.shown > 0.5,
    },
  );
  const reversed = result.frames.find(f => f.phase === 'reversed');
  expect(reversed?.shown).toBeGreaterThan(2);
  expect(reversed?.shown).toBeLessThan(result.height - 2);
  // Read at its first keyframe, not on a later frame, where a quick curve
  // has already moved on. The clip may also show the container gap that the
  // content after it travels.
  const start = result.concealStart - (reversed?.shown ?? 0);
  expect(start).toBeGreaterThan(-1);
  expect(start).toBeLessThan(result.beyond + 1);
}

async function viewportScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const viewport = [...document.querySelectorAll<HTMLElement>('*')].find(
      el => el.scrollHeight > el.clientHeight + 1 && el.clientHeight > 300,
    );
    return viewport?.scrollTop ?? -1;
  });
}

test.describe('component:Collapsible FR10 and component:TreeList FR9 (spec:AST-105)', () => {
  test('a Collapsible in a ScrollableArea glides the content after it as it opens and closes, and the closing content exits inert until it hides', async ({
    page,
  }) => {
    await openStory(page);
    await mark(page, 'A plain app div', 'after');
    const scrollBefore = await viewportScroll(page);
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = await trigger.getAttribute('aria-controls');
    const content = `[id="${contentId}"]`;

    await trigger.click();
    // The content after it glides down from where it was; the content enters.
    expect(await glideOf(page, '[data-test-id="after"]')).toBeLessThan(-20);
    expect(
      await page.evaluate(
        sel => document.querySelector(sel)?.getAnimations().length ?? 0,
        content,
      ),
    ).toBeGreaterThan(0);
    await page.waitForTimeout(1200);

    await trigger.click();
    const closing = await page.evaluate(sel => {
      const element = document.querySelector(sel) as HTMLElement;
      return {
        shown: getComputedStyle(element).display !== 'none',
        inert: element.hasAttribute('inert'),
        exits: element.getAnimations().length,
      };
    }, content);
    expect(closing).toEqual({shown: true, inert: true, exits: 1});
    expect(await glideOf(page, '[data-test-id="after"]')).toBeGreaterThan(20);
    // Once its exit ends it hides, and nothing jumps the area's scroll.
    await expect
      .poll(async () =>
        page.evaluate(
          sel =>
            getComputedStyle(document.querySelector(sel) as HTMLElement)
              .display,
          content,
        ),
      )
      .toBe('none');
    expect(await viewportScroll(page)).toBe(scrollBefore);
  });

  test("a Collapsible's revealed content keeps its block-end edge on the content after it on every frame, and a close while it opens conceals from what it shows (FR9)", async ({
    page,
  }) => {
    await openStory(page);
    await mark(page, 'A plain app div', 'after');
    const trigger = page.getByRole('button', {name: 'Shipping details'});
    const contentId = await trigger.getAttribute('aria-controls');
    expectEdgeRide(
      await edgeRide(page, {
        trigger: `button[aria-controls="${contentId ?? ''}"]`,
        content: `[id="${contentId ?? ''}"]`,
        after: '[data-test-id="after"]',
      }),
    );
  });

  test("a TreeList row's revealed group keeps its block-end edge on the rows after it on every frame, and a collapse while it expands conceals from what it shows (FR9)", async ({
    page,
  }) => {
    await openStory(page);
    expectEdgeRide(
      await edgeRide(page, {
        trigger: '[data-tree-id="docs"] [data-tree-toggle]',
        content: '[data-tree-id="docs"] > [role="group"]',
        after: '[data-tree-id="notes"]',
      }),
    );
  });

  test('in a single-open CollapsibleGroup, the item that opens while a taller one above it closes keeps its block-end edge on the next item on every frame (FR9)', async ({
    page,
  }) => {
    await openStory(page);
    const result = await page.evaluate(async () => {
      const trigger = (name: string) =>
        [...document.querySelectorAll('button')].find(
          button => button.textContent?.trim() === name,
        ) as HTMLButtonElement;
      const opening = trigger('Gift options');
      const content = () =>
        document.getElementById(opening.getAttribute('aria-controls') ?? '');
      // The next item: the root of the Collapsible after the one that opens.
      const nextItem = () => {
        let node: HTMLElement | null = trigger('Delivery windows');
        while (node != null && node.parentElement?.contains(opening) !== true) {
          node = node.parentElement;
        }
        return node as HTMLElement;
      };
      // The px the content's clip hides at its bottom, from its clip
      // animation's keyframes at its current time (the module's clock).
      const bottomOf = (value: unknown, height: number) => {
        const match = /^inset\(([^)]*)\)$/.exec(
          typeof value === 'string' ? value : '',
        );
        if (match == null) {
          return 0;
        }
        const [t, , b = t] = match[1].trim().split(/\s+/);
        return b.endsWith('%') ? (parseFloat(b) / 100) * height : parseFloat(b);
      };
      const hiddenBottom = (element: HTMLElement) => {
        const height = element.getBoundingClientRect().height;
        const animation = element
          .getAnimations()
          .filter(a =>
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .some(k => k.clipPath != null),
          )
          .at(-1);
        if (animation == null) {
          // A slide: the first part's translate on its own clock.
          const slide = element.firstElementChild
            ?.getAnimations()
            .filter(a =>
              (a.effect as KeyframeEffect)
                .getKeyframes()
                .some(k => k.translate != null),
            )
            .at(-1);
          return slide == null
            ? bottomOf(getComputedStyle(element).clipPath, height)
            : Math.max(0, -glideY(element.firstElementChild as HTMLElement));
        }
        const effect = animation.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        const at = Math.min(
          1,
          Math.max(
            0,
            Number(animation.currentTime) / Number(effect.getTiming().duration),
          ),
        );
        let i = 0;
        while (i < frames.length - 2 && frames[i + 1].computedOffset < at) {
          i += 1;
        }
        const o0 = frames[i].computedOffset;
        const o1 = frames[i + 1].computedOffset;
        const f = o1 > o0 ? (at - o0) / (o1 - o0) : 1;
        const b0 = bottomOf(frames[i].clipPath, height);
        const b1 = bottomOf(frames[i + 1].clipPath, height);
        return b0 + (b1 - b0) * f;
      };
      // A box's top on the module's clock, as the clip is read. It is where
      // layout puts it, since offsets ignore transforms, plus each glide that
      // carries it at its current time. No evaluated transform is read:
      // WebKit evaluates a running translate a little ahead. Offsets are whole
      // pixels, as this story lays out.
      const yOf = (value: unknown) =>
        [...String(value).matchAll(/(-?[\d.e+-]+)px/g)].map(m =>
          Number(m[1]),
        )[1] ?? 0;
      const glideY = (node: HTMLElement) => {
        const animation = node
          .getAnimations()
          .filter(a =>
            (a.effect as KeyframeEffect)
              .getKeyframes()
              .some(k => k.translate != null),
          )
          .at(-1);
        if (animation == null) {
          return 0;
        }
        const effect = animation.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        const at = Math.min(
          1,
          Math.max(
            0,
            Number(animation.currentTime) / Number(effect.getTiming().duration),
          ),
        );
        let i = 0;
        while (i < frames.length - 2 && frames[i + 1].computedOffset < at) {
          i += 1;
        }
        const o0 = frames[i].computedOffset;
        const o1 = frames[i + 1].computedOffset;
        const f = o1 > o0 ? (at - o0) / (o1 - o0) : 1;
        const y0 = yOf(frames[i].translate);
        const y1 = yOf(frames[i + 1].translate);
        return y0 + (y1 - y0) * f;
      };
      const clockTop = (element: HTMLElement) => {
        let top = 0;
        let node: HTMLElement | null = element;
        while (node != null) {
          top += node.offsetTop + (node === element ? 0 : node.clientTop);
          node = node.offsetParent as HTMLElement | null;
        }
        for (let n: HTMLElement | null = element; n != null;) {
          top += glideY(n);
          n = n.parentElement;
        }
        return top;
      };
      const frame = async () =>
        new Promise<void>(resolve => {
          requestAnimationFrame(() => resolve());
        });
      const settle = async () => {
        for (let i = 0; i < 90; i++) {
          await frame();
        }
      };
      // The taller item first, then the shorter one below it, which closes it.
      trigger('Return policy').click();
      await settle();
      opening.click();
      const frames: {gap: number; shown: number}[] = [];
      for (let i = 0; i < 60; i++) {
        await frame();
        const element = content();
        if (element == null || getComputedStyle(element).display === 'none') {
          continue;
        }
        const hidden = hiddenBottom(element);
        const bottom = clockTop(element) + element.offsetHeight;
        frames.push({
          gap: clockTop(nextItem()) - (bottom - hidden),
          shown: element.offsetHeight - hidden,
        });
      }
      await settle();
      const rest = content() as HTMLElement;
      return {
        frames,
        restGap: clockTop(nextItem()) - (clockTop(rest) + rest.offsetHeight),
        height: rest.offsetHeight,
      };
    });
    const shown = result.frames.filter(f => f.shown > 0.5);
    expect(shown.length).toBeGreaterThan(4);
    // The opening content never shows over the next item, nor short of it.
    for (const f of shown) {
      const detail = JSON.stringify({...f, restGap: result.restGap});
      expect(f.gap, detail).toBeGreaterThan(result.restGap - 1.5);
      expect(f.gap, detail).toBeLessThan(result.restGap + 1.5);
    }
  });

  test('a TreeList row glides the rows after it as it expands and collapses, and the collapsing group exits inert until it unmounts', async ({
    page,
  }) => {
    await openStory(page);
    const documents = page.getByRole('treeitem', {name: 'Documents'});
    const notes = '[data-tree-id="notes"]';
    await documents.locator('[data-tree-toggle]').click();
    // Notes.txt glides down while Documents' rows enter.
    expect(await glideOf(page, notes)).toBeLessThan(-20);
    expect(
      await page.evaluate(
        () =>
          document
            .querySelector('[data-tree-id="docs"] > [role="group"]')
            ?.getAnimations().length ?? 0,
      ),
    ).toBeGreaterThan(0);
    await page.waitForTimeout(1200);

    await documents.locator('[data-tree-toggle]').click();
    const closing = await page.evaluate(() => {
      const group = document.querySelector(
        '[data-tree-id="docs"] > [role="group"]',
      );
      return {kept: group != null, inert: group?.hasAttribute('inert')};
    });
    expect(closing).toEqual({kept: true, inert: true});
    expect(await glideOf(page, notes)).toBeGreaterThan(20);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document.querySelector('[data-tree-id="docs"] > [role="group"]') ==
            null,
        ),
      )
      .toBe(true);
  });

  test('collapsing a row with an expanded child moves the rows after it once, with no jump when the exit ends (spec:AST-105 FR3)', async ({
    page,
  }) => {
    await openStory(page);
    const photos = page.getByRole('treeitem', {name: 'Photos'});
    await photos.locator('[data-tree-toggle]').first().click();
    await page.waitForTimeout(1200);
    await page
      .getByRole('treeitem', {name: 'Trips'})
      .locator('[data-tree-toggle]')
      .first()
      .click();
    await page.waitForTimeout(1200);
    const documents = '[data-tree-id="docs"]';
    const openTop = await page.evaluate(
      sel => document.querySelector(sel)?.getBoundingClientRect().top ?? 0,
      documents,
    );
    await photos.locator('[data-tree-toggle]').first().click();
    // It glides from where it was: its offset is the whole distance it moves.
    const offset = await glideOf(page, documents);
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            document.querySelector(
              '[data-tree-id="photos"] > [role="group"]',
            ) == null,
        ),
      )
      .toBe(true);
    const closedTop = await page.evaluate(
      sel => document.querySelector(sel)?.getBoundingClientRect().top ?? 0,
      documents,
    );
    expect(offset).not.toBeNull();
    expect(Math.abs((offset ?? 0) - (openTop - closedTop))).toBeLessThan(2);
  });
});
