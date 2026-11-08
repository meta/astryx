// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the playing-card pan blocks.
 * @input The shipped PanPlayingCard (usePanGesture) block, rendered in jsdom
 *   with the pan, StyleX, the announcer and the Astryx components stubbed.
 * @output Guards the keyboard path: a second Discard while the first throw
 *   still runs deals one card, not two. Guards a throw that a drag beginning
 *   during it leaves running. Guards the card's name and each discard's
 *   announcement. It also checks that the next face is in place before the
 *   card is at rest again.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file. The pan is stubbed because the Discard button
 *   is the drag's keyboard path and never goes through it.
 */

import {act, createElement, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PanPlayingCard from '../../assets/templates/blocks/components/usePanGesture/PanPlayingCard';

type PanEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled';
  translation: {x: number; y: number};
  velocity: {x: number; y: number};
};
type Styles = {
  translate?: string;
  opacity?: number;
  transition?: object;
  userSelect?: string;
};
// The stubbed pan keeps the block's listener, so a case can drive a drag.
const pan = vi.hoisted(() => ({
  onPan: null as null | ((event: PanEvent) => void),
  destroyed: 0,
}));
// This project does not compile StyleX. The stub merges a style list into one
// object on `data-style`. The card stub records each render's name and
// styles, so a case reads what the block shows and in what order.
const stub = vi.hoisted(() => ({
  attribute: (...styles: unknown[]) => ({
    'data-style': JSON.stringify(
      Object.assign({}, ...styles.flat(Infinity).filter(Boolean)),
    ),
  }),
  renders: [] as Array<{name: string; styles: Styles}>,
  announced: [] as string[],
}));
// jsdom runs no transitions. The stubs give each throw one animation per
// moving property, and a case runs the next frame and settles them by hand.
const motion = vi.hoisted(() => ({
  frames: [] as Array<() => void>,
  running: 2,
  settle: [] as Array<(ended: boolean) => void>,
}));
vi.mock('@stylexjs/stylex', () => ({
  create: (styles: object) => styles,
  props: stub.attribute,
}));
vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({
    xstyle,
    children,
    ref,
    ...rest
  }: {
    xstyle: unknown;
    children: ReactNode;
    ref: unknown;
    'aria-label': string;
  }) => {
    const attribute = stub.attribute(xstyle);
    stub.renders.push({
      name: rest['aria-label'],
      styles: JSON.parse(attribute['data-style']) as Styles,
    });
    return createElement('div', {ref, ...rest, ...attribute}, children);
  },
}));
vi.mock('@astryxdesign/core/Center', () => ({
  Center: ({xstyle, children}: {xstyle?: unknown; children: ReactNode}) =>
    createElement('div', stub.attribute(xstyle), children),
}));
vi.mock('@astryxdesign/core/VStack', () => ({
  VStack: ({children}: {children: ReactNode}) =>
    createElement('div', null, children),
}));
vi.mock('@astryxdesign/core/Text', () => ({
  Text: ({children}: {children: ReactNode}) =>
    createElement('span', null, children),
}));
vi.mock('@astryxdesign/core/Button', () => ({
  Button: ({label, onClick}: {label: string; onClick: () => void}) =>
    createElement('button', {type: 'button', onClick}, label),
}));
vi.mock('@astryxdesign/core/theme/tokens.stylex', () => ({
  colorVars: {'--color-neutral': 'var(--color-neutral)'},
  durationVars: {
    '--duration-medium': 'var(--duration-medium)',
    '--duration-exit': 'var(--duration-exit)',
  },
  easeVars: {
    '--ease-move': 'var(--ease-move)',
    '--ease-exit': 'var(--ease-exit)',
  },
  radiusVars: {'--radius-container': 'var(--radius-container)'},
}));
vi.mock('@astryxdesign/core/hooks', () => ({
  usePanGesture: (
    _ref: unknown,
    options: {onPan: (event: PanEvent) => void},
  ) => {
    pan.onPan = options.onPan;
  },
  useAnnounce: () => (message: string) => {
    stub.announced.push(message);
  },
}));
const reactActEnvironment = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  stub.renders.length = 0;
  stub.announced.length = 0;
  motion.frames.length = 0;
  motion.settle.length = 0;
  motion.running = 2;
  window.requestAnimationFrame = callback => {
    motion.frames.push(() => callback(0));
    return motion.frames.length;
  };
  Element.prototype.getAnimations = () =>
    Array.from({length: motion.running}, () => {
      const finished = new Promise((resolve, reject) => {
        motion.settle.push(ended =>
          ended ? resolve(undefined) : reject(new Error('cancelled')),
        );
      });
      return {finished} as unknown as Animation;
    });
  // Motion allowed: a discard throws the card and deals once its transitions
  // settle.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the playing-card pan block', () => {
  /** Render the block; return its Discard button, top card and styles. */
  async function renderBlock() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(PanPlayingCard));
    });
    const button = container.querySelector('button');
    const card = container.querySelector<HTMLElement>('[role="img"]');
    if (button == null || card == null) {
      throw new Error('the block renders no Discard button or top card');
    }
    const styles = () =>
      JSON.parse(card.getAttribute('data-style') ?? '{}') as Styles;
    return {root, button, card, styles, container};
  }

  const at = (x: number) => ({x, y: 0});

  /** Runs the frame after a throw starts, then ends or cancels its motion. */
  function settleThrow(ended = true) {
    for (const frame of motion.frames.splice(0)) {
      frame();
    }
    for (const settle of motion.settle.splice(0)) {
      settle(ended);
    }
  }

  async function send(...events: PanEvent[]) {
    await act(async () => {
      for (const event of events) {
        pan.onPan?.(event);
      }
    });
  }

  it("paints the stage in the theme's neutral wash, so the card reads in light and dark themes", async () => {
    const {root, card} = await renderBlock();
    const stage = JSON.parse(
      card.parentElement?.getAttribute('data-style') ?? '{}',
    ) as {backgroundColor?: string};
    expect(stage.backgroundColor).toBe('var(--color-neutral)');
    await act(async () => {
      root.unmount();
    });
  });

  it("deals the next card's face in the same render that brings the card back to rest, so no frame paints the discarded card back at the centre", async () => {
    const {root, button} = await renderBlock();
    await act(async () => {
      button.click();
    });
    const thrownAt = stub.renders.length;
    await act(async () => {
      settleThrow();
    });
    const after = stub.renders.slice(thrownAt);
    // Every render after the throw shows the next card, at rest and visible.
    expect(after.length).toBeGreaterThan(0);
    for (const render of after) {
      expect(render.name).toBe('King of hearts');
      expect(render.styles.opacity).toBeUndefined();
      expect(render.styles.translate).toBe('0px 0px');
    }
    await act(async () => {
      root.unmount();
    });
  });

  it('ignores the rest of a drag that began during a throw: the next card stays at rest and is not discarded', async () => {
    const {root, button, card, styles} = await renderBlock();
    await act(async () => {
      button.click();
      pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
      settleThrow();
    });
    expect(card.textContent).toBe('K\u2665');
    // The drag outlives the throw.
    await send({state: 'changed', translation: at(40), velocity: at(0)});
    expect(styles().translate).toBe('0px 0px');
    await send({state: 'ended', translation: at(90), velocity: at(2000)});
    expect({face: card.textContent, opacity: styles().opacity}).toEqual({
      face: 'K\u2665',
      opacity: undefined,
    });
    await act(async () => {
      root.unmount();
    });
  });

  it('ignores the rest of a drag a throw starts during: the next card stays at rest and is not discarded', async () => {
    const {root, button, card, styles} = await renderBlock();
    await send(
      {state: 'began', translation: at(5), velocity: at(0)},
      {state: 'changed', translation: at(20), velocity: at(0)},
    );
    expect(styles().translate).toBe('20px 0px');
    // A mouse drag moves the card instead of selecting its face.
    expect(styles().userSelect).toBe('none');
    // Discard, from another finger or the keyboard, mid-drag.
    await act(async () => {
      button.click();
      settleThrow();
    });
    expect(card.textContent).toBe('K\u2665');
    await send(
      {state: 'changed', translation: at(60), velocity: at(0)},
      {state: 'ended', translation: at(90), velocity: at(2000)},
    );
    expect({
      face: card.textContent,
      opacity: styles().opacity,
      translate: styles().translate,
    }).toEqual({face: 'K\u2665', opacity: undefined, translate: '0px 0px'});
    await act(async () => {
      root.unmount();
    });
  });

  it('follows the next drag after an ignored one', async () => {
    const {root, button, styles} = await renderBlock();
    await act(async () => {
      button.click();
      pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
      settleThrow();
      pan.onPan?.({state: 'ended', translation: at(30), velocity: at(0)});
    });
    await send(
      {state: 'began', translation: at(5), velocity: at(0)},
      {state: 'changed', translation: at(25), velocity: at(0)},
    );
    expect(styles().translate).toBe('25px 0px');
    await act(async () => {
      root.unmount();
    });
  });

  it('keeps a throw running through a drag that begins during it, so the next card is dealt', async () => {
    const {root, button, card, styles} = await renderBlock();
    await act(async () => {
      button.click();
    });
    const thrown = styles();
    expect(thrown.opacity).toBe(0);
    expect(thrown.translate).toBe('160px 0px');
    // A drag begins during the throw and ends slowly. Changing the card's
    // transition then would cancel the throw in a browser, so its end would
    // never deal the next card.
    await send(
      {state: 'began', translation: at(5), velocity: at(0)},
      {state: 'changed', translation: at(40), velocity: at(0)},
      {state: 'ended', translation: at(40), velocity: at(0)},
    );
    expect(styles()).toEqual(thrown);
    await act(async () => {
      settleThrow();
    });
    expect({face: card.textContent, opacity: styles().opacity}).toEqual({
      face: 'K\u2665',
      opacity: undefined,
    });
    await act(async () => {
      root.unmount();
    });
  });

  it('names the top card by its rank and suit, as an image, and announces each discard by name', async () => {
    const {root, button, card} = await renderBlock();
    expect({
      role: card.getAttribute('role'),
      name: card.getAttribute('aria-label'),
      face: card.textContent,
    }).toEqual({role: 'img', name: 'Ace of spades', face: 'A\u2660'});
    await act(async () => {
      button.click();
      settleThrow();
    });
    expect({
      name: card.getAttribute('aria-label'),
      face: card.textContent,
      announced: stub.announced,
    }).toEqual({
      name: 'King of hearts',
      face: 'K\u2665',
      announced: ['Ace of spades discarded'],
    });
    await act(async () => {
      root.unmount();
    });
  });

  it("deals the next card at once when a stylesheet stops the throw's transitions", async () => {
    motion.running = 0;
    const {root, button, card} = await renderBlock();
    await act(async () => {
      button.click();
    });
    expect(card.textContent).toBe('A\u2660');
    await act(async () => {
      settleThrow();
    });
    expect(card.textContent).toBe('K\u2665');
    await act(async () => {
      root.unmount();
    });
  });

  it("deals the next card when the throw's transitions are cancelled", async () => {
    const {root, button, card} = await renderBlock();
    await act(async () => {
      button.click();
      settleThrow(false);
    });
    expect(card.textContent).toBe('K\u2665');
    await act(async () => {
      root.unmount();
    });
  });

  it('deals one card for a second Discard pressed while the first throw runs', async () => {
    const {root, button, card} = await renderBlock();
    expect(card.textContent).toBe('A\u2660');
    await act(async () => {
      button.click();
      button.click();
    });
    // The throw's two transitions both end.
    await act(async () => {
      settleThrow();
    });
    expect(card.textContent).toBe('K\u2665');
    await act(async () => {
      root.unmount();
    });
  });
});
