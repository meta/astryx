// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotionCrossFade.test.ts
 * @input reducedMotionCrossFade.ts, with fakeAnimate for Web Animations
 * @output Proof of the cross-fade through a copy. In a scroll container, the
 *   copy is the container's visible part, in an inert holder next to it. It
 *   includes what the element draws outside its own box. Without one, the
 *   copy is the element, with no transform. The copy fades out as the element
 *   lands and fades in, on one easing. It goes once both fades end or on
 *   cancel. An element with no box gets null.
 * @position Testing for /packages/core/src/motion/reducedMotionCrossFade.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fakeAnimate, type FakeAnimation} from './__tests__/fakeWebAnimation';
import {ENTRANCE_OPACITY_FLOOR} from './opacityFloor';
import {playReducedMotionCrossFade} from './reducedMotionCrossFade';

const fade = {duration: 200, easing: 'cubic-bezier(0.42, 0, 0.58, 1)'};

/** A DOMRect-like box: jsdom lays nothing out. */
function box(left: number, top: number, width: number, height: number) {
  return DOMRect.fromRect({x: left, y: top, width, height});
}

let animations: FakeAnimation[] = [];
const nativeAnimate = Element.prototype.animate;

beforeEach(() => {
  const fake = fakeAnimate();
  animations = fake.animations;
  // The copy is a clone: it reaches `animate` through the prototype.
  Element.prototype.animate = fake.animate;
});

afterEach(() => {
  Element.prototype.animate = nativeAnimate;
  document.body.replaceChildren();
});

/**
 * A scroller in a wrapper, holding a list moved 167 px down and, above the
 * list's own box, an indicator.
 */
function list() {
  const wrapper = document.createElement('div');
  const scroller = document.createElement('div');
  scroller.setAttribute('role', 'region');
  scroller.tabIndex = 0;
  const content = document.createElement('div');
  content.textContent = 'Message 1';
  content.style.setProperty('translate', '0px 167px');
  const indicator = document.createElement('div');
  indicator.textContent = 'Refreshing';
  content.append(indicator);
  scroller.append(content);
  wrapper.append(scroller);
  document.body.append(wrapper);
  content.getBoundingClientRect = () => box(0, 167, 400, 900);
  scroller.getBoundingClientRect = () => box(0, 0, 400, 600);
  for (const [name, value] of [
    ['clientTop', 0],
    ['clientLeft', 0],
    ['clientWidth', 400],
    ['clientHeight', 600],
  ] as const) {
    Object.defineProperty(scroller, name, {value, configurable: true});
  }
  return {wrapper, scroller, content};
}

/** The copy the cross-fade laid, if any. */
const copyIn = (parent: Element) =>
  [...parent.children].find(child => child.hasAttribute('inert')) as
    HTMLElement | undefined;

describe('playReducedMotionCrossFade', () => {
  it('in a scroll container, lays a holder of its visible part next to it, then lands the element', () => {
    const {wrapper, scroller, content} = list();
    const land = vi.fn(() => {
      // The copy already shows the old state when the change lands.
      expect(copyIn(wrapper)).toBeDefined();
      content.style.setProperty('translate', '0px 60px');
    });
    const played = playReducedMotionCrossFade(content, fade, land, scroller);
    expect(played).not.toBeNull();
    expect(land).toHaveBeenCalledOnce();
    const holder = copyIn(wrapper);
    // Next to the scroller, never inside it: a scroll moves nothing of it.
    expect(scroller.nextElementSibling).toBe(holder);
    expect(holder?.getAttribute('aria-hidden')).toBe('true');
    expect(holder?.style.overflow).toBe('hidden');
    expect(holder?.style.pointerEvents).toBe('none');
    // The holder clips; no clip is computed for the copy.
    expect(holder?.style.getPropertyValue('clip-path')).toBe('');
    // The list keeps its place inside the copy, with what it draws above
    // its own box.
    const copiedList = holder?.firstElementChild?.firstElementChild as
      HTMLElement | undefined;
    expect(copiedList?.style.getPropertyValue('translate')).toBe('0px 167px');
    expect(holder?.textContent).toContain('Refreshing');
    // The copied scroller is no landmark or tab stop.
    expect(holder?.firstElementChild?.hasAttribute('role')).toBe(false);
    expect(holder?.firstElementChild?.hasAttribute('tabindex')).toBe(false);
  });

  it('fades the element in and the copy out together, on one easing', () => {
    const {scroller, content} = list();
    playReducedMotionCrossFade(content, fade, () => {}, scroller);
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

  it('without a scroll container, copies the element where it shows, with no transform', () => {
    const {scroller, content} = list();
    playReducedMotionCrossFade(content, fade, () => {});
    const copy = copyIn(scroller);
    expect(content.nextElementSibling).toBe(copy);
    expect(copy?.textContent).toContain('Message 1');
    // Its rect places it, so no transform moves it a second time.
    expect(copy?.style.getPropertyValue('translate')).toBe('none');
    expect(copy?.style.pointerEvents).toBe('none');
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

  it('gives null and lands nothing for a scroll container with no box', () => {
    const {scroller, content} = list();
    Object.defineProperty(scroller, 'clientWidth', {value: 0});
    const land = vi.fn();
    expect(
      playReducedMotionCrossFade(content, fade, land, scroller),
    ).toBeNull();
    expect(land).not.toHaveBeenCalled();
    expect(animations).toHaveLength(0);
  });
});
