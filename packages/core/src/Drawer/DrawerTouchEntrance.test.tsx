// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TOUCH_QUERY} from '../utils/touchQueries';
import {Drawer} from './Drawer';

/** Ends the slide-in every drawer reports (jsdom runs no CSS transition). */
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
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('open');
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
        effect: {getComputedTiming: () => ({endTime: 250})},
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

function TestDrawer({
  isOpen,
  hasScrim = true,
  onAct = noop,
}: {
  isOpen: boolean;
  hasScrim?: boolean;
  onAct?: () => void;
}) {
  return (
    <>
      <button type="button" onClick={onAct}>
        Outside
      </button>
      <Drawer
        isOpen={isOpen}
        onOpenChange={() => {}}
        label="Held"
        hasScrim={hasScrim}>
        <button type="button" onClick={onAct}>
          Act
        </button>
      </Drawer>
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

describe('Drawer slide-in (spec:AST-094 FR35)', () => {
  it("holds a finger's tap while it slides in, and lets one through once the slide-in ends", async () => {
    stubPointer(true);
    const onAct = vi.fn();
    render(<TestDrawer isOpen onAct={onAct} />);

    tap(button('Act'), 'touch', 1);
    expect(onAct).not.toHaveBeenCalled();

    await act(async () => {
      finishEntrance();
      await Promise.resolve();
    });
    tap(button('Act'), 'touch', 2);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("holds only a non-modal drawer's panel: a finger's tap on the page beside it acts", () => {
    stubPointer(true);
    const onAct = vi.fn();
    render(<TestDrawer isOpen hasScrim={false} onAct={onAct} />);

    tap(button('Act'), 'touch', 1);
    expect(onAct).not.toHaveBeenCalled();
    tap(button('Outside'), 'touch', 2);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('lets input through again when it closes mid-slide', () => {
    stubPointer(true);
    const onAct = vi.fn();
    const view = render(<TestDrawer isOpen onAct={onAct} />);

    view.rerender(<TestDrawer isOpen={false} onAct={onAct} />);
    tap(button('Outside'), 'touch', 1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it("leaves a mouse's click alone, even where the primary pointer is a finger", () => {
    stubPointer(true);
    const onAct = vi.fn();
    render(<TestDrawer isOpen onAct={onAct} />);

    tap(button('Act'), 'mouse', 1);
    expect(onAct).toHaveBeenCalledTimes(1);
  });
});
