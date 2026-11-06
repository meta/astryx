// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @input `animatedLayout`'s block edge reveal and conceal, in jsdom with
 *   recorded animations and placed boxes.
 * @output Unit tests for the slide under a still clip: which parts move, on
 *   which frames, and what the element keeps while they move.
 * @position Beside `animatedLayout.test.ts`, which covers the clip reveal of an
 *   element with text of its own.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  createAnimatedLayout,
  glideOf,
  holdLayoutExit,
  playLayoutChange,
  releaseLayoutExit,
  reportLayoutChange,
} from './animatedLayout';

interface Played {
  element: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
  /** Runs every finish listener, in the order they were added. */
  finish: () => void;
}

let played: Played[] = [];
const originalAnimate = Element.prototype.animate;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  played = [];
  Element.prototype.animate = function (
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const cancel = vi.fn();
    const listeners: (() => void)[] = [];
    const entry: Played = {
      element: this,
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancel,
      finish: () => {
        for (const listener of listeners) {
          listener();
        }
      },
    };
    played.push(entry);
    return {
      cancel,
      addEventListener(type: string, listener: () => void) {
        if (type === 'finish') {
          listeners.push(listener);
        }
      },
      currentTime: 0,
    } as unknown as Animation;
  };
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Element.prototype.animate = originalAnimate;
  window.matchMedia = originalMatchMedia;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Places `element` at `y` with `height`, in a 400 px wide area. */
function place(element: Element, y: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, y, 400, height),
  );
}

/**
 * An 80 px content of two rows, opened or closed in a 600 px area, with a row
 * after it. With `far`, a third child sits far below the band.
 */
function setUp({isOpening, far = false}: {isOpening: boolean; far?: boolean}) {
  document.body.innerHTML = `<div id="area"><div id="content"><p id="a">A</p>
    <p id="b">B</p>${far ? '<p id="far">Far</p>' : ''}</div><p id="after">Next</p></div>`;
  const area = document.getElementById('area') as HTMLElement;
  const content = document.getElementById('content') as HTMLElement;
  const after = document.getElementById('after') as HTMLElement;
  place(area, 0, 600);
  place(document.getElementById('a') as HTMLElement, 40, 40);
  place(document.getElementById('b') as HTMLElement, 80, 40);
  if (far) {
    place(document.getElementById('far') as HTMLElement, 5000, 40);
  }
  Object.defineProperty(content, 'offsetHeight', {value: 80});
  // A closing content stays in place while it exits, and gives up its space
  // through its end margin. An opening one takes its 80 px with the commit.
  let isShown = !isOpening;
  vi.spyOn(content, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 40, 400, isShown || !isOpening ? 80 : 0),
  );
  vi.spyOn(after, 'getBoundingClientRect').mockImplementation(() => {
    const margin =
      Number.parseFloat(content.style.getPropertyValue('margin-block-end')) ||
      0;
    return new DOMRect(
      0,
      40 + (isShown || !isOpening ? 80 : 0) + margin,
      400,
      20,
    );
  });
  const layout = createAnimatedLayout(() => area);
  const change = reportLayoutChange(layout, () => content);
  change.measureBefore();
  isShown = isOpening;
  change.animate();
  return {area, content, after, layout};
}

const motionsOn = (id: string) =>
  played.filter(entry => (entry.element as HTMLElement).id === id);

const translates = (entry: Played | undefined) =>
  (entry?.keyframes ?? []).map(frame => String(frame.translate));

describe('a block edge reveal slides its parts under a still clip (spec:AST-105 FR9)', () => {
  it('slides the child elements in on the frames the content after them glides on, fading the element, which keeps a still clip on its box', () => {
    const {content, layout} = setUp({isOpening: true});
    playLayoutChange(layout, content);
    const [entrance] = motionsOn('content');
    // The element only fades: no clip moves.
    expect(entrance.keyframes.every(frame => frame.clipPath == null)).toBe(
      true,
    );
    expect(entrance.keyframes[0].opacity).toBe(0);
    expect(content.style.getPropertyValue('clip-path')).toBe(
      'inset(0px 0px 0px 0px)',
    );
    // Both rows start a full content height up, and land in place.
    for (const id of ['a', 'b']) {
      const [slide] = motionsOn(id);
      expect(translates(slide)[0]).toBe('0px -80px');
      expect(translates(slide).at(-1)).toBe('0px 0px');
      expect(slide.options.duration).toBe(entrance.options.duration);
      expect(slide.keyframes.map(frame => frame.offset)).toEqual(
        entrance.keyframes.map(frame => frame.offset),
      );
    }
    // Once it ends, the element's own clip comes back.
    entrance.finish();
    expect(content.style.getPropertyValue('clip-path')).toBe('');
  });

  it("makes each part's slide its glide, so a later change carries it, and forgets it when the motion ends", () => {
    const {content, layout} = setUp({isOpening: true});
    playLayoutChange(layout, content);
    const part = document.getElementById('a') as HTMLElement;
    expect(glideOf(part)).not.toBeNull();
    const [entrance] = motionsOn('content');
    entrance.finish();
    expect(glideOf(part)).toBeNull();
  });

  it('keeps the moving clip when a part still glides from an earlier change, so its glide plays on', async () => {
    document.body.innerHTML = `<div id="area"><div id="content"><p id="a">A</p>
      <p id="b">B</p></div><p id="after">Next</p></div>`;
    const byId = (id: string) => document.getElementById(id) as HTMLElement;
    const [area, content, a, b, after] = [
      'area',
      'content',
      'a',
      'b',
      'after',
    ].map(byId);
    place(area, 0, 600);
    // The first row grows by 20 px, so the second row glides down.
    let grown = 0;
    vi.spyOn(a, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 40, 400, 40 + grown),
    );
    vi.spyOn(b, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 80 + grown, 400, 40),
    );
    vi.spyOn(content, 'getBoundingClientRect').mockImplementation(
      () => new DOMRect(0, 40, 400, 80 + grown),
    );
    Object.defineProperty(content, 'offsetHeight', {get: () => 80 + grown});
    vi.spyOn(after, 'getBoundingClientRect').mockImplementation(() => {
      const margin =
        Number.parseFloat(content.style.getPropertyValue('margin-block-end')) ||
        0;
      return new DOMRect(0, 120 + grown + margin, 400, 20);
    });
    const layout = createAnimatedLayout(() => area);
    const grow = reportLayoutChange(layout, () => a);
    grow.measureBefore();
    grown = 20;
    grow.animate();
    await Promise.resolve();
    expect(glideOf(b)).not.toBeNull();
    const glide = glideOf(b);
    // The content then closes while that glide runs.
    const close = reportLayoutChange(layout, () => content);
    close.measureBefore();
    close.animate();
    expect(holdLayoutExit(layout, content, vi.fn())).toBe(true);
    const exit = motionsOn('content').at(-1);
    expect(exit?.keyframes.some(frame => frame.clipPath != null)).toBe(true);
    expect(glideOf(b)).toBe(glide);
  });

  it('leaves a child the band cannot show where it is', () => {
    const {content, layout} = setUp({isOpening: true, far: true});
    playLayoutChange(layout, content);
    expect(motionsOn('a')).toHaveLength(1);
    expect(motionsOn('b')).toHaveLength(1);
    expect(motionsOn('far')).toEqual([]);
  });

  it('keeps the clip reveal for an element with text of its own', () => {
    const {content, layout} = setUp({isOpening: true});
    content.prepend('Details');
    playLayoutChange(layout, content);
    const [entrance] = motionsOn('content');
    expect(String(entrance.keyframes[0].clipPath)).toBe('inset(0 0 100% 0)');
    expect(motionsOn('a')).toEqual([]);
    expect(content.style.getPropertyValue('clip-path')).toBe('');
  });

  it('slides the parts out on an exit, holding them at their end until the release, which stops them and puts the clip back', () => {
    const {content, layout} = setUp({isOpening: false});
    const done = vi.fn();
    expect(holdLayoutExit(layout, content, done)).toBe(true);
    const [exit] = motionsOn('content');
    expect(exit.keyframes.every(frame => frame.clipPath == null)).toBe(true);
    expect(content.style.getPropertyValue('clip-path')).toBe(
      'inset(0px 0px 0px 0px)',
    );
    const [slide] = motionsOn('a');
    expect(translates(slide)[0]).toBe('0px 0px');
    expect(translates(slide).at(-1)).toBe('0px -80px');
    expect(slide.options.fill).toBe('forwards');
    releaseLayoutExit(content);
    expect(slide.cancel).toHaveBeenCalledTimes(1);
    expect(content.style.getPropertyValue('clip-path')).toBe('');
  });

  it("holds an exit's slides past its end, and stops them once at the release that follows, so a later reveal starts from rest", () => {
    const {content, layout} = setUp({isOpening: false});
    const done = vi.fn();
    holdLayoutExit(layout, content, done);
    const [exit] = motionsOn('content');
    const [slide] = motionsOn('a');
    exit.finish();
    expect(done).toHaveBeenCalledTimes(1);
    expect(slide.cancel).not.toHaveBeenCalled();
    expect(content.style.getPropertyValue('clip-path')).toBe(
      'inset(0px 0px 0px 0px)',
    );
    releaseLayoutExit(content);
    expect(slide.cancel).toHaveBeenCalledTimes(1);
    expect(content.style.getPropertyValue('clip-path')).toBe('');
    releaseLayoutExit(content);
    expect(slide.cancel).toHaveBeenCalledTimes(1);
  });

  it("holds the parts inside the element's content box on the side they come from", () => {
    const {content, layout} = setUp({isOpening: true});
    content.style.paddingTop = '12px';
    content.style.paddingBottom = '7px';
    playLayoutChange(layout, content);
    expect(content.style.getPropertyValue('clip-path')).toBe(
      'inset(12px 0px 0px 0px)',
    );
  });

  it('keeps the moving clip for an element that paints its own box', () => {
    const {content, layout} = setUp({isOpening: true});
    content.style.backgroundColor = 'rgb(240, 240, 240)';
    playLayoutChange(layout, content);
    const [entrance] = motionsOn('content');
    expect(String(entrance.keyframes[0].clipPath)).toBe('inset(0 0 100% 0)');
    expect(motionsOn('a')).toEqual([]);
  });

  for (const [what, paint] of [
    ['a border image', {borderImageSource: 'linear-gradient(red, blue)'}],
    ['a filter', {filter: 'blur(1px)'}],
    ['a border', {borderTop: '1px solid rgb(0, 0, 0)'}],
    ['a shadow', {boxShadow: '0 1px 2px rgb(0, 0, 0)'}],
  ] as const) {
    it(`keeps the moving clip for an element whose own box carries ${what}`, () => {
      const {content, layout} = setUp({isOpening: true});
      Object.assign(content.style, paint);
      playLayoutChange(layout, content);
      const [entrance] = motionsOn('content');
      expect(String(entrance.keyframes[0].clipPath)).toBe('inset(0 0 100% 0)');
      expect(motionsOn('a')).toEqual([]);
    });
  }

  it('keeps the moving clip when a part is an inline box, which no translation moves', () => {
    const {content, layout} = setUp({isOpening: true});
    (document.getElementById('b') as HTMLElement).style.display = 'inline';
    playLayoutChange(layout, content);
    const [entrance] = motionsOn('content');
    expect(String(entrance.keyframes[0].clipPath)).toBe('inset(0 0 100% 0)');
    expect(motionsOn('a')).toEqual([]);
  });

  it('keeps the moving clip when no part can play its slide', () => {
    const {content, layout} = setUp({isOpening: true});
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      ...args: Parameters<Element['animate']>
    ) {
      if (this.tagName === 'P') {
        throw new Error('no animation here');
      }
      return animate.apply(this, args);
    };
    playLayoutChange(layout, content);
    const [entrance] = motionsOn('content');
    expect(String(entrance.keyframes[0].clipPath)).toBe('inset(0 0 100% 0)');
    expect(content.style.getPropertyValue('clip-path')).toBe('');
  });

  it('a reveal that reverses a running exit stops its slides first', () => {
    const {content, layout} = setUp({isOpening: false});
    holdLayoutExit(layout, content, vi.fn());
    const [leaving] = motionsOn('a');
    releaseLayoutExit(content);
    playLayoutChange(layout, content);
    expect(leaving.cancel).toHaveBeenCalled();
  });
});
