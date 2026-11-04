// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useSliderTouch.test.tsx
 * @input vitest, Testing Library, Slider under a stubbed coarse pointer,
 *   stubbed geometry, timed touch events and fake timers
 * @output Holds Slider's touch presentation to UISlider's rules in jsdom:
 *   targets, track taps, travel (LTR, RTL, vertical), coincident thumbs,
 *   the coast, and a cancel's single `onChangeEnd`
 * @position Testing: the unit layer of useSliderTouch.ts. The browser layer
 *   is __tests__/SliderTouch.interaction.browser.spec.ts.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react';
import {useState, type ReactElement} from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';
import {Slider} from './Slider';
import {getGestureHost} from '../gestures/GestureHost';
import {PanGestureRecognizer} from '../gestures/PanGestureRecognizer';
import {projectDistance} from '../motion/projection';
import type * as HapticsModule from '../gestures/haptics';
import {slider as UIKIT_SLIDER} from '../motion/uikit/slider';

/** The control's stubbed layout: 300 px long at x = 0 (or y = 0). */
const LENGTH = 300;

// The end haptic is a spy: the browser's vibration is not observable here.
const haptics = vi.hoisted(() => ({playHaptic: vi.fn()}));
vi.mock('../gestures/haptics', async importOriginal => ({
  ...(await importOriginal<typeof HapticsModule>()),
  playHaptic: haptics.playHaptic,
}));

interface Contact {
  id: number;
  x: number;
  y: number;
}

function touch(
  type: 'touchstart' | 'touchmove' | 'touchend',
  target: Element,
  contact: Contact,
  time: number,
): void {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const point = {
    identifier: contact.id,
    clientX: contact.x,
    clientY: contact.y,
    target,
  };
  Object.defineProperty(event, 'changedTouches', {value: [point]});
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [point],
  });
  Object.defineProperty(event, 'timeStamp', {value: time});
  act(() => {
    target.dispatchEvent(event);
  });
}

/** One pen event (pointer events only: a pen sends no touch events). */
function pen(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  target: Element,
  x: number,
  y: number,
  time: number,
): void {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperties(event, {
    pointerId: {value: 7},
    pointerType: {value: 'pen'},
    isPrimary: {value: true},
    clientX: {value: x},
    clientY: {value: y},
    button: {value: type === 'pointermove' ? -1 : 0},
    buttons: {value: type === 'pointerup' ? 0 : 1},
    pressure: {value: type === 'pointerup' ? 0 : 0.5},
    width: {value: 1},
    height: {value: 1},
    timeStamp: {value: time},
  });
  act(() => {
    target.dispatchEvent(event);
  });
}

/**
 * Event timestamps keep increasing across tests: the document's gesture
 * host outlives each render, and its velocity filter reads the timestamps.
 */
let clock = 1000;
const nextStart = () => (clock += 10_000);

/** One finger from `from` by `dx`, `dy` in `steps` moves 16 ms apart. */
function dragThumb(
  hit: Element,
  from: {x: number; y: number},
  {dx = 0, dy = 0, steps = 10, start = nextStart(), lift = true} = {},
): number {
  touch('touchstart', hit, {id: 1, ...from}, start);
  let t = start;
  for (let i = 1; i <= steps; i++) {
    t += 16;
    touch(
      'touchmove',
      hit,
      {id: 1, x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps},
      t,
    );
  }
  if (lift) {
    t += 4;
    touch('touchend', hit, {id: 1, x: from.x + dx, y: from.y + dy}, t);
  }
  return t;
}

/** A coarse (a finger) or a fine (a mouse) primary pointer. */
function stubMatchMedia(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: coarse && query.includes('pointer: coarse'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** Gives every slider control a 300 px layout box. */
function stubControlGeometry(vertical = false, length = LENGTH) {
  stubTouchAction();
  const rect = vertical
    ? {left: 0, top: 0, right: 24, bottom: length, width: 24, height: length}
    : {left: 0, top: 0, right: length, bottom: 24, width: length, height: 24};
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains('astryx-slider-control')) {
        return {...rect, x: rect.left, y: rect.top, toJSON: () => rect};
      }
      return original.call(this);
    },
  );
}

function Controlled({
  initial,
  onChange,
  onChangeEnd,
  orientation,
  valueDisplay = 'none',
}: {
  initial: number | [number, number];
  onChange?: (value: number | [number, number]) => void;
  onChangeEnd?: (value: number | [number, number]) => void;
  orientation?: 'horizontal' | 'vertical';
  valueDisplay?: 'none' | 'tooltip' | 'text';
}) {
  const [value, setValue] = useState<number | [number, number]>(initial);
  const report = (next: number | [number, number]) => {
    onChange?.(next);
    setValue(next);
  };
  return Array.isArray(value) ? (
    <Slider
      label="Level"
      valueDisplay={valueDisplay}
      orientation={orientation}
      value={value}
      onChange={report}
      onChangeEnd={onChangeEnd}
    />
  ) : (
    <Slider
      label="Level"
      valueDisplay={valueDisplay}
      orientation={orientation}
      value={value}
      onChange={report}
      onChangeEnd={onChangeEnd}
    />
  );
}

/**
 * jsdom drops `touch-action` from styles, so report what the gesture host
 * sets on a thumb. A pan along the travel leaves the browser the cross axis.
 */
function stubTouchAction() {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    (element: Element, pseudo?: string | null) => {
      const style = original(element, pseudo);
      if (
        element.classList.contains('astryx-slider-control') &&
        document.documentElement.getAttribute('dir') === 'rtl'
      ) {
        return new Proxy(style, {
          get(target, key): string | number | object | null | undefined {
            if (key === 'direction') {
              return 'rtl';
            }
            const value = Reflect.get(target, key) as
              string | number | object | null | undefined;
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      }
      if (element.getAttribute('role') !== 'slider') {
        return style;
      }
      const vertical = element.getAttribute('aria-orientation') === 'vertical';
      const touchAction = vertical ? 'pan-x pinch-zoom' : 'pan-y pinch-zoom';
      return new Proxy(style, {
        get(target, key): string | number | object | null | undefined {
          if (key === 'touchAction') {
            return touchAction;
          }
          if (key === 'getPropertyValue') {
            return (name: string) =>
              name === 'touch-action'
                ? touchAction
                : target.getPropertyValue(name);
          }
          const value = Reflect.get(target, key) as
            string | number | object | null | undefined;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  );
}

// A thumb takes a finger itself. Under a coarse primary pointer its
// `::before` is the touch target, drawn from the insets it carries.
const hitOf = (thumb: HTMLElement) => thumb;
const drawsTouchTarget = (thumb: HTMLElement) =>
  thumb.style.getPropertyValue('--_slider-hit-top') !== '';

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('dir');
});

/**
 * Renders, then flushes the effects that attach the touch presentation to the
 * thumbs.
 */
async function renderTouch(ui: ReactElement): Promise<RenderResult> {
  const view = render(ui);
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

describe('Slider touch presentation (UISlider tracking)', () => {
  it('draws the thumbs’ touch targets only under a coarse primary pointer, with no element of their own', async () => {
    stubMatchMedia(false);
    const {unmount} = await renderTouch(<Controlled initial={50} />);
    const fine = screen.getByRole('slider');
    expect(drawsTouchTarget(fine)).toBe(false);
    const fineCount = fine.querySelectorAll('*').length;
    unmount();
    stubMatchMedia(true);
    await renderTouch(<Controlled initial={[20, 80]} />);
    for (const thumb of screen.getAllByRole('slider')) {
      expect(drawsTouchTarget(thumb)).toBe(true);
      expect(thumb.querySelectorAll('*').length).toBe(fineCount);
    }
  });

  it('gives every touch screen the same touch presentation, whatever its engine (one touch model)', async () => {
    stubMatchMedia(true);
    // No -webkit-touch-callout here, as on Android's Chromium: the touch
    // presentation keys on the coarse pointer alone.
    vi.stubGlobal('CSS', {supports: () => false});
    stubControlGeometry();
    const onChange = vi.fn();
    await renderTouch(<Controlled initial={50} onChange={onChange} />);
    expect(drawsTouchTarget(screen.getByRole('slider'))).toBe(true);
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    fireEvent.pointerDown(control, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 280,
      clientY: 12,
    });
    fireEvent.pointerUp(control, {pointerId: 1, pointerType: 'touch'});
    // The pointer handlers leave the finger to the touch presentation.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('under a coarse primary pointer (a mouse on a touch device): ignores a finger on the track, while the mouse still moves the value there', async () => {
    stubMatchMedia(true);
    expect(matchMedia('(pointer: coarse)').matches).toBe(true);
    stubControlGeometry();
    const onChange = vi.fn();
    await renderTouch(<Controlled initial={50} onChange={onChange} />);
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    fireEvent.pointerDown(control, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 280,
      clientY: 12,
    });
    fireEvent.pointerUp(control, {pointerId: 1, pointerType: 'touch'});
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerDown(control, {
      pointerId: 2,
      pointerType: 'mouse',
      clientX: 280,
      clientY: 12,
      button: 0,
    });
    fireEvent.pointerUp(control, {pointerId: 2, pointerType: 'mouse'});
    expect(onChange).toHaveBeenCalled();
  });

  it.each([
    {name: 'left to right', dir: 'ltr', dx: 70, expected: 50 + 20},
    {name: 'right to left', dir: 'rtl', dx: -70, expected: 50 + 20},
  ])(
    '$name: the value moves by the travel past the 10 px threshold over the track length',
    async ({dir, dx, expected}) => {
      stubMatchMedia(true);
      stubControlGeometry();
      document.documentElement.setAttribute('dir', dir);
      const onChange = vi.fn();
      await renderTouch(<Controlled initial={50} onChange={onChange} />);
      const thumb = screen.getByRole('slider');
      dragThumb(hitOf(thumb), {x: 150, y: 12}, {dx, lift: false});
      // (70 − 10) px of 300 px is 20 % of the range.
      expect(thumb).toHaveAttribute('aria-valuenow', String(expected));
      // The press itself and the first 10 px move nothing.
      expect(onChange.mock.calls[0]?.[0]).toBe(51);
    },
  );

  it('vertical: an upward drag raises the value', async () => {
    stubMatchMedia(true);
    stubControlGeometry(true);
    await renderTouch(<Controlled initial={50} orientation="vertical" />);
    const thumb = screen.getByRole('slider');
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    // The control's used height when the stylesheet gives one, else the
    // stubbed box.
    const height = getComputedStyle(control).height;
    const length = height.endsWith('px') ? parseFloat(height) : LENGTH;
    dragThumb(hitOf(thumb), {x: 12, y: 150}, {dy: -40, lift: false});
    expect(thumb).toHaveAttribute(
      'aria-valuenow',
      String(50 + Math.round(((40 - 10) / length) * 100)),
    );
  });

  it('coincident range thumbs: the first movement picks the thumb that can follow it', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    await renderTouch(<Controlled initial={[40, 40]} />);
    const [low, high] = screen.getAllByRole('slider');
    // The thumb on top (the second) takes the finger. Dragging toward min
    // moves the first.
    dragThumb(hitOf(high), {x: 120, y: 12}, {dx: -40, lift: false});
    expect(low).toHaveAttribute('aria-valuenow', '30');
    expect(high).toHaveAttribute('aria-valuenow', '40');
  });

  it('vetoes an ancestor pan along the travel for a touch on a thumb, not one across it', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const {container} = await renderTouch(<Controlled initial={50} />);
    const host = getGestureHost(document);
    // It would begin first (4 px against the thumb's 10 px) if not vetoed.
    const along = new PanGestureRecognizer({
      direction: 'horizontal',
      hysteresis: 4,
    });
    const across = new PanGestureRecognizer({direction: 'vertical'});
    const states: string[] = [];
    along.addListener(pan => states.push(`along:${pan.state}`));
    across.addListener(pan => states.push(`across:${pan.state}`));
    const detachAlong = host.attach(container, along);
    const thumb = screen.getByRole('slider');
    // A horizontal drag from the thumb: the slider's, never the pager's.
    dragThumb(hitOf(thumb), {x: 150, y: 12}, {dx: 60});
    expect(states.filter(state => state.startsWith('along'))).toEqual([]);
    expect(thumb).not.toHaveAttribute('aria-valuenow', '50');
    detachAlong();
    // A vertical drag from the thumb: the ancestor's vertical pan takes it.
    const detachAcross = host.attach(container, across);
    dragThumb(hitOf(thumb), {x: 150, y: 12}, {dy: 60});
    expect(states).toContain('across:began');
    detachAcross();
  });

  it('a tap on the thumb changes nothing and reports one onChangeEnd', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={50} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const hit = hitOf(screen.getByRole('slider'));
    const start = nextStart();
    touch('touchstart', hit, {id: 1, x: 150, y: 12}, start);
    touch('touchend', hit, {id: 1, x: 150, y: 12}, start + 60);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(50);
  });

  it('commits nothing for a pen press that a window blur cancels, on the thumb or on the track, at its later lift either (spec:AST-094 FR44)', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={50} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const hit = hitOf(screen.getByRole('slider'));
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    for (const [target, x] of [
      [hit, 150],
      [control, 250],
    ] as const) {
      const start = nextStart();
      pen('pointerdown', target, x, 12, start);
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      pen('pointerup', target, x, 12, start + 80);
      act(() => {
        target.dispatchEvent(
          new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
        );
      });
      for (let frame = 0; frame < 40; frame++) {
        await act(async () => {
          vi.advanceTimersByTime(16);
        });
      }
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
  });

  it('commits nothing for a pen press that a window blur cancels under a fine primary pointer too (spec:AST-094 FR44)', async () => {
    stubMatchMedia(false);
    stubControlGeometry();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={50} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const hit = hitOf(screen.getByRole('slider'));
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    for (const [target, x] of [
      [hit, 150],
      [control, 250],
    ] as const) {
      const start = nextStart();
      pen('pointerdown', target, x, 12, start);
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
      // The microtask after the blur, where an armed press's listeners go.
      await act(async () => {
        await Promise.resolve();
      });
      pen('pointerup', target, x, 12, start + 80);
      act(() => {
        target.dispatchEvent(
          new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}),
        );
      });
      for (let frame = 0; frame < 40; frame++) {
        await act(async () => {
          vi.advanceTimersByTime(16);
        });
      }
    }
    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
  });

  it('fires onChangeEnd once, from the end of the touch, never again on a later render', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChangeEnd = vi.fn();
    const {rerender} = await renderTouch(
      <Slider
        label="Level"
        valueDisplay="none"
        value={50}
        onChange={() => {}}
        onChangeEnd={onChangeEnd}
      />,
    );
    const hit = hitOf(screen.getByRole('slider'));
    const start = nextStart();
    touch('touchstart', hit, {id: 1, x: 150, y: 12}, start);
    touch('touchend', hit, {id: 1, x: 150, y: 12}, start + 60);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    // A later render that changes Slider's own callbacks (single to range)
    // is not a second interaction.
    rerender(
      <Slider
        label="Level"
        valueDisplay="none"
        value={[20, 80]}
        onChange={() => {}}
        onChangeEnd={onChangeEnd}
      />,
    );
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
  });

  it('sets the value from a tap on the track when the finger lifts, the thumb springing there (WCAG 2.5.7)', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={50} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    const start = nextStart();
    touch('touchstart', control, {id: 1, x: 250, y: 12}, start);
    // Nothing moves while the finger is down: a tap sets the value on lift.
    expect(onChange).not.toHaveBeenCalled();
    touch('touchend', control, {id: 1, x: 250, y: 12}, start + 80);
    // Frame by frame, as a browser renders the owner between frames.
    for (let frame = 0; frame < 100; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    // (250 - 10) / (300 - 20) of the range.
    expect(onChange).toHaveBeenLastCalledWith(86);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(86);
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '86');
  });

  it('plays no end haptic for a tap on the track that sets an end: only a drag and its coast play it', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    haptics.playHaptic.mockClear();
    const onChangeEnd = vi.fn();
    await renderTouch(<Controlled initial={50} onChangeEnd={onChangeEnd} />);
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    const start = nextStart();
    // A tap at the track's far end sets the maximum, as UISlider never does
    // from a tap, so no haptic plays.
    touch('touchstart', control, {id: 1, x: 299, y: 12}, start);
    touch('touchend', control, {id: 1, x: 299, y: 12}, start + 80);
    for (let frame = 0; frame < 100; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(onChangeEnd).toHaveBeenLastCalledWith(100);
    expect(haptics.playHaptic).not.toHaveBeenCalled();
    // A drag from there into the minimum plays it once.
    dragThumb(
      hitOf(screen.getByRole('slider')),
      {x: 290, y: 12},
      {
        dx: -300,
        steps: 10,
      },
    );
    for (let frame = 0; frame < 100; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(onChangeEnd).toHaveBeenLastCalledWith(0);
    expect(haptics.playHaptic).toHaveBeenCalledTimes(1);
  });

  it('sets nothing from a touch on the track that moves away before lifting (a swipe)', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    await renderTouch(<Controlled initial={50} onChange={onChange} />);
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    const start = nextStart();
    // Past the pan's 10 px threshold, the touch is no tap (in a browser the
    // page takes it to scroll).
    touch('touchstart', control, {id: 1, x: 250, y: 12}, start);
    touch('touchmove', control, {id: 1, x: 250, y: 26}, start + 40);
    touch('touchend', control, {id: 1, x: 250, y: 26}, start + 80);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('takes a pen as it takes a finger: on a thumb the value follows its travel, and a tap on the track sets the value on its lift', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    await renderTouch(<Controlled initial={50} onChange={onChange} />);
    // On the thumb the value follows the pen's travel past the threshold:
    // 50 + (60 - 10) / 300 × 100.
    const thumb = screen.getByRole('slider');
    const hit = hitOf(thumb);
    let t = nextStart();
    pen('pointerdown', hit, 150, 12, t);
    for (let i = 1; i <= 10; i++) {
      pen('pointermove', hit, 150 + 6 * i, 12, t + 16 * i);
    }
    expect(onChange).toHaveBeenLastCalledWith(67);
    // A pen rests before it lifts. So nothing coasts.
    pen('pointerup', hit, 210, 12, t + 400);
    for (let frame = 0; frame < 100; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    // A pen's tap on the track sets the value on its lift, as a finger's
    // does. The value is (280 - 10) / (300 - 20) of the range.
    const control = document.querySelector(
      '.astryx-slider-control',
    ) as HTMLElement;
    t = nextStart();
    pen('pointerdown', control, 280, 12, t);
    pen('pointerup', control, 280, 12, t + 60);
    for (let frame = 0; frame < 100; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(onChange).toHaveBeenLastCalledWith(96);
    expect(thumb).toHaveAttribute('aria-valuenow', '96');
  });

  it('re-attaches the thumbs’ gestures when a valueDisplay change remounts them', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    const view = await renderTouch(
      <Controlled initial={50} onChange={onChange} />,
    );
    // Wrapping each thumb in its value tooltip mounts new thumbs and new
    // touch targets.
    view.rerender(
      <Controlled initial={50} onChange={onChange} valueDisplay="tooltip" />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const thumb = screen.getByRole('slider');
    dragThumb(hitOf(thumb), {x: 150, y: 12}, {dx: 60, steps: 10, lift: false});
    expect(onChange).toHaveBeenLastCalledWith(67);
  });

  it('moves the thumb under the finger off the render path: it follows even when the owner renders nothing (spec:AST-094 FR9)', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    // The owner keeps its value: no render follows any move.
    await renderTouch(
      <Slider
        label="Level"
        valueDisplay="none"
        value={50}
        onChange={onChange}
      />,
    );
    const thumb = screen.getByRole('slider');
    dragThumb(hitOf(thumb), {x: 150, y: 12}, {dx: 60, steps: 10, lift: false});
    expect(onChange).toHaveBeenLastCalledWith(67);
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    // Yet the thumb stands at 67's place along the 280 px travel, written
    // straight to its translate.
    expect(parseFloat(thumb.style.translate)).toBeCloseTo(0.67 * 280, 1);
  });

  it('moves no value on a collapsed track: a drag and its release on 0 px keep the value', async () => {
    stubMatchMedia(true);
    stubControlGeometry(false, 0);
    const onChange = vi.fn();
    await renderTouch(<Controlled initial={50} onChange={onChange} />);
    const thumb = screen.getByRole('slider');
    dragThumb(hitOf(thumb), {x: 0, y: 12}, {dx: 60, steps: 10});
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange.mock.calls.filter(([value]) => value !== 50)).toEqual([]);
    expect(thumb).toHaveAttribute('aria-valuenow', '50');
    expect(thumb.style.translate).not.toContain('NaN');
  });

  it('follows the track through the page’s one shared ResizeObserver, not one per slider', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    let created = 0;
    class CountingObserver {
      constructor() {
        created += 1;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', CountingObserver);
    try {
      await renderTouch(
        <>
          <Slider label="One" valueDisplay="none" value={20} />
          <Slider label="Two" valueDisplay="none" value={80} />
        </>,
      );
      expect(screen.getAllByRole('slider')).toHaveLength(2);
      expect(created).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('ends a touch silently when the slider unmounts mid-drag', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    const view = await renderTouch(
      <Slider
        label="Level"
        valueDisplay="none"
        value={50}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />,
    );
    dragThumb(
      hitOf(screen.getByRole('slider')),
      {x: 150, y: 12},
      {
        dx: 60,
        lift: false,
      },
    );
    expect(onChange).toHaveBeenCalled();
    onChange.mockClear();
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
    expect(
      errors.mock.calls.filter(call => String(call[0]).includes('flushSync')),
    ).toEqual([]);
    errors.mockRestore();
  });

  it('cancels a drag when the slider is disabled mid-drag: onChangeEnd fires once, with the value the owner rendered', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    const slider = (isDisabled: boolean) => (
      <Slider
        label="Level"
        valueDisplay="none"
        value={50}
        isDisabled={isDisabled}
        onChange={onChange}
        onChangeEnd={onChangeEnd}
      />
    );
    const view = await renderTouch(slider(false));
    const thumb = screen.getByRole('slider');
    dragThumb(hitOf(thumb), {x: 150, y: 12}, {dx: 60, lift: false});
    expect(onChange).toHaveBeenCalled();
    onChange.mockClear();
    view.rerender(slider(true));
    await act(async () => {
      await Promise.resolve();
    });
    // The owner kept 50, so the cancelled drag ends there.
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(50);
    expect(onChange).not.toHaveBeenCalled();
    // The finger's lift finds nothing left to end.
    fireEvent.pointerUp(thumb, {pointerId: 1, pointerType: 'touch'});
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(
      errors.mock.calls.filter(call => String(call[0]).includes('flushSync')),
    ).toEqual([]);
    errors.mockRestore();
  });

  it('a slider unmounted mid-coast stops silently', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    const view = await renderTouch(
      <Controlled initial={20} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    dragThumb(
      hitOf(screen.getByRole('slider')),
      {x: 60, y: 12},
      {
        dx: 80,
        steps: 5,
      },
    );
    // Two frames into the coast, before it reports (from its fourth frame).
    await act(async () => {
      vi.advanceTimersByTime(40);
    });
    expect(onChangeEnd).not.toHaveBeenCalled();
    onChange.mockClear();
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  it('a release coasts to 0.4 of the momentum projection, then onChangeEnd reports once', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    // jsdom has no Web Animations: a running stand-in. So the coast lasts
    // its curve (the animator settles it on its own clock).
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () =>
        ({
          finished: new Promise<never>(() => {}),
          cancel: () => {},
          startTime: null,
        }) as unknown as Animation,
    });
    onTestFinished(() => {
      delete (HTMLElement.prototype as {animate?: unknown}).animate;
    });
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={20} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const thumb = screen.getByRole('slider');
    // 10 moves of 6 px, 16 ms apart: 375 px/s at the lift.
    dragThumb(hitOf(thumb), {x: 60, y: 12}, {dx: 60, steps: 10});
    const liftValue = 20 + Math.round(((60 - 10) / LENGTH) * 100);
    const velocity = 6 / 0.016;
    const target = Math.round(
      liftValue +
        ((UIKIT_SLIDER.releaseProjectionShare *
          projectDistance(velocity, UIKIT_SLIDER.releaseProjectionRate)) /
          LENGTH) *
          100,
    );
    expect(target).toBeGreaterThan(liftValue);
    expect(onChangeEnd).not.toHaveBeenCalled();
    for (let i = 0; i < 120; i++) {
      // Async. So the coast's completion (a promise) runs between frames.
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(thumb).toHaveAttribute('aria-valuenow', String(target));
    expect(onChange).toHaveBeenLastCalledWith(target);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(target);
    // Handed back to the stylesheet: no inline translate is left.
    expect(thumb.style.translate).toBe('');
  });

  it('a pen lifted while it moves ends its drag at the release, with no coast (component:Slider FR7)', async () => {
    stubMatchMedia(true);
    stubControlGeometry();
    // A running stand-in, as for the finger's coast: a coast that started
    // would carry the value on.
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: () =>
        ({
          finished: new Promise<never>(() => {}),
          cancel: () => {},
          startTime: null,
        }) as unknown as Animation,
    });
    onTestFinished(() => {
      delete (HTMLElement.prototype as {animate?: unknown}).animate;
    });
    const onChange = vi.fn();
    const onChangeEnd = vi.fn();
    await renderTouch(
      <Controlled initial={20} onChange={onChange} onChangeEnd={onChangeEnd} />,
    );
    const thumb = screen.getByRole('slider');
    const hit = hitOf(thumb);
    // Ten moves of 6 px, 16 ms apart, then the lift 16 ms later. That is
    // 375 px/s at the lift, which a finger's release would coast on.
    const t = nextStart();
    pen('pointerdown', hit, 60, 12, t);
    for (let i = 1; i <= 10; i++) {
      pen('pointermove', hit, 60 + 6 * i, 12, t + 16 * i);
    }
    const liftValue = 20 + Math.round(((60 - 10) / LENGTH) * 100);
    expect(onChange).toHaveBeenLastCalledWith(liftValue);
    pen('pointerup', hit, 120, 12, t + 16 * 11);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(onChangeEnd).toHaveBeenCalledWith(liftValue);
    for (let frame = 0; frame < 120; frame++) {
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
    }
    expect(thumb).toHaveAttribute('aria-valuenow', String(liftValue));
    expect(onChange).toHaveBeenLastCalledWith(liftValue);
    expect(onChangeEnd).toHaveBeenCalledTimes(1);
    expect(thumb.style.translate).toBe('');
  });
});
