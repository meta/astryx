// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {HoverGestureRecognizer} from '../HoverGestureRecognizer';

const intent = {enterMs: 200, exitMs: 100, group: 'hints'};
const recognizers: HoverGestureRecognizer[] = [];

function create() {
  const recognizer = new HoverGestureRecognizer();
  recognizers.push(recognizer);
  return recognizer;
}

function callbacks() {
  return {onEnter: vi.fn(() => true), onExit: vi.fn(), isActive: () => true};
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const recognizer of recognizers.splice(0)) {
    recognizer.cancel();
  }
  vi.useRealTimers();
});

describe('HoverGestureRecognizer', () => {
  it('does not warm a group when the pointer leaves before entry', () => {
    const first = create();
    const second = create();
    const a = callbacks();
    const b = callbacks();
    first.enter(document, intent, a);
    vi.advanceTimersByTime(199);
    first.leave(a.onExit);
    second.enter(document, intent, b);
    vi.advanceTimersByTime(199);
    expect(a.onEnter).not.toHaveBeenCalled();
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
  });

  it('keeps intent groups independent', () => {
    const a = callbacks();
    const b = callbacks();
    create().enter(document, intent, a);
    vi.advanceTimersByTime(200);
    create().enter(document, {...intent, group: 'menus'}, b);
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
    expect(a.onExit).not.toHaveBeenCalled();
  });

  it('does not carry warm state into another document', () => {
    const a = callbacks();
    const b = callbacks();
    create().enter(document, intent, a);
    vi.advanceTimersByTime(200);
    const other = document.implementation.createHTMLDocument();
    create().enter(other, intent, b);
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
    expect(a.onExit).not.toHaveBeenCalled();
  });

  it('keeps the surface open when exit is cancelled across the hover bridge', () => {
    const recognizer = create();
    const a = callbacks();
    recognizer.enter(document, intent, a);
    vi.advanceTimersByTime(200);
    recognizer.leave(a.onExit);
    vi.advanceTimersByTime(99);
    recognizer.cancelExit();
    vi.advanceTimersByTime(1000);
    expect(a.onExit).not.toHaveBeenCalled();
    const b = callbacks();
    create().enter(document, intent, b);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
    expect(a.onExit).toHaveBeenCalledTimes(1);
  });

  it('drops pending callbacks and warm state on cancellation', () => {
    const first = create();
    const a = callbacks();
    first.enter(document, intent, a);
    first.cancel();
    vi.advanceTimersByTime(200);
    expect(a.onEnter).not.toHaveBeenCalled();

    first.enter(document, intent, a);
    vi.advanceTimersByTime(200);
    first.leave(a.onExit);
    first.cancel();
    const b = callbacks();
    create().enter(document, intent, b);
    vi.advanceTimersByTime(199);
    expect(a.onExit).not.toHaveBeenCalled();
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
  });

  it('does not hand off from an owner that has been disabled', () => {
    let isActive = true;
    const a = {...callbacks(), isActive: () => isActive};
    create().enter(document, intent, a);
    vi.advanceTimersByTime(200);
    isActive = false;
    const b = callbacks();
    create().enter(document, intent, b);
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
  });

  it('does not warm a group when an opening callback tears its owner down', () => {
    const first = create();
    first.enter(document, intent, {
      ...callbacks(),
      onEnter: () => {
        first.cancel();
        return true;
      },
    });
    vi.advanceTimersByTime(200);
    const b = callbacks();
    create().enter(document, intent, b);
    expect(b.onEnter).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(b.onEnter).toHaveBeenCalledTimes(1);
  });
});
