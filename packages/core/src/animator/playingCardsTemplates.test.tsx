// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playingCardsTemplates.test.tsx
 * @input The CLI's two playing-card examples of the public animator, each
 *   rendered with a recording animator in place of the real one.
 * @output Tests of each example's release and press logic. A drag held still
 *   springs back, and so does a cancelled drag. A thrown card's successor is
 *   dealt and announced once the thrown card has faded. The Discard button
 *   uses `animate`, never `decay`, so Reduce Motion fades the card in place
 *   (`design:reduced-motion` DR2). The card is an image with its name. One
 *   card leaves at a time, a leaving card takes no press, and a press during
 *   a fade-in moves only the card's position.
 * @position The examples ship to products through the CLI, so their logic is
 *   checked here, beside the animator they demonstrate.
 */

import type {ComponentType} from 'react';
import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// The examples live in the CLI's templates, outside Core's type-checked
// sources, so they load at run time; the CLI type-checks them itself.
const TEMPLATES = '../../../cli/assets/templates/blocks/components';
async function loadExample(file: string): Promise<ComponentType> {
  const module = (await import(/* @vite-ignore */ `${TEMPLATES}/${file}`)) as {
    default: ComponentType;
  };
  return module.default;
}
const AnimatorPlayingCards = await loadExample(
  'useAnimator/AnimatorPlayingCards',
);
const AnimatorPlayingCardsVanilla = await loadExample(
  'createAnimator/AnimatorPlayingCardsVanilla',
);

const recorder = vi.hoisted(() => {
  const state = {
    calls: [] as {method: string; values?: unknown}[],
    // The fades still running, oldest first.
    fades: [] as (() => void)[],
    finishFade: () => {
      state.fades.shift()?.();
    },
  };
  const animator = {
    animate: async (values: {opacity?: number}) => {
      state.calls.push({method: 'animate', values});
      if (values.opacity != null) {
        // A new opacity target takes over a running fade, which then
        // resolves, as the animator's does. The new fade, out or in, runs
        // until the test finishes it.
        for (const finish of state.fades.splice(0)) {
          finish();
        }
        await new Promise<void>(resolve => {
          state.fades.push(resolve);
        });
      }
    },
    // A thrown card coasts for seconds: this one never stops on its own.
    decay: async (values: unknown) => {
      state.calls.push({method: 'decay', values});
      await new Promise<void>(() => {});
    },
    set: (values: unknown) => {
      state.calls.push({method: 'set', values});
    },
    get: () => ({x: 0, y: 0, scale: 1, rotate: 0, opacity: 1}),
    getVelocity: () => ({x: 0, y: 0, scale: 0, rotate: 0, opacity: 0}),
    // A stop ends every running motion, which resolves its promise, as the
    // animator's does.
    stop: () => {
      state.calls.push({method: 'stop'});
      for (const finish of state.fades.splice(0)) {
        finish();
      }
    },
    destroy: () => {
      state.calls.push({method: 'destroy'});
    },
  };
  return {state, animator};
});

vi.mock('@astryxdesign/core/hooks', async importOriginal => ({
  ...(await importOriginal<object>()),
  useAnimator: () => recorder.animator,
}));
vi.mock('@astryxdesign/core', async importOriginal => ({
  ...(await importOriginal<object>()),
  createAnimator: () => recorder.animator,
}));

/** Dispatches a pointer event at a given time stamp (ms). */
function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  t: number,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: 0,
  });
  Object.defineProperty(event, 'pointerId', {value: 1});
  Object.defineProperty(event, 'timeStamp', {value: t});
  act(() => {
    target.dispatchEvent(event);
  });
}

/** A 150 px drag over 100 ms, released at `releasedAt`. */
function drag(card: Element, releasedAt: number) {
  pointer(card, 'pointerdown', 0, 1000);
  for (let step = 1; step <= 10; step++) {
    pointer(card, 'pointermove', step * 15, 1000 + step * 10);
  }
  pointer(card, 'pointerup', 150, releasedAt);
}

const methods = () => recorder.state.calls.map(call => call.method);

const EXAMPLES = [
  {
    name: 'the useAnimator example',
    mount: () => render(<AnimatorPlayingCards />),
    card: () => screen.getByRole('img', {name: 'Ace of spades'}),
    discardButton: 'Discard Ace of spades',
    announced: 'Ace of spades discarded',
  },
  {
    name: 'the createAnimator example',
    mount: () => render(<AnimatorPlayingCardsVanilla />),
    card: () => screen.getByRole('img', {name: 'Ace of spades'}),
    discardButton: 'Discard the top card',
    announced: 'Ace of spades discarded',
  },
];

describe.each(EXAMPLES)('$name', ({mount, card, discardButton, announced}) => {
  beforeEach(() => {
    recorder.state.calls = [];
    recorder.state.fades = [];
    HTMLElement.prototype.setPointerCapture = () => {};
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  });

  it('a drag held still for 600 ms before its release springs back, not thrown', () => {
    mount();
    drag(card(), 1100 + 600);
    expect(methods()).not.toContain('decay');
    expect(recorder.state.calls.at(-1)).toMatchObject({
      method: 'animate',
      values: {x: 0, y: 0, rotate: 0},
    });
  });

  it('a drag that the browser cancels springs back, even after fast moves', () => {
    mount();
    const target = card();
    pointer(target, 'pointerdown', 0, 1000);
    for (let step = 1; step <= 10; step++) {
      pointer(target, 'pointermove', step * 15, 1000 + step * 10);
    }
    pointer(target, 'pointercancel', 150, 1100);
    expect(methods()).not.toContain('decay');
    expect(recorder.state.calls.at(-1)).toMatchObject({
      method: 'animate',
      values: {x: 0, y: 0, rotate: 0},
    });
  });

  it('a flick deals and announces the next card once the thrown one fades, during its coast', async () => {
    mount();
    drag(card(), 1100);
    expect(methods()).toContain('decay');
    expect(screen.queryByText(announced)).toBeNull();
    await act(async () => {
      recorder.state.finishFade();
    });
    expect(screen.getByText(announced)).toBeTruthy();
    expect(recorder.state.calls).toContainEqual({
      method: 'set',
      values: {x: 0, y: 0, rotate: 0, scale: 0.9, opacity: 0},
    });
  });

  it('the Discard button moves the card off with animate, never decay, so Reduce Motion fades it in place (design:reduced-motion DR2)', async () => {
    mount();
    act(() => {
      screen.getByRole('button', {name: discardButton}).click();
    });
    // A coast keeps its momentum under Reduce Motion, as a person's throw;
    // a button's move is planned, so it fades where it is.
    expect(methods()).not.toContain('decay');
    expect(recorder.state.calls[0]).toEqual({
      method: 'animate',
      values: {x: 400, opacity: 0},
    });
    await act(async () => {
      recorder.state.finishFade();
    });
    expect(screen.getByText(announced)).toBeTruthy();
  });

  it('a Discard press mid-drag ends the drag: later moves neither cut the discard short nor move the dealt card', async () => {
    mount();
    const target = card();
    pointer(target, 'pointerdown', 0, 1000);
    pointer(target, 'pointermove', 20, 1010);
    act(() => {
      screen.getByRole('button', {name: discardButton}).click();
    });
    const atDiscard = recorder.state.calls.length;
    // The finger moves on and lifts while the card leaves.
    pointer(target, 'pointermove', 60, 1020);
    pointer(target, 'pointerup', 60, 1030);
    expect(recorder.state.calls.slice(atDiscard)).toEqual([]);
    await act(async () => {
      while (recorder.state.fades.length > 0) {
        recorder.state.finishFade();
        await Promise.resolve();
      }
    });
    expect(deals()).toHaveLength(1);
  });

  it('a press on the card being dealt moves only its position: its fade-in runs on', async () => {
    mount();
    act(() => {
      screen.getByRole('button', {name: discardButton}).click();
    });
    await act(async () => {
      recorder.state.finishFade();
    });
    // The next card is fading in.
    expect(recorder.state.fades).toHaveLength(1);
    const dealt = screen.getByRole('img', {name: 'King of hearts'});
    pointer(dealt, 'pointerdown', 0, 1000);
    pointer(dealt, 'pointermove', 40, 1010);
    expect(recorder.state.fades).toHaveLength(1);
    expect(methods()).not.toContain('stop');
    expect(recorder.state.calls.at(-1)).toMatchObject({
      method: 'set',
      values: {x: 40},
    });
  });

  it('names the dealt card by its rank and suit', async () => {
    mount();
    act(() => {
      screen.getByRole('button', {name: discardButton}).click();
    });
    await act(async () => {
      recorder.state.finishFade();
    });
    expect(screen.getByRole('img', {name: 'King of hearts'})).toBeTruthy();
  });
});

/** The `set` calls that deal a card. */
const deals = () =>
  recorder.state.calls.filter(
    call =>
      call.method === 'set' && (call.values as {scale?: number}).scale === 0.9,
  );

describe.each(EXAMPLES)(
  '$name, one discard at a time',
  ({mount, card, discardButton}) => {
    beforeEach(() => {
      recorder.state.calls = [];
      recorder.state.fades = [];
      HTMLElement.prototype.setPointerCapture = () => {};
    });
    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
    });

    it('a second Discard press while the card leaves deals one card, not two', async () => {
      mount();
      const button = screen.getByRole('button', {name: discardButton});
      act(() => {
        button.click();
      });
      act(() => {
        button.click();
      });
      await act(async () => {
        while (recorder.state.fades.length > 0) {
          recorder.state.finishFade();
          await Promise.resolve();
        }
      });
      expect(deals()).toHaveLength(1);
    });

    it('a press on a card that is leaving is ignored: its fade runs on, and one card is dealt after it', async () => {
      mount();
      act(() => {
        screen.getByRole('button', {name: discardButton}).click();
      });
      // A finger lands on the leaving card and moves.
      pointer(card(), 'pointerdown', 0, 1000);
      pointer(card(), 'pointermove', 40, 1010);
      expect(methods()).not.toContain('stop');
      expect(methods()).not.toContain('set');
      await act(async () => {
        while (recorder.state.fades.length > 0) {
          recorder.state.finishFade();
          await Promise.resolve();
        }
      });
      expect(deals()).toHaveLength(1);
    });

    it('a Discard press while a flicked card fades deals one card, not two', async () => {
      mount();
      drag(card(), 1100);
      act(() => {
        screen.getByRole('button', {name: discardButton}).click();
      });
      await act(async () => {
        while (recorder.state.fades.length > 0) {
          recorder.state.finishFade();
          await Promise.resolve();
        }
      });
      expect(deals()).toHaveLength(1);
    });
  },
);

describe('the createAnimator example', () => {
  it('colours its card from the theme\u2019s surface and text tokens, so it reads in a dark theme', () => {
    render(<AnimatorPlayingCardsVanilla />);
    const {style} = screen.getByRole('img', {name: 'Ace of spades'});
    expect(style.backgroundColor).toBe('var(--color-background-surface)');
    expect(style.color).toBe('var(--color-text-primary)');
  });

  it('takes its deck down when it unmounts', () => {
    recorder.state.calls = [];
    const {unmount} = render(<AnimatorPlayingCardsVanilla />);
    expect(screen.getByRole('img', {name: 'Ace of spades'})).toBeTruthy();
    unmount();
    expect(screen.queryByRole('img')).toBeNull();
    expect(methods()).toContain('destroy');
  });
});
