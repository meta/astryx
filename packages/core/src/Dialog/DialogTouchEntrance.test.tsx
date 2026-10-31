// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TOUCH_QUERY} from '../utils/touchQueries';
import {Dialog} from './Dialog';

/** Ends the entrance every dialog reports (jsdom runs no CSS animation). */
let finishEntrance: () => void = () => {};

/** The primary pointer: a finger (`coarse`, a touch screen) or a mouse. */
function stubPointer(coarse: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: coarse && query === TOUCH_QUERY,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  const finished = new Promise<void>(resolve => {
    finishEntrance = resolve;
  });
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value: () => [
      {
        playState: 'running',
        finished,
        effect: {getComputedTiming: () => ({endTime: 300})},
      },
    ],
  });
});

afterEach(() => {
  delete (Element.prototype as {getAnimations?: unknown}).getAnimations;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const noop = () => {};

function TestDialog({
  isOpen,
  onAct = noop,
}: {
  isOpen: boolean;
  onAct?: () => void;
}) {
  return (
    <>
      <button type="button" onClick={onAct}>
        Outside
      </button>
      <Dialog isOpen={isOpen} onOpenChange={() => {}} aria-label="Held">
        <button type="button" onClick={onAct}>
          Act
        </button>
      </Dialog>
    </>
  );
}

const INIT = {bubbles: true, cancelable: true, composed: true};

/** A press and its click, as a browser sends them for `pointerType`. */
function tap(element: Element, pointerType: string, pointerId: number) {
  element.dispatchEvent(
    new PointerEvent('pointerdown', {...INIT, pointerId, pointerType}),
  );
  element.dispatchEvent(
    new PointerEvent('pointerup', {...INIT, pointerId, pointerType}),
  );
  element.dispatchEvent(
    new PointerEvent('click', {...INIT, pointerType, detail: 1}),
  );
}

const button = (name: string) =>
  screen.getByRole('button', {name, hidden: true});

describe('Dialog entrance (spec:AST-094 FR35)', () => {
  it("holds a finger's tap on its action while it enters, and lets one through once it has entered", async () => {
    stubPointer(true);
    const onAct = vi.fn();
    render(<TestDialog isOpen onAct={onAct} />);

    tap(button('Act'), 'touch', 1);
    expect(onAct).not.toHaveBeenCalled();

    await act(async () => {
      finishEntrance();
      await Promise.resolve();
    });
    tap(button('Act'), 'touch', 2);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('lets input through again when it closes mid-entrance', () => {
    stubPointer(true);
    const onAct = vi.fn();
    const view = render(<TestDialog isOpen onAct={onAct} />);

    view.rerender(<TestDialog isOpen={false} onAct={onAct} />);
    tap(button('Outside'), 'touch', 1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("leaves a mouse's click alone, even where the primary pointer is a finger", () => {
    stubPointer(true);
    const onAct = vi.fn();
    render(<TestDialog isOpen onAct={onAct} />);

    tap(button('Act'), 'mouse', 1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("holds nothing where the primary pointer is a mouse, a finger's tap included (a touchscreen laptop: an implementation gap on FR35's adoption)", () => {
    stubPointer(false);
    const onAct = vi.fn();
    render(<TestDialog isOpen onAct={onAct} />);

    tap(button('Act'), 'touch', 1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});
