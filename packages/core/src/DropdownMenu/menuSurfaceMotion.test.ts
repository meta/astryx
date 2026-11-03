// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuSurfaceMotion.test.ts
 * @input vitest (jsdom), menuSurfaceMotion, a recording stand-in for
 *   Element.animate (jsdom runs no animations)
 * @output Checks the collapsed transform against UIMenu's path (a square on
 *   the anchor, the center on the straight line, the size linear in the
 *   spring's progress) and what the touch presentation hands the browser on
 *   open, close, reopen during the close, and reset
 * @position Testing; the curves on a real compositor are proven in
 *   __tests__/DropdownMenu.touchMotion.interaction.browser.spec.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {settlingDuration, solveSpring, toSpring} from '../motion/spring';
import {menu, springs} from '../motion/uikit';
import {TOUCH_QUERY} from '../utils/touchPresentation';
import {
  createMenuSurfaceMotion,
  menuCollapsedState,
  menuExitDurationMs,
  menuSpring,
  type MenuSurfaceGeometry,
} from './menuSurfaceMotion';

/** The attribute that marks the menu's exit copy. */
const MENU_EXIT = 'data-astryx-menu-exit';

// UIKit on iOS 26.2 (b4/b8): a 120 × 44 button at (140, 160) opens a
// 250 × 146 menu top-aligned and centered on it.
const GEOMETRY: MenuSurfaceGeometry = {
  surface: {left: 75, top: 160, width: 250, height: 146},
  anchor: {x: 200, y: 182},
};

/** The visual box of the surface scaled by (sx, sy) about the origin. */
function visualBox(
  geometry: MenuSurfaceGeometry,
  origin: {x: number; y: number},
  sx: number,
  sy: number,
) {
  const {left, top, width, height} = geometry.surface;
  return {
    left: left + origin.x * (1 - sx),
    top: top + origin.y * (1 - sy),
    width: width * sx,
    height: height * sy,
  };
}

describe('menuCollapsedState', () => {
  it('shows the surface as the collapsed square centered on the anchor', () => {
    const state = menuCollapsedState(GEOMETRY);
    expect(state).not.toBeNull();
    const box = visualBox(
      GEOMETRY,
      {x: state!.originX, y: state!.originY},
      state!.scaleX,
      state!.scaleY,
    );
    expect(box.width).toBeCloseTo(menu.collapsedSize, 9);
    expect(box.height).toBeCloseTo(menu.collapsedSize, 9);
    expect(box.left + box.width / 2).toBeCloseTo(GEOMETRY.anchor.x, 9);
    expect(box.top + box.height / 2).toBeCloseTo(GEOMETRY.anchor.y, 9);
  });

  it('keeps every frame on UIKit\u2019s path: size and center linear in the spring\u2019s progress', () => {
    const state = menuCollapsedState(GEOMETRY)!;
    const {surface, anchor} = GEOMETRY;
    const center = {
      x: surface.left + surface.width / 2,
      y: surface.top + surface.height / 2,
    };
    // Progress past 1 is the spring's overshoot; the path extends straight.
    for (const p of [0, 0.1, 0.37, 0.5, 0.9, 1, 1.03]) {
      const sx = state.scaleX + (1 - state.scaleX) * p;
      const sy = state.scaleY + (1 - state.scaleY) * p;
      const box = visualBox(
        GEOMETRY,
        {x: state.originX, y: state.originY},
        sx,
        sy,
      );
      const size = menu.collapsedSize;
      expect(box.width).toBeCloseTo(size + (surface.width - size) * p, 9);
      expect(box.height).toBeCloseTo(size + (surface.height - size) * p, 9);
      expect(box.left + box.width / 2).toBeCloseTo(
        anchor.x + (center.x - anchor.x) * p,
        9,
      );
      expect(box.top + box.height / 2).toBeCloseTo(
        anchor.y + (center.y - anchor.y) * p,
        9,
      );
    }
  });

  it('has nothing to grow for a surface no larger than the square', () => {
    expect(
      menuCollapsedState({
        surface: {left: 0, top: 0, width: menu.collapsedSize, height: 200},
        anchor: {x: 10, y: 10},
      }),
    ).toBeNull();
  });
});

describe('menuSpring and menuExitDurationMs', () => {
  it('opens and closes on UIKit\u2019s menu springs', () => {
    expect(menuSpring('open')).toBe(springs.menuOpen);
    expect(menuSpring('close')).toBe(springs.menuClose);
  });

  it('keeps the close on screen until its spring settles, or for the animator\u2019s reduced-motion fade', () => {
    expect(menuExitDurationMs(null)).toBe(
      Math.ceil(settlingDuration(toSpring(springs.menuClose)) * 1000),
    );
    // Reduce Motion under a finger: the 200 ms fade (design:reduced-motion DR2).
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches:
            query.includes('prefers-reduced-motion: reduce') ||
            query === '(pointer: coarse)',
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    try {
      expect(menuExitDurationMs(null)).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

interface Recorded {
  target: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancelled: boolean;
}

describe('createMenuSurfaceMotion', () => {
  let clock = 1000;
  let recorded: Recorded[] = [];

  beforeEach(() => {
    clock = 1000;
    recorded = [];
    vi.useFakeTimers();
    HTMLElement.prototype.animate = function (keyframes, options) {
      const animation = {
        target: this,
        keyframes: keyframes as Keyframe[],
        options: options as KeyframeAnimationOptions,
        cancelled: false,
        startTime: null as number | null,
        finished: new Promise(() => {}),
        cancel() {
          this.cancelled = true;
        },
      };
      recorded.push(animation);
      return animation as unknown as Animation;
    };
  });

  // jsdom has no layout: the close's copy stands where its inline box says.
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (!this.hasAttribute(MENU_EXIT)) {
        return originalRect.call(this);
      }
      const left = parseFloat(this.style.left);
      const top = parseFloat(this.style.top);
      const width = parseFloat(this.style.width);
      const height = parseFloat(this.style.height);
      return {
        left,
        top,
        width,
        height,
        x: left,
        y: top,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      };
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const create = (reducedMotion = false) => {
    const host = document.createElement('section');
    document.body.appendChild(host);
    const element = document.createElement('div');
    element.id = 'menu-popover';
    element.setAttribute('popover', 'auto');
    element.innerHTML =
      '<div role="menu" id="menu-list"><div role="menuitem" id="row-1">Edit</div></div>';
    // jsdom has no layout: the surface stands where the open measured it.
    element.getBoundingClientRect = () => ({
      ...GEOMETRY.surface,
      x: GEOMETRY.surface.left,
      y: GEOMETRY.surface.top,
      right: GEOMETRY.surface.left + GEOMETRY.surface.width,
      bottom: GEOMETRY.surface.top + GEOMETRY.surface.height,
      toJSON: () => ({}),
    });
    host.appendChild(element);
    // The touch presentation (a coarse primary pointer), with Reduce Motion
    // as asked: the animator reads both from the media queries.
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes(`(not ${TOUCH_QUERY})`)
          ? false
          : query.includes('(prefers-reduced-motion: reduce)')
            ? reducedMotion
            : query === TOUCH_QUERY,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const motion = createMenuSurfaceMotion(element, {now: () => clock});
    return {element, motion};
  };

  const live = (property: string, target?: Element) =>
    recorded.filter(
      animation =>
        !animation.cancelled &&
        (target == null || animation.target === target) &&
        animation.keyframes.some(frame => property in frame),
    );
  const ghostOf = (element: HTMLElement) =>
    element.parentElement!.querySelector<HTMLElement>(`[${MENU_EXIT}]`);

  it('grows the surface out of the anchor on UIKit\u2019s open spring, without the layer\u2019s CSS entrance', () => {
    const {element, motion} = create();
    // The read happens with the CSS entrance already off and no scale left.
    const measure = vi.fn(() => {
      expect(element.style.getPropertyValue('animation-name')).toBe('none');
      return GEOMETRY;
    });
    motion.enter(measure);
    expect(measure).toHaveBeenCalledTimes(1);
    const state = menuCollapsedState(GEOMETRY)!;
    expect(element.style.getPropertyValue('animation-name')).toBe('none');
    expect(element.style.getPropertyValue('transform-origin')).toBe(
      `${state.originX}px ${state.originY}px`,
    );
    const [scaleAnimation] = live('scale');
    const scaleFrames = scaleAnimation.keyframes.map(frame =>
      String(frame.scale)
        .split(' ')
        .map(value => Number(value)),
    );
    expect(scaleFrames[0][0]).toBeCloseTo(state.scaleX, 4);
    expect(scaleFrames[0][1]).toBeCloseTo(state.scaleY, 4);
    expect(scaleFrames.at(-1)).toEqual([1, 1]);
    // The keyframes follow UIKit's open spring (ζ 0.8, response 0.32 s).
    const duration = Number(scaleAnimation.options.duration);
    const curve = solveSpring(toSpring(springs.menuOpen), {
      from: state.scaleX,
      to: 1,
    });
    for (const frame of scaleAnimation.keyframes) {
      const t = ((frame.offset as number) * duration) / 1000;
      const [sx] = String(frame.scale)
        .split(' ')
        .map(value => Number(value));
      expect(sx).toBeCloseTo(curve.value(t), 2);
    }
    const [opacityAnimation] = live('opacity');
    expect(Number(opacityAnimation.keyframes[0].opacity)).toBe(0);
    expect(Number(opacityAnimation.keyframes.at(-1)!.opacity)).toBe(1);
  });

  it('leaves no transform of its own once the open settles, so WebKit on iOS lets a finger scroll the list', async () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    // The open scales the surface (an animation; the animator leaves an
    // identity end value off the element).
    expect(
      recorded.some(
        animation =>
          animation.target === element &&
          animation.keyframes.some(keyframe => 'scale' in keyframe),
      ),
    ).toBe(true);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(element.style.getPropertyValue('scale')).toBe('');
    expect(element.style.getPropertyValue('opacity')).toBe('');
    expect(element.style.getPropertyValue('transform-origin')).toBe('');
    // The layer's CSS entrance stays off.
    expect(element.style.getPropertyValue('animation-name')).toBe('none');
  });

  it('shows the closing copy in the top layer, as a manual popover, where the browser has the popover API', () => {
    const shown: HTMLElement[] = [];
    const original = HTMLElement.prototype.showPopover;
    HTMLElement.prototype.showPopover = function showPopover(
      this: HTMLElement,
    ) {
      shown.push(this);
    };
    try {
      const {element, motion} = create();
      motion.enter(() => GEOMETRY);
      clock += 1000;
      vi.advanceTimersByTime(1000);
      motion.exit();
      const ghost = ghostOf(element);
      expect(ghost).not.toBeNull();
      expect(ghost!.getAttribute('popover')).toBe('manual');
      expect(shown).toEqual([ghost]);
      // The top layer orders it: no z-index of its own.
      expect(ghost!.style.getPropertyValue('z-index')).toBe('');
    } finally {
      HTMLElement.prototype.showPopover = original;
    }
  });

  it('plays the close on a static copy of the surface, out of reach, removed when the spring settles', async () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const ghost = ghostOf(element);
    expect(ghost).not.toBeNull();
    // Beside the surface (same inherited theme), where it stands.
    expect(ghost!.previousElementSibling).toBe(element);
    expect(ghost!.getAttribute('aria-hidden')).toBe('true');
    expect(ghost!.hasAttribute('inert')).toBe(true);
    // A manual popover: the top layer, with no light dismiss of its own.
    expect(ghost!.getAttribute('popover')).toBe('manual');
    expect(ghost!.querySelectorAll('[id]')).toHaveLength(0);
    expect(ghost!.id).toBe('');
    expect(ghost!.style.getPropertyValue('position')).toBe('fixed');
    // Placed by its own box: no anchor-center or other alignment shifts it.
    expect(ghost!.style.getPropertyValue('justify-self')).toBe('normal');
    expect(ghost!.style.getPropertyValue('align-self')).toBe('normal');
    expect(ghost!.style.getPropertyValue('pointer-events')).toBe('none');
    expect(ghost!.style.getPropertyValue('left')).toBe(
      `${GEOMETRY.surface.left}px`,
    );
    expect(ghost!.style.getPropertyValue('width')).toBe(
      `${GEOMETRY.surface.width}px`,
    );
    const state = menuCollapsedState(GEOMETRY)!;
    expect(ghost!.style.getPropertyValue('transform-origin')).toBe(
      `${state.originX}px ${state.originY}px`,
    );
    // The copy collapses into the anchor on the close spring and fades.
    const [scaleAnimation] = live('scale', ghost!);
    const last = String(scaleAnimation.keyframes.at(-1)!.scale)
      .split(' ')
      .map(value => Number(value));
    expect(last[0]).toBeCloseTo(state.scaleX, 4);
    expect(last[1]).toBeCloseTo(state.scaleY, 4);
    const duration = Number(scaleAnimation.options.duration);
    const curve = solveSpring(toSpring(springs.menuClose), {
      from: 1,
      to: state.scaleX,
    });
    for (const frame of scaleAnimation.keyframes) {
      const t = ((frame.offset as number) * duration) / 1000;
      const [sx] = String(frame.scale)
        .split(' ')
        .map(value => Number(value));
      expect(sx).toBeCloseTo(curve.value(t), 2);
    }
    const [opacityAnimation] = live('opacity', ghost!);
    expect(Number(opacityAnimation.keyframes[0].opacity)).toBe(1);
    expect(Number(opacityAnimation.keyframes.at(-1)!.opacity)).toBe(0);
    // Gone once the spring settles.
    clock += 2000;
    vi.advanceTimersByTime(2000);
    return Promise.resolve().then(() => {
      expect(ghostOf(element)).toBeNull();
    });
  });

  it('leaves the closed surface alone while its copy closes: no style write on it during the close or after, so no promotion ends inside the close', async () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    // Closed while the open's promotion still lingers.
    clock += 600;
    vi.advanceTimersByTime(600);
    motion.exit();
    expect(ghostOf(element)).not.toBeNull();
    // The close's own task, its microtasks included, may still write.
    await Promise.resolve();
    await Promise.resolve();
    const observer = new MutationObserver(() => {});
    observer.observe(element, {attributes: true, attributeFilter: ['style']});
    // Through the close spring and the animator's promotion linger after it.
    clock += 2000;
    vi.advanceTimersByTime(2000);
    const writes = observer.takeRecords();
    observer.disconnect();
    expect(writes).toHaveLength(0);
  });

  it('reopened during the close, grows back from the frame on screen about the same origin', () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const origin = element.style.getPropertyValue('transform-origin');
    clock += 60;
    const measure = vi.fn(() => GEOMETRY);
    motion.enter(measure);
    // No new measurement and no new pivot; the copy is gone.
    expect(measure).not.toHaveBeenCalled();
    expect(element.style.getPropertyValue('transform-origin')).toBe(origin);
    expect(ghostOf(element)).toBeNull();
    const first = String(live('scale', element).at(-1)!.keyframes[0].scale)
      .split(' ')
      .map(value => Number(value));
    const state = menuCollapsedState(GEOMETRY)!;
    // Mid-close: smaller than the open menu, larger than the square.
    expect(first[0]).toBeLessThan(1);
    expect(first[0]).toBeGreaterThan(state.scaleX);
  });

  it('a close with no touch open before it does nothing', () => {
    const {element, motion} = create();
    motion.exit();
    expect(recorded).toHaveLength(0);
    expect(ghostOf(element)).toBeNull();
  });

  it('reset leaves the element as the component styles it', () => {
    const {element, motion} = create();
    motion.enter(() => GEOMETRY);
    motion.reset();
    for (const property of [
      'scale',
      'opacity',
      'transform-origin',
      'animation-name',
    ]) {
      expect(element.style.getPropertyValue(property), property).toBe('');
    }
    motion.exit();
    expect(ghostOf(element)).toBeNull();
  });

  it('Reduce Motion: the menu opens and closes in place on an opacity fade of 200 ms or less, with no scale and no spring (design:reduced-motion DR1, DR2)', () => {
    const {element, motion} = create(true);
    motion.enter(() => GEOMETRY);
    // No growth: any scale keyframe after the start is the full size.
    for (const animation of live('scale', element)) {
      for (const frame of animation.keyframes) {
        if ((frame.offset as number) > 0) {
          expect(String(frame.scale)).toMatch(/^1( 1)?$/);
        }
      }
    }
    // When a fade reaches its end value, in ms (the animation then holds it).
    const fadeEnds = (animation: Recorded, value: number) => {
      const reached = animation.keyframes.find(
        frame => Math.abs(Number(frame.opacity) - value) < 1e-6,
      )!;
      return (reached.offset as number) * Number(animation.options.duration);
    };
    const [fadeIn] = live('opacity', element);
    expect(fadeEnds(fadeIn, 1)).toBeLessThanOrEqual(200 + 1);
    expect(Number(fadeIn.keyframes[0].opacity)).toBe(0);
    expect(Number(fadeIn.keyframes.at(-1)!.opacity)).toBe(1);
    // A timed fade on easeInOut, no spring's curve: 100 ms in, halfway in.
    const duration = Number(fadeIn.options.duration);
    const middle = fadeIn.keyframes.find(
      frame => Math.abs((frame.offset as number) * duration - 100) < 5,
    );
    expect(middle).toBeDefined();
    expect(Number(middle!.opacity)).toBeCloseTo(
      ((middle!.offset as number) * duration) / 200,
      1,
    );
    clock += 1000;
    vi.advanceTimersByTime(1000);
    motion.exit();
    const ghost = ghostOf(element)!;
    // The copy keeps its size while it fades (it lands once it is out).
    for (const animation of live('scale', ghost)) {
      const length = Number(animation.options.duration);
      for (const frame of animation.keyframes) {
        if ((frame.offset as number) * length < 195) {
          expect(String(frame.scale)).toMatch(/^1( 1)?$/);
        }
      }
    }
    const [fadeOut] = live('opacity', ghost);
    expect(fadeEnds(fadeOut, 0)).toBeLessThanOrEqual(200 + 1);
    expect(Number(fadeOut.keyframes[0].opacity)).toBe(1);
    expect(Number(fadeOut.keyframes.at(-1)!.opacity)).toBe(0);
  });
});
