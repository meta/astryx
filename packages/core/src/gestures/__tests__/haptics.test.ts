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
    stubVibrate(() => {
      throw new Error('blocked');
    });
    expect(playHaptic('selection')).toBe(false);
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

  it('hands focus back from the switch, so a later key never toggles it', () => {
    document.body.innerHTML = '<input id="field" /><label id="tap">Tap</label>';
    const label = document.getElementById('tap') as HTMLLabelElement;
    const field = document.getElementById('field') as HTMLInputElement;
    const release = attachTapHaptic(label);
    const sw = label.querySelector(
      `[${HAPTIC_SWITCH_ATTRIBUTE}]`,
    ) as HTMLInputElement;
    field.focus();
    // The label's activation focuses its control.
    sw.focus();
    expect(document.activeElement).toBe(field);
    field.blur();
    sw.focus();
    expect(document.activeElement).not.toBe(sw);
    release();
  });

  it('gives no switch to a label that already labels another control', () => {
    document.body.innerHTML =
      '<label id="tap"><button id="go" type="button">Go</button></label>';
    const label = document.getElementById('tap') as HTMLLabelElement;
    const release = attachTapHaptic(label);
    expect(label.querySelector(`[${HAPTIC_SWITCH_ATTRIBUTE}]`)).toBeNull();
    expect(label.control).toBe(document.getElementById('go'));
    release();
  });

  it('reports whether the browser knows the switch control', () => {
    // jsdom has no `switch` property on checkbox inputs, like browsers
    // before Safari 17.4.
    expect(supportsSwitchControl(document)).toBe(false);
  });
});
