// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionCrossFade.test.ts
 * @input reducedMotionCrossFade.ts, with fakeAnimate for Web Animations
 * @output Proof of the cross-fade through a copy: the copy fades out where
 *   the element showed while the element lands and fades in, on one easing.
 *   The copy sits next to the clipping box and is clipped to its visible box,
 *   past the copy's own edges, with no layout read once the copy is laid. It
 *   goes once both fades end or on cancel. An element that cannot be copied
 *   gets null.
 * @position Testing for /packages/core/src/motion/reducedMotionCrossFade.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fakeAnimate, type FakeAnimation} from './__tests__/fakeWebAnimation';
import {ENTRANCE_OPACITY_FLOOR} from './opacityFloor';
import {playReducedMotionCrossFade} from './reducedMotionCrossFade';

const fade = {duration: 200, easing: 'cubic-bezier(0.42, 0, 0.58, 1)'};

/** A DOMRect-like box: jsdom lays nothing out. */
function box(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

let animations: FakeAnimation[] = [];
const nativeAnimate = Element.prototype.animate;
/** The scroller's layout reads and the copy's placement, when a case logs them. */
let layoutLog: string[] | null = null;

beforeEach(() => {
  const fake = fakeAnimate();
  animations = fake.animations;
  // The copy is a clone: it reaches `animate` through the prototype.
  Element.prototype.animate = fake.animate;
});

afterEach(() => {
  Element.prototype.animate = nativeAnimate;
  layoutLog = null;
  document.body.replaceChildren();
});

/** A scroller in a wrapper, holding a list moved 167 px down. */
function list() {
  const wrapper = document.createElement('div');
  const scroller = document.createElement('div');
  const content = document.createElement('div');
  content.textContent = 'Message 1';
  content.style.setProperty('translate', '0px 167px');
  scroller.append(content);
  wrapper.append(scroller);
  document.body.append(wrapper);
  content.getBoundingClientRect = () => box(0, 167, 400, 900);
  scroller.getBoundingClientRect = () => {
    layoutLog?.push('read the scroller');
    return box(0, 0, 400, 600);
  };
  for (const [name, value] of [
    ['clientTop', 0],
    ['clientLeft', 0],
    ['clientWidth', 400],
    ['clientHeight', 600],
  ] as const) {
    Object.defineProperty(scroller, name, {
      get: () => {
        layoutLog?.push('read the scroller');
        return value;
      },
    });
  }
  return {wrapper, scroller, content};
}

/** The copy the cross-fade laid, if any. */
const copyIn = (wrapper: Element) =>
  [...wrapper.children].find(child => child.hasAttribute('inert')) as
    HTMLElement | undefined;

describe('playReducedMotionCrossFade', () => {
  it('lays a copy where the list shows, then lands the list and fades both on one easing', () => {
    const {wrapper, scroller, content} = list();
    const land = vi.fn(() => {
      // The copy already shows the old state when the change lands.
      expect(copyIn(wrapper)).toBeDefined();
      content.style.setProperty('translate', '0px 60px');
    });
    const played = playReducedMotionCrossFade(content, fade, land, scroller);
    expect(played).not.toBeNull();
    expect(land).toHaveBeenCalledOnce();
    const copy = copyIn(wrapper);
    expect(copy?.textContent).toBe('Message 1');
    // Next to the scroller, never inside it: a scroll moves nothing of it.
    expect(scroller.nextElementSibling).toBe(copy);
    // Its rect places it, so no transform moves it a second time.
    expect(copy?.style.getPropertyValue('translate')).toBe('none');
    expect(copy?.style.getPropertyValue('pointer-events')).toBe('none');
    expect(animations).toHaveLength(2);
    const [fadeIn, fadeOut] = animations;
    expect(fadeIn.keyframes.map(frame => frame.opacity)).toEqual([
      ENTRANCE_OPACITY_FLOOR,
      1,
    ]);
    expect(fadeIn.options).toMatchObject({duration: 200, fill: 'backwards'});
    expect(fadeOut.keyframes.map(frame => frame.opacity)).toEqual([1, 0]);
    expect(fadeOut.options).toMatchObject({duration: 200, fill: 'forwards'});
    expect(fadeIn.keyframes[0].easing).toBe(fade.easing);
    expect(fadeOut.keyframes[0].easing).toBe(fade.easing);
  });

  it("clips the copy to the visible box of the scroller it is laid outside of, past the copy's own edges", () => {
    const {wrapper, scroller, content} = list();
    // The copy's own box once laid: where the list showed, 900 px tall.
    const nativeBox = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return this.hasAttribute('inert')
        ? box(0, 167, 400, 900)
        : nativeBox.call(this);
    };
    try {
      playReducedMotionCrossFade(content, fade, () => {}, scroller);
    } finally {
      Element.prototype.getBoundingClientRect = nativeBox;
    }
    // The scroller shows 600 px: the copy's last 467 px are cut. Its top
    // edge is 167 px below the scroller's: what the copy holds above its own
    // box, such as an indicator band above a list, shows there as it did.
    expect(copyIn(wrapper)?.style.getPropertyValue('clip-path')).toBe(
      'inset(-167px 0px 467px 0px)',
    );
  });

  it('reads the scroller before it lays the copy: once the copy is laid, nothing reads layout', () => {
    const {wrapper, scroller, content} = list();
    const log: string[] = [];
    layoutLog = log;
    const insert = wrapper.insertBefore.bind(wrapper);
    wrapper.insertBefore = <T extends Node>(node: T, child: Node | null) => {
      log.push('lay the copy');
      return insert(node, child);
    };
    const nativeBox = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.hasAttribute('inert')) {
        log.push('read the copy');
        return box(0, 167, 400, 900);
      }
      return nativeBox.call(this);
    };
    try {
      playReducedMotionCrossFade(content, fade, () => {}, scroller);
    } finally {
      Element.prototype.getBoundingClientRect = nativeBox;
    }
    expect(log).toContain('read the scroller');
    // Laying the copy reads its box once, to place it. A read after its last
    // write would lay the page out a second time.
    expect(log.slice(log.indexOf('lay the copy'))).toEqual([
      'lay the copy',
      'read the copy',
    ]);
  });

  it('removes the copy once both fades end, and reports it finished', async () => {
    const {wrapper, scroller, content} = list();
    const played = playReducedMotionCrossFade(
      content,
      fade,
      () => {},
      scroller,
    );
    for (const animation of animations) {
      animation.finish();
    }
    await expect(played?.finished).resolves.toBe(true);
    expect(copyIn(wrapper)).toBeUndefined();
  });

  it('keeps the copy while one fade still runs', async () => {
    const {wrapper, scroller, content} = list();
    playReducedMotionCrossFade(content, fade, () => {}, scroller);
    animations[0].finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(copyIn(wrapper)).toBeDefined();
  });

  it('on cancel removes the copy, cancels both fades and reports it unfinished', async () => {
    const {wrapper, scroller, content} = list();
    const played = playReducedMotionCrossFade(
      content,
      fade,
      () => {},
      scroller,
    );
    played?.cancel();
    expect(
      animations.map(animation => animation.cancel.mock.calls.length),
    ).toEqual([1, 1]);
    expect(copyIn(wrapper)).toBeUndefined();
    await expect(played?.finished).resolves.toBe(false);
  });

  it('lands at once with no copy when the fade is instant', async () => {
    const {wrapper, scroller, content} = list();
    const land = vi.fn();
    const played = playReducedMotionCrossFade(
      content,
      {...fade, duration: 0},
      land,
      scroller,
    );
    expect(land).toHaveBeenCalledOnce();
    expect(animations).toHaveLength(0);
    expect(copyIn(wrapper)).toBeUndefined();
    await expect(played?.finished).resolves.toBe(true);
  });

  it('gives null and lands nothing for an element with no box', () => {
    const {scroller, content} = list();
    content.getBoundingClientRect = () => box(0, 0, 0, 0);
    const land = vi.fn();
    expect(
      playReducedMotionCrossFade(content, fade, land, scroller),
    ).toBeNull();
    expect(land).not.toHaveBeenCalled();
    expect(animations).toHaveLength(0);
  });
});
