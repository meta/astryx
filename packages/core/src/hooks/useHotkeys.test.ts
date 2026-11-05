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
});
