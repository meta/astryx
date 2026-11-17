// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useHotkeys.test.ts
 * @input Uses vitest, @testing-library/react, useHotkeys hook
 * @output Unit tests for useHotkeys hook
 * @position Testing; validates useHotkeys.ts implementation
 *
 * SYNC: When useHotkeys.ts changes, update tests to match new behavior
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import {renderHook} from '@testing-library/react';
import {useHotkeys, type Hotkey} from './useHotkeys';

function stubApplePlatform() {
  // jsdom's navigator has no userAgentData; platform drives detection.
  vi.stubGlobal('navigator', {platform: 'MacIntel'});
}

function stubOtherPlatform() {
  vi.stubGlobal('navigator', {platform: 'Win32'});
}

function press(
  key: string,
  init: KeyboardEventInit & {target?: HTMLElement} = {},
): KeyboardEvent {
  const {target, ...eventInit} = init;
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...eventInit,
  });
  (target ?? window).dispatchEvent(event);
  return event;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('useHotkeys', () => {
  it('fires on mod+k via metaKey on Apple platforms', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    renderHook(() => useHotkeys([{keys: 'mod+k', onPress}]));

    const event = press('k', {metaKey: true});
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('maps mod to ctrlKey on non-Apple platforms', () => {
    stubOtherPlatform();
    const onPress = vi.fn();
    renderHook(() => useHotkeys([{keys: 'mod+k', onPress}]));

    press('k', {metaKey: true});
    expect(onPress).not.toHaveBeenCalled();

    press('k', {ctrlKey: true});
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire a bare key when modifiers are held', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    renderHook(() => useHotkeys([{keys: 'k', onPress}]));

    press('k', {metaKey: true});
    press('k', {ctrlKey: true});
    press('k', {altKey: true});
    expect(onPress).not.toHaveBeenCalled();

    press('k');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('matches named keys: escape, enter, space, arrows', () => {
    stubApplePlatform();
    const onEscape = vi.fn();
    const onEnter = vi.fn();
    const onSpace = vi.fn();
    const onDown = vi.fn();
    renderHook(() =>
      useHotkeys([
        {keys: 'escape', onPress: onEscape},
        {keys: 'enter', onPress: onEnter},
        {keys: 'space', onPress: onSpace},
        {keys: 'down', onPress: onDown},
      ]),
    );

    press('Escape');
    press('Enter');
    press(' ');
    press('ArrowDown');
    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onSpace).toHaveBeenCalledTimes(1);
    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it('requires shift when specified and ignores shift otherwise', () => {
    stubApplePlatform();
    const onSlash = vi.fn();
    const onLetter = vi.fn();
    renderHook(() =>
      useHotkeys([
        {keys: 'shift+/', onPress: onSlash},
        {keys: 'c', onPress: onLetter},
      ]),
    );

    press('/');
    expect(onSlash).not.toHaveBeenCalled();
    press('/', {shiftKey: true});
    expect(onSlash).toHaveBeenCalledTimes(1);

    // Shift not specified → matches regardless of shift state.
    press('C', {shiftKey: true});
    press('c');
    expect(onLetter).toHaveBeenCalledTimes(2);
  });

  it('skips typing targets by default', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    renderHook(() => useHotkeys([{keys: 'mod+k', onPress}]));

    const input = document.createElement('input');
    document.body.appendChild(input);
    press('k', {metaKey: true, target: input});
    expect(onPress).not.toHaveBeenCalled();

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    press('k', {metaKey: true, target: textarea});
    expect(onPress).not.toHaveBeenCalled();
  });

  it('fires in typing targets when allowInInputs is true', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    renderHook(() =>
      useHotkeys([{keys: 'escape', onPress, allowInInputs: true}]),
    );

    const input = document.createElement('input');
    document.body.appendChild(input);
    press('Escape', {target: input});
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('respects isDisabled', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    const {rerender} = renderHook(
      ({isDisabled}: {isDisabled: boolean}) =>
        useHotkeys([{keys: 'mod+k', onPress, isDisabled}]),
      {initialProps: {isDisabled: true}},
    );

    press('k', {metaKey: true});
    expect(onPress).not.toHaveBeenCalled();

    rerender({isDisabled: false});
    press('k', {metaKey: true});
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('skips events that are already defaultPrevented', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    renderHook(() => useHotkeys([{keys: 'mod+k', onPress}]));

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    stubApplePlatform();
    const onPress = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const {unmount} = renderHook(() => useHotkeys([{keys: 'mod+k', onPress}]));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    press('k', {metaKey: true});
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ignores IME enter keys, but triggers callback on valid enter', () => {
    const onPress = vi.fn();
    renderHook(() =>
      useHotkeys([{keys: 'enter', onPress, allowInInputs: true}]),
    );
    const target = document.createElement('textarea');
    document.body.appendChild(target);
    const compositionEvent = press('Enter', {target, isComposing: true});
    expect(onPress).not.toHaveBeenCalled();
    expect(compositionEvent.defaultPrevented).toBe(false);

    const keyCodeEvent = press('Enter', {target, keyCode: 229});
    expect(onPress).not.toHaveBeenCalled();
    expect(keyCodeEvent.defaultPrevented).toBe(false);

    const validEvent = press('Enter', {target});
    expect(onPress).toHaveBeenCalledExactlyOnceWith(validEvent);
    expect(validEvent.defaultPrevented).toBe(true);
  });

  it('does not re-subscribe on re-render, but uses latest handlers', () => {
    stubApplePlatform();
    const addSpy = vi.spyOn(window, 'addEventListener');
    const first = vi.fn();
    const second = vi.fn();

    const {rerender} = renderHook(
      ({hotkeys}: {hotkeys: Hotkey[]}) => useHotkeys(hotkeys),
      {initialProps: {hotkeys: [{keys: 'mod+k', onPress: first}]}},
    );

    const keydownSubscriptions = () =>
      addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const initialCount = keydownSubscriptions();

    rerender({hotkeys: [{keys: 'mod+k', onPress: second}]});
    rerender({hotkeys: [{keys: 'mod+k', onPress: second}]});
    expect(keydownSubscriptions()).toBe(initialCount);

    press('k', {metaKey: true});
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('only fires the first matching hotkey per event', () => {
    stubApplePlatform();
    const first = vi.fn();
    const second = vi.fn();
    renderHook(() =>
      useHotkeys([
        {keys: 'mod+k', onPress: first},
        {keys: 'mod+k', onPress: second},
      ]),
    );

    press('k', {metaKey: true});
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  describe('alt combos when Option rewrites the typed character (macOS)', () => {
    it('fires alt+a on Option+A, which types "å"', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+a', onPress}]));

      const event = press('å', {code: 'KeyA', altKey: true});
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('fires on the dead keys Option+N, E, U, I and backtick', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() =>
        useHotkeys(
          ['n', 'e', 'u', 'i', '`'].map(key => ({keys: `alt+${key}`, onPress})),
        ),
      );

      // Reported with the IME key code 229 outside composition.
      for (const code of ['KeyN', 'KeyE', 'KeyU', 'KeyI', 'Backquote']) {
        press('Dead', {code, altKey: true, keyCode: 229});
      }
      expect(onPress).toHaveBeenCalledTimes(5);
    });

    it('fires alt+e on Option+E as Safari on macOS reports it on the page body', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+e', onPress}]));

      press('Dead', {code: 'KeyE', keyCode: 69, altKey: true});
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('still ignores a key that composes text with an input method', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+e', onPress}]));

      press('Dead', {code: 'KeyE', altKey: true, isComposing: true});
      press('Process', {code: 'KeyE', altKey: true, keyCode: 229});
      expect(onPress).not.toHaveBeenCalled();
    });

    it('fires alt+1 on Option+1, which types "¡"', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+1', onPress}]));

      press('¡', {code: 'Digit1', altKey: true});
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not fire a combo without alt on the physical key', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'a', onPress}]));

      press('å', {code: 'KeyA', altKey: true});
      press('a', {code: 'KeyA'});
      // Only the plain key: 'a' names no alt, so Option+A does not fire it.
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('keeps layout-following matching for a key that types a plain character', () => {
      stubApplePlatform();
      const onA = vi.fn();
      const onQ = vi.fn();
      renderHook(() =>
        useHotkeys([
          {keys: 'alt+a', onPress: onA},
          {keys: 'alt+q', onPress: onQ},
        ]),
      );

      // A key whose Option character is plain ASCII matches by that character.
      press('a', {code: 'KeyQ', altKey: true});
      expect(onA).toHaveBeenCalledTimes(1);
      expect(onQ).not.toHaveBeenCalled();
    });

    it('follows the US key position on an AZERTY Mac when Option rewrote the character', () => {
      stubApplePlatform();
      const onA = vi.fn();
      const onQ = vi.fn();
      renderHook(() =>
        useHotkeys([
          {keys: 'alt+a', onPress: onA},
          {keys: 'alt+q', onPress: onQ},
        ]),
      );

      // AZERTY: the key labeled A is at the US Q position (KeyQ); Option
      // makes it type "æ".
      press('æ', {code: 'KeyQ', altKey: true});
      expect(onQ).toHaveBeenCalledTimes(1);
      expect(onA).not.toHaveBeenCalled();
    });

    it('fires shifted punctuation named with shift: alt+shift+/ on Option+Shift+/, which types "¿"', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+shift+/', onPress}]));

      press('¿', {code: 'Slash', altKey: true, shiftKey: true});
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('fires alt+space on Option+Space, which types a no-break space', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+space', onPress}]));

      press('\u00a0', {code: 'Space', altKey: true});
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not match the key position for a plain ASCII character Option types (German Mac Option+L types "@")', () => {
      stubApplePlatform();
      const onL = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+l', onPress: onL}]));

      press('@', {code: 'KeyL', altKey: true});
      expect(onL).not.toHaveBeenCalled();
    });

    it('matches the plain ASCII character Option types (German Mac Option+L fires alt+@)', () => {
      stubApplePlatform();
      const onAt = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+@', onPress: onAt}]));

      press('@', {code: 'KeyL', altKey: true});
      expect(onAt).toHaveBeenCalledTimes(1);
    });

    it('does not match the key position for a combo without alt (AZERTY Mac: Digit2 types "é")', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: '2', onPress}]));

      press('é', {code: 'Digit2'});
      expect(onPress).not.toHaveBeenCalled();
    });

    it('does not use the key position on other platforms, so an AltGr letter fires no shortcut', () => {
      stubOtherPlatform();
      const onPress = vi.fn();
      renderHook(() =>
        useHotkeys([{keys: 'ctrl+alt+a', onPress, allowInInputs: true}]),
      );

      // Polish layout: AltGr+A (reported as Ctrl+Alt) types "ą".
      const event = press('ą', {code: 'KeyA', ctrlKey: true, altKey: true});
      expect(onPress).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('stays silent in a text field, as before', () => {
      stubApplePlatform();
      const onPress = vi.fn();
      renderHook(() => useHotkeys([{keys: 'alt+a', onPress}]));
      const input = document.createElement('input');
      document.body.append(input);

      press('å', {code: 'KeyA', altKey: true, target: input});
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
