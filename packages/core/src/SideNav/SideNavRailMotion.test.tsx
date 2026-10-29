// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AppShell} from '../AppShell';
import {SideNav} from './SideNav';
import {SideNavItem} from './SideNavItem';

/**
 * The rail's collapse motion (`component:SideNav` FR6, `component:AppShell`
 * FR17): layout snaps, the rail reveals or covers by a clip, and the content's
 * old and new wrap slide and fade on one clock. jsdom has no layout or Web
 * Animations, so the rail's width comes from whether its labels render and
 * every animation is recorded.
 */

const SHELL_WIDTH = 1024;
const EXPANDED = 260;
const COLLAPSED = 48;

interface Recorded {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: {finish: () => void; cancel: () => void; startTime: number | null};
}

let recorded: Recorded[] = [];
/** Where the rail's inline-start edge sits for a width (a centered rail moves). */
let railLeft = (_width: number) => 0;
/** Where a running glide shows the column, past its layout place. */
let columnShift = 0;
let media: Record<string, boolean> = {};

/** The real rail (not a copy): collapsed rows carry their label as a name. */
function realNav(): Element | undefined {
  return Array.from(document.querySelectorAll('nav')).find(
    nav => nav.closest('[inert]') == null,
  );
}

function railWidth(): number {
  return realNav()?.querySelector('button[aria-label="Projects"]') != null
    ? COLLAPSED
    : EXPANDED;
}

/** Moves the timeline past any motion, as time passing would. */
function settle() {
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {currentTime: 1000 + 5000},
  });
}

function rect(left: number, width: number): DOMRect {
  return DOMRect.fromRect({x: left, y: 0, width, height: 600});
}

beforeEach(() => {
  recorded = [];
  railLeft = () => 0;
  columnShift = 0;
  media = {};
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: media[query] ?? false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  Object.defineProperty(document, 'timeline', {
    configurable: true,
    value: {currentTime: 1000},
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const width = railWidth();
      if (this.closest('[inert]') != null) {
        return rect(0, 0);
      }
      if (this.classList.contains('astryx-app-shell')) {
        return rect(0, SHELL_WIDTH);
      }
      const nav = realNav();
      if (this === nav) {
        return rect(railLeft(width), width);
      }
      if (nav != null && this.contains(nav)) {
        return rect(0, width);
      }
      // The main element and the column around it, beside the rail.
      if (
        this.querySelector('[role="main"]') != null ||
        this.getAttribute('role') === 'main'
      ) {
        return rect(width + columnShift, SHELL_WIDTH - width);
      }
      return rect(0, 0);
    },
  );
  (HTMLElement.prototype as unknown as {animate: unknown}).animate = function (
    this: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    const listeners: (() => void)[] = [];
    const animation = {
      startTime: null as number | null,
      finished: {then: () => undefined},
      onfinish: null as null | (() => void),
      addEventListener: (_type: string, listener: () => void) => {
        listeners.push(listener);
      },
      finish() {
        listeners.forEach(listener => listener());
        animation.onfinish?.();
      },
      cancel() {},
    };
    recorded.push({element: this, keyframes, options, animation});
    return animation;
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as unknown as {animate?: unknown}).animate;
});

function Shell({
  inShell = true,
  hasNav = true,
  isResizable = false,
  height = 'fill',
  hasCanvas = false,
}: {
  inShell?: boolean;
  hasNav?: boolean;
  isResizable?: boolean;
  height?: 'fill' | 'auto';
  hasCanvas?: boolean;
}) {
  const nav = (
    <SideNav collapsible resizable={isResizable}>
      <SideNavItem label="Home" icon={<svg aria-hidden="true" />} />
      <SideNavItem label="Projects" icon={<svg aria-hidden="true" />} />
      {hasCanvas && (
        <SideNavItem label="Chart" icon={<canvas width={4} height={4} />} />
      )}
    </SideNav>
  );
  return inShell ? (
    <AppShell
      height={height}
      mobileNav={{breakpoint: 'none'}}
      sideNav={hasNav ? nav : undefined}>
      <h1>Projects page</h1>
      <p>The page beside the rail.</p>
      <label>
        <input type="radio" name="plan" value="pro" defaultChecked /> Pro
      </label>
    </AppShell>
  ) : (
    nav
  );
}

/** Collapse or expand, then let the glide's microtask run. */
async function toggle() {
  const button = screen.getByRole('button', {name: /collapse|expand/i});
  await act(async () => {
    fireEvent.click(button);
  });
}

function animated(property: string): Recorded[] {
  return recorded.filter(entry =>
    entry.keyframes.some(frame => property in frame),
  );
}

function copies(): Element[] {
  return Array.from(document.querySelectorAll('[aria-hidden="true"][inert]'));
}

describe('SideNav rail motion (component:SideNav FR6, component:AppShell FR17)', () => {
  it('collapses by covering the old rail with a clip while the content slides, never animating a width', async () => {
    render(<Shell />);
    await toggle();

    expect(railWidth()).toBe(COLLAPSED);
    expect(animated('width')).toEqual([]);
    // The old rail's copy is covered by a clip from its full width to the
    // collapsed one.
    const [clip] = animated('clipPath');
    expect(clip.keyframes[0].clipPath).toMatch(
      /inset\(0(px)? 0(px)? 0(px)? 0(px)?\)/,
    );
    expect(clip.keyframes.at(-1)?.clipPath).toContain(
      `${EXPANDED - COLLAPSED}px`,
    );
    // The content column starts where it was and slides to its new place.
    const main = screen.getByRole('main');
    const [slide] = animated('translate').filter(
      entry => entry.element !== main && entry.element.contains(main),
    );
    expect(slide.keyframes[0].translate).toBe(`${EXPANDED - COLLAPSED}px 0px`);
    expect(slide.keyframes.at(-1)?.translate).toBe('0px 0px');
    // Every part plays on one clock.
    const starts = new Set(recorded.map(entry => entry.animation.startTime));
    expect(starts).toEqual(new Set([1000]));
    const durations = new Set(recorded.map(entry => entry.options.duration));
    expect(durations.size).toBe(1);
  });

  it('cross-fades the content: the old wrap fades out over the new one, which fades in', async () => {
    render(<Shell />);
    await toggle();
    const main = screen.getByRole('main');
    const copy = copies().find(element =>
      element.textContent?.includes('The page beside the rail.'),
    );
    // Beside the content, which clips, not inside it: no line is cut.
    expect(main.contains(copy ?? null)).toBe(false);
    const fadeOut = recorded.find(entry => entry.element === copy);
    expect(fadeOut?.keyframes[0]).toMatchObject({
      opacity: 1,
      translate: '0px 0px',
    });
    // It moves with the column: from where it was by the column's travel.
    expect(fadeOut?.keyframes.at(-1)).toMatchObject({
      opacity: 0,
      translate: `${COLLAPSED - EXPANDED}px 0px`,
    });
    const heading = screen.getByRole('heading', {name: 'Projects page'});
    const fadeIn = recorded.find(entry => entry.element === heading);
    expect(fadeIn?.keyframes[0].opacity).toBe(0);
    expect(fadeIn?.keyframes.at(-1)?.opacity).toBe(1);
  });

  it('expands by revealing the real rail with a clip under the old rail, applied before the first frame paints', async () => {
    render(<Shell />);
    await toggle();
    act(() => {
      recorded.forEach(entry => entry.animation.finish());
    });
    settle();
    recorded = [];
    await toggle();

    expect(railWidth()).toBe(EXPANDED);
    // The real rail is clipped open from the old width.
    const reveal = animated('clipPath').find(
      entry => !entry.element.hasAttribute('inert'),
    );
    expect(reveal).toBeDefined();
    // The old, collapsed rail is held over it at first and fades, so the first
    // frame is the frame before the click.
    const old = recorded.find(
      entry =>
        entry.element.hasAttribute('inert') &&
        entry.element.querySelector('button[aria-label="Projects"]') != null,
    );
    expect(old?.keyframes[0].opacity).toBe(1);
    expect(old?.keyframes.at(-1)?.opacity).toBe(0);
    expect(reveal?.keyframes[0].clipPath).toContain(
      `${EXPANDED - COLLAPSED}px`,
    );
    expect(reveal?.keyframes.at(-1)?.clipPath).toMatch(
      /inset\(0(px)? 0(px)? 0(px)? 0(px)?\)/,
    );
    const main = screen.getByRole('main');
    const [slide] = animated('translate').filter(
      entry => entry.element !== main && entry.element.contains(main),
    );
    expect(slide.keyframes[0].translate).toBe(`${COLLAPSED - EXPANDED}px 0px`);
  });

  it('starts a change made mid-motion from the width the rail shows', async () => {
    render(<Shell />);
    await toggle();
    // 150 ms into the collapse the clip shows part of the old rail: the
    // column's glide shows it 102 px past its place, so the rail shows 150.
    Object.defineProperty(document, 'timeline', {
      configurable: true,
      value: {currentTime: 1150},
    });
    columnShift = 102;
    recorded = [];
    await toggle();
    const reveal = animated('clipPath').find(
      entry => !entry.element.hasAttribute('inert'),
    );
    const start = Number(
      /inset\(0px ([\d.]+)px/.exec(String(reveal?.keyframes[0].clipPath))?.[1],
    );
    // It reveals from the shown width, not from the collapsed one.
    expect(start).toBe(EXPANDED - 150);
  });

  it('continues what the rail and the page show when a change reverses a running one', async () => {
    render(<Shell />);
    await toggle();
    // 40 ms into the collapse: the old labels still show, fading.
    Object.defineProperty(document, 'timeline', {
      configurable: true,
      value: {currentTime: 1040},
    });
    recorded = [];
    await toggle();
    const opacityOf = (entry: Recorded | undefined) =>
      Number(entry?.keyframes[0].opacity);
    // The real labels start where the old ones were, not from nothing.
    const label = recorded.find(
      entry =>
        !entry.element.closest('[inert]') &&
        entry.element.textContent === 'Projects' &&
        'opacity' in entry.keyframes[0],
    );
    expect(opacityOf(label)).toBeGreaterThan(0.2);
    // The collapsed rail had not shown yet, so its held copy starts unseen.
    const collapsedCopy = recorded.find(
      entry =>
        entry.element.hasAttribute('inert') &&
        entry.element.querySelector('button[aria-label="Projects"]') != null,
    );
    expect(opacityOf(collapsedCopy)).toBeLessThan(0.2);
    // The page: the wrap held now showed partly, the entering wrap the rest.
    const heading = recorded.find(
      entry => entry.element.textContent === 'Projects page',
    );
    expect(opacityOf(heading)).toBeGreaterThan(0);
  });

  it('draws a collapse that reverses an expand with one rail copy, the real collapsed rail raised above it', async () => {
    render(<Shell />);
    await toggle();
    settle();
    await toggle();
    // 40 ms into the expand, collapse again.
    const at = (document.timeline as {currentTime: number}).currentTime;
    Object.defineProperty(document, 'timeline', {
      configurable: true,
      value: {currentTime: at + 40},
    });
    recorded = [];
    await toggle();
    const railCopies = copies().filter(
      element => element.querySelector('nav') != null,
    );
    expect(railCopies).toHaveLength(1);
    const panel = document.querySelector<HTMLElement>('.astryx-layout-panel');
    expect(panel?.style.zIndex).toBe('2');
    // Its icons start at the opacity the collapsed rail showed, mostly seen.
    const icons = recorded.find(
      entry => entry.element === panel && 'opacity' in entry.keyframes[0],
    );
    expect(Number(icons?.keyframes[0].opacity)).toBeGreaterThan(0.5);
    act(() => {
      recorded.forEach(entry => entry.animation.finish());
    });
    expect(panel?.style.zIndex).toBe('');
  });

  it('continues the page through a third press within the motion', async () => {
    render(<Shell />);
    await toggle();
    for (const at of [1040, 1080]) {
      Object.defineProperty(document, 'timeline', {
        configurable: true,
        value: {currentTime: at},
      });
      recorded = [];
      await toggle();
    }
    // The wrap entering now had been fading out: it starts low, not high.
    const heading = recorded.find(
      entry => entry.element.textContent === 'Projects page',
    );
    expect(Number(heading?.keyframes[0].opacity)).toBeLessThan(0.5);
  });

  it('lays the old rail in the row beside the content, past an auto-height side wrapper that clips', async () => {
    render(<Shell height="auto" />);
    await toggle();
    const railCopy = copies().find(
      element => element.querySelector('nav') != null,
    );
    // In the row that holds the rail and the content, not in the sticky side
    // wrapper, whose clip is already the collapsed width.
    expect(railCopy?.parentElement?.contains(screen.getByRole('main'))).toBe(
      true,
    );
  });

  it('lands a collapse and the page at once when the old rail cannot be copied', async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage: vi.fn(),
            getImageData: () => ({data: new Uint8ClampedArray(16 * 4)}),
          }) as unknown as CanvasRenderingContext2D,
      );
    render(<Shell hasCanvas />);
    await toggle();
    getContext.mockRestore();
    expect(railWidth()).toBe(COLLAPSED);
    // No rail copy, so no page motion either: both land on one clock.
    expect(copies()).toHaveLength(0);
    expect(animated('translate')).toHaveLength(0);
  });

  it('lands the running page glide too when a no-copy collapse interrupts an expand', async () => {
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage: vi.fn(),
            getImageData: () => ({data: new Uint8ClampedArray(16 * 4)}),
          }) as unknown as CanvasRenderingContext2D,
      );
    render(<Shell hasCanvas />);
    await toggle();
    settle();
    recorded = [];
    await toggle();
    // The expand's glide on the column beside the rail.
    const main = screen.getByRole('main');
    const glide = animated('translate').find(
      entry => entry.element !== main && entry.element.contains(main),
    );
    expect(glide).toBeDefined();
    const cancel = vi.spyOn(glide!.animation, 'cancel');
    // 40 ms in, collapse again: the rail cannot be copied.
    const at = (document.timeline as {currentTime: number}).currentTime;
    Object.defineProperty(document, 'timeline', {
      configurable: true,
      value: {currentTime: at + 40},
    });
    recorded = [];
    await toggle();
    getContext.mockRestore();
    expect(cancel).toHaveBeenCalled();
    expect(animated('translate')).toHaveLength(0);
  });

  it('clips an expand open on the motion when the old rail cannot be copied', async () => {
    // A canvas that reads back blank: the rail is not copied.
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          ({
            drawImage: vi.fn(),
            getImageData: () => ({data: new Uint8ClampedArray(16 * 4)}),
          }) as unknown as CanvasRenderingContext2D,
      );
    render(<Shell hasCanvas />);
    await toggle();
    settle();
    recorded = [];
    await toggle();
    getContext.mockRestore();
    expect(
      copies().filter(element => element.querySelector('nav')),
    ).toHaveLength(0);
    const reveal = animated('clipPath').find(
      entry => !entry.element.hasAttribute('inert'),
    );
    expect(reveal?.keyframes[0].clipPath).toContain(
      `${EXPANDED - COLLAPSED}px`,
    );
    expect(reveal?.keyframes.at(-1)?.clipPath).toMatch(
      /inset\(0(px)? 0(px)? 0(px)? 0(px)?\)/,
    );
  });

  it('leaves the real collapsed rail and no copies once the motion ends', async () => {
    render(<Shell />);
    await toggle();
    expect(copies().length).toBeGreaterThan(0);
    act(() => {
      recorded.forEach(entry => entry.animation.finish());
    });
    expect(copies()).toEqual([]);
    expect(railWidth()).toBe(COLLAPSED);
  });

  it('changes at once under Reduce Motion with a fine pointer (design:reduced-motion DR3)', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    render(<Shell />);
    await toggle();
    expect(recorded).toEqual([]);
    expect(copies()).toEqual([]);
  });

  it('only cross-fades under Reduce Motion with a coarse pointer (design:reduced-motion DR2)', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    render(<Shell />);
    await toggle();
    expect(recorded.length).toBeGreaterThan(0);
    // The surface stays put: nothing that holds the page animates.
    const main = screen.getByRole('main');
    expect(recorded.filter(entry => entry.element.contains(main))).toEqual([]);
    for (const entry of recorded) {
      for (const frame of entry.keyframes) {
        expect(Object.keys(frame).filter(key => key !== 'offset')).toEqual([
          'opacity',
        ]);
      }
    }
  });

  it('under DR2, an expand fades the old surface out with the old wrap', async () => {
    media['(prefers-reduced-motion: reduce)'] = true;
    media['(pointer: coarse)'] = true;
    render(<Shell />);
    const main = screen.getByRole('main');
    main.style.backgroundColor = 'rgb(255, 255, 255)';
    await toggle();
    act(() => {
      recorded.forEach(entry => entry.animation.finish());
    });
    settle();
    recorded = [];
    await toggle();
    // The old wrap's copy paints the surface it sat on, from opaque at the
    // first frame, so the strip the narrower page leaves fades with it.
    const copy = copies().find(
      element => element.querySelector('h1') != null,
    ) as HTMLElement | undefined;
    expect(copy?.style.backgroundColor).toBe('rgb(255, 255, 255)');
    const fade = recorded.find(entry => entry.element === copy);
    expect(fade?.keyframes[0].opacity).toBe(1);
  });

  it('outside AppShell, moves only the rail', async () => {
    render(<Shell inShell={false} />);
    await toggle();
    expect(animated('clipPath').length).toBeGreaterThan(0);
    expect(animated('translate')).toEqual([]);
  });

  it('leaves the page form state alone: a checked radio stays checked', async () => {
    render(<Shell />);
    const pro = screen.getByRole('radio', {name: 'Pro'});
    expect(pro).toBeChecked();
    await toggle();
    // The copied radio joins no group, so it cannot uncheck the live one.
    const [copied] = copies().flatMap(copy =>
      Array.from(copy.querySelectorAll('input[type="radio"]')),
    );
    expect(copied).toBeDefined();
    expect(copied).not.toHaveAttribute('name');
    expect(pro).toBeChecked();
    act(() => {
      recorded.forEach(entry => entry.animation.finish());
    });
    expect(pro).toBeChecked();
  });

  it('plays for a resizable rail too, whose resize wrapper comes and goes with the collapse', async () => {
    render(<Shell isResizable />);
    await toggle();
    expect(railWidth()).toBe(COLLAPSED);
    expect(animated('clipPath').length).toBeGreaterThan(0);
  });

  it('plays for a resizable rail outside AppShell, whose nav remounts with the collapse', async () => {
    render(<Shell inShell={false} isResizable />);
    await toggle();
    expect(railWidth()).toBe(COLLAPSED);
    const clip = animated('clipPath').find(entry =>
      entry.element.hasAttribute('inert'),
    );
    expect(clip).toBeDefined();
    expect(clip?.element.isConnected).toBe(true);
  });

  it('removes its copies and restores the row when the rail unmounts mid-motion', async () => {
    const {rerender} = render(<Shell />);
    await toggle();
    expect(copies().length).toBeGreaterThan(0);
    rerender(<Shell hasNav={false} />);
    expect(copies()).toEqual([]);
    const clipped = Array.from(
      document.querySelectorAll<HTMLElement>('*'),
    ).filter(element => element.style.overflow === 'clip');
    expect(clipped).toEqual([]);
  });

  it("keeps the old rail's copy on the real rail's edge wherever SideNav sits", async () => {
    // A rail centered in its parent moves when it narrows.
    railLeft = width => (SHELL_WIDTH - width) / 2;
    render(<Shell inShell={false} />);
    await toggle();
    const copy = copies().find(element => element.matches('nav'));
    expect(copy).toBeDefined();
    expect((copy as HTMLElement).style.left).toBe(
      `${(SHELL_WIDTH - COLLAPSED) / 2}px`,
    );
    expect((copy as HTMLElement).style.width).toBe(`${EXPANDED}px`);
  });

  it('changes at once without Web Animations', async () => {
    delete (HTMLElement.prototype as unknown as {animate?: unknown}).animate;
    render(<Shell />);
    await toggle();
    expect(railWidth()).toBe(COLLAPSED);
    expect(copies()).toEqual([]);
  });
});
