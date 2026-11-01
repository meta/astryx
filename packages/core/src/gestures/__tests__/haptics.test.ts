// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file haptics.test.ts
 * @input playHaptic, attachTapHaptic and the support probes, with
 *   navigator.vibrate stubbed or absent, in jsdom
 * @output Vibration patterns per feedback kind where the platform vibrates,
 *   nothing where it does not; the hidden switch iOS Safari plays its tap
 *   haptic on: hidden from layout, touch and assistive technology, its click
 *   and change kept inside, removed on release
 * @position Unit tests of packages/core/src/gestures/haptics.ts
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  HAPTIC_FEEDBACK_KINDS,
  HAPTIC_VIBRATION_PATTERNS,
} from '../../motion/uikit/gestures';
import {
  attachTapHaptic,
  canVibrate,
  HAPTIC_SWITCH_ATTRIBUTE,
  playHaptic,
  supportsSwitchControl,
} from '../haptics';

const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

function stubVibrate(implementation: (pattern: number[]) => boolean) {
  const vibrate = vi.fn(implementation);
  Object.defineProperty(navigator, 'vibrate', {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

afterEach(() => {
  if (original == null) {
    delete (navigator as {vibrate?: unknown}).vibrate;
  } else {
    Object.defineProperty(navigator, 'vibrate', original);
  }
  document.body.innerHTML = '';
});

describe('playHaptic', () => {
  it('vibrates each feedback kind with its own pattern', () => {
    const vibrate = stubVibrate(() => true);
    expect(canVibrate()).toBe(true);
    for (const kind of HAPTIC_FEEDBACK_KINDS) {
      expect(playHaptic(kind)).toBe(true);
      expect(vibrate).toHaveBeenLastCalledWith([
        ...HAPTIC_VIBRATION_PATTERNS[kind].value,
      ]);
    }
  });

  it('plays nothing where the platform cannot vibrate, or refuses', () => {
    delete (navigator as {vibrate?: unknown}).vibrate;
    expect(canVibrate()).toBe(false);
    expect(playHaptic('impactLight')).toBe(false);
    stubVibrate(() => false);
    expect(playHaptic('selection')).toBe(false);
  });

  it('lets an error from the platform through: a vibrate that throws is not a refusal', () => {
    stubVibrate(() => {
      throw new Error('blocked');
    });
    expect(() => playHaptic('selection')).toThrow('blocked');
  });
});

describe('attachTapHaptic', () => {
  it('gives the label a hidden switch that keeps its own events inside', () => {
    document.body.innerHTML = '<label id="tap">Tap</label>';
    const label = document.getElementById('tap') as HTMLLabelElement;
    const onClick = vi.fn();
    const onChange = vi.fn();
    label.addEventListener('click', onClick);
    label.addEventListener('change', onChange);

    const release = attachTapHaptic(label);
    const input = label.querySelector(`[${HAPTIC_SWITCH_ATTRIBUTE}]`);
    expect(input).toBeInstanceOf(HTMLInputElement);
    const sw = input as HTMLInputElement;
    expect(sw.type).toBe('checkbox');
    expect(sw.hasAttribute('switch')).toBe(true);
    expect(sw.getAttribute('aria-hidden')).toBe('true');
    expect(sw.tabIndex).toBe(-1);
    // It never takes the touch itself, so a pan starting on it still
    // scrolls, and it takes no room.
    expect(sw.style.pointerEvents).toBe('none');
    expect(sw.style.position).toBe('absolute');

    // The switch toggling (the label's activation) does not reach the
    // control as a second click or a change.
    sw.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    release();
    expect(label.querySelector(`[${HAPTIC_SWITCH_ATTRIBUTE}]`)).toBeNull();
  });

  it('never leaves the focus on its hidden switch', () => {
    document.body.innerHTML =
      '<button id="before">Before</button><label id="tap">Tap</label>';
    const before = document.getElementById('before') as HTMLButtonElement;
    const label = document.getElementById('tap') as HTMLLabelElement;
    const release = attachTapHaptic(label);
    const sw = label.querySelector<HTMLInputElement>(
      `[${HAPTIC_SWITCH_ATTRIBUTE}]`,
    )!;
    before.focus();
    // Chromium focuses a label's control on its activation.
    sw.focus();
    expect(document.activeElement).not.toBe(sw);
    expect(document.activeElement).toBe(before);
    release();
  });

  it('keeps a label\u2019s own control: the tap plays and the control still toggles', () => {
    document.body.innerHTML =
      '<label id="tap"><input id="own" type="checkbox"> Remember me</label>';
    const label = document.getElementById('tap') as HTMLLabelElement;
    const own = document.getElementById('own') as HTMLInputElement;
    const onOwnClick = vi.fn();
    own.addEventListener('click', onOwnClick);
    const release = attachTapHaptic(label);
    const sw = label.querySelector<HTMLInputElement>(
      `[${HAPTIC_SWITCH_ATTRIBUTE}]`,
    )!;
    // The switch takes the label's activation, so a tap plays.
    expect(label.control).toBe(sw);
    // The checkbox keeps its name: the label's text, through aria-labelledby.
    expect(own).toHaveAccessibleName('Remember me');
    sw.click();
    expect(sw.checked).toBe(true);
    expect(own.checked).toBe(true);
    expect(onOwnClick).toHaveBeenCalledTimes(1);
    release();
    expect(label.control).toBe(own);
    expect(own).not.toHaveAttribute('aria-labelledby');
  });

  it('gives a disabled control no feedback and leaves no focus on the switch (FR23)', () => {
    document.body.innerHTML =
      '<button id="before">Before</button>' +
      '<label id="tap"><input id="own" type="checkbox" disabled> Remember me</label>';
    const before = document.getElementById('before') as HTMLButtonElement;
    const label = document.getElementById('tap') as HTMLLabelElement;
    const own = document.getElementById('own') as HTMLInputElement;
    const release = attachTapHaptic(label);
    const sw = label.querySelector<HTMLInputElement>(
      `[${HAPTIC_SWITCH_ATTRIBUTE}]`,
    )!;
    before.focus();
    sw.focus();
    sw.click();
    // The switch did not toggle (nothing plays), the control did not change,
    // and focus is not stranded on the hidden switch.
    expect(sw.checked).toBe(false);
    expect(own.checked).toBe(false);
    expect(document.activeElement).toBe(before);
    release();
  });

  it('leaves a label whose control is already a switch, or tied by for, as it is', () => {
    document.body.innerHTML =
      '<label id="a"><input type="checkbox" switch> Wi-Fi</label>' +
      '<label id="b" for="c">Bluetooth</label><input id="c" type="checkbox">';
    for (const id of ['a', 'b']) {
      const label = document.getElementById(id) as HTMLLabelElement;
      const release = attachTapHaptic(label);
      expect(label.querySelector(`[${HAPTIC_SWITCH_ATTRIBUTE}]`)).toBeNull();
      release();
    }
  });

  it('reports whether the browser knows the switch control', () => {
    // jsdom has no `switch` property on checkbox inputs, like browsers
    // before Safari 17.4.
    expect(supportsSwitchControl(document)).toBe(false);
  });
});
