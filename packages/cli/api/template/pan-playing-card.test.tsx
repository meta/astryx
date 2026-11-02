// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the two playing-card pan blocks.
 * @input The shipped PanPlayingCard (usePanGesture) and PanPlayingCardVanilla
 *   (createPanGesture) blocks, rendered in jsdom with the pan itself stubbed.
 * @output Guards the keyboard path: a second Discard while the first throw
 *   still runs deals one card, not two, in both blocks. Guards the card's
 *   theme colors, and a throw that a drag beginning during it leaves running.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file. The pan is stubbed because the Discard button
 *   is the drag's keyboard path and never goes through it.
 */

import {act, createElement, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PanPlayingCardVanilla from '../../assets/templates/blocks/components/createPanGesture/PanPlayingCardVanilla';
import PanPlayingCard from '../../assets/templates/blocks/components/usePanGesture/PanPlayingCard';

type PanEvent = {
  state: 'began' | 'changed' | 'ended' | 'cancelled';
  translation: {x: number; y: number};
  velocity: {x: number; y: number};
};
// The stubbed pan keeps the block's listener, so a case can drive a drag.
const pan = vi.hoisted(() => ({
  onPan: null as null | ((event: PanEvent) => void),
  destroyed: 0,
}));
vi.mock('@astryxdesign/core/hooks', () => ({
  usePanGesture: (
    _ref: unknown,
    options: {onPan: (event: PanEvent) => void},
  ) => {
    pan.onPan = options.onPan;
  },
}));
vi.mock('@astryxdesign/core', () => ({
  createPanGesture: (
    _element: unknown,
    options: {onPan: (event: PanEvent) => void},
  ) => {
    pan.onPan = options.onPan;
    return {
      destroy: () => {
        pan.destroyed += 1;
      },
    };
  },
}));

const reactActEnvironment = globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean};

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  // Motion allowed: a discard throws the card and deals at its transitionend.
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

describe('the plain-JavaScript pan block', () => {
  it('mounts its deck with its wrapper and takes it down, pan included, when it unmounts', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(createElement(PanPlayingCardVanilla));
    });
    expect(container.querySelector('[aria-label="Top card"]')).not.toBeNull();
    const destroyed = pan.destroyed;
    await act(async () => {
      root.unmount();
    });
    expect(container.querySelector('[aria-label="Top card"]')).toBeNull();
    expect(pan.destroyed).toBe(destroyed + 1);
  });
});

describe('the playing-card pan blocks', () => {
  for (const [name, Block] of [
    ['usePanGesture', PanPlayingCard],
    ['createPanGesture', PanPlayingCardVanilla],
  ] as ReadonlyArray<[string, ComponentType]>) {
    it(`paints the card in the theme's surface and text colors, so its face reads in dark mode too (${name})`, async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(Block));
      });
      const card = container.querySelector<HTMLElement>(
        '[aria-label="Top card"]',
      );
      if (card == null) {
        throw new Error('the block renders no top card');
      }
      expect({
        background: card.style.backgroundColor,
        color: card.style.color,
      }).toEqual({
        background: 'var(--color-background-surface)',
        color: 'var(--color-text-primary)',
      });
      await act(async () => {
        root.unmount();
      });
    });

    /** Render the block; return its Discard button and top card. */
    async function renderBlock() {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(Block));
      });
      const button = container.querySelector('button');
      const card = container.querySelector<HTMLElement>(
        '[aria-label="Top card"]',
      );
      if (button == null || card == null) {
        throw new Error('the block renders no Discard button or top card');
      }
      return {root, button, card};
    }

    const at = (x: number) => ({x, y: 0});

    it(`ignores the rest of a drag that began during a throw: the next card stays at rest and is not discarded (${name})`, async () => {
      const {root, button, card} = await renderBlock();
      await act(async () => {
        button.click();
        pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
        card.dispatchEvent(new Event('transitionend'));
      });
      expect(card.textContent).toBe('K\u2665');
      // The drag outlives the throw.
      await act(async () => {
        pan.onPan?.({state: 'changed', translation: at(40), velocity: at(0)});
      });
      expect(card.style.translate).toBe('0px 0px');
      await act(async () => {
        pan.onPan?.({state: 'ended', translation: at(90), velocity: at(2000)});
      });
      expect({face: card.textContent, opacity: card.style.opacity}).toEqual({
        face: 'K\u2665',
        opacity: '1',
      });
      await act(async () => {
        root.unmount();
      });
    });

    it(`ignores the rest of a drag a throw starts during: the next card stays at rest and is not discarded (${name})`, async () => {
      const {root, button, card} = await renderBlock();
      await act(async () => {
        pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
        pan.onPan?.({state: 'changed', translation: at(20), velocity: at(0)});
      });
      expect(card.style.translate).toBe('20px 0px');
      // Discard, from another finger or the keyboard, mid-drag.
      await act(async () => {
        button.click();
        card.dispatchEvent(new Event('transitionend'));
      });
      expect(card.textContent).toBe('K\u2665');
      await act(async () => {
        pan.onPan?.({state: 'changed', translation: at(60), velocity: at(0)});
        pan.onPan?.({state: 'ended', translation: at(90), velocity: at(2000)});
      });
      expect({
        face: card.textContent,
        opacity: card.style.opacity,
        translate: card.style.translate,
      }).toEqual({face: 'K\u2665', opacity: '1', translate: '0px 0px'});
      await act(async () => {
        root.unmount();
      });
    });

    it(`follows the next drag after an ignored one (${name})`, async () => {
      const {root, button, card} = await renderBlock();
      await act(async () => {
        button.click();
        pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
        card.dispatchEvent(new Event('transitionend'));
        pan.onPan?.({state: 'ended', translation: at(30), velocity: at(0)});
      });
      await act(async () => {
        pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
        pan.onPan?.({state: 'changed', translation: at(25), velocity: at(0)});
      });
      expect(card.style.translate).toBe('25px 0px');
      await act(async () => {
        root.unmount();
      });
    });

    it(`keeps a throw running through a drag that begins during it, so the next card is dealt (${name})`, async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(Block));
      });
      const button = container.querySelector('button');
      const card = container.querySelector<HTMLElement>(
        '[aria-label="Top card"]',
      );
      if (button == null || card == null) {
        throw new Error('the block renders no Discard button or top card');
      }
      await act(async () => {
        button.click();
      });
      const thrown = {
        transition: card.style.transition,
        translate: card.style.translate,
      };
      expect(thrown.transition).not.toBe('none');
      // A drag begins during the throw and ends slowly. Writing the card's
      // transition then would cancel the throw in a browser, so its end would
      // never deal the next card.
      await act(async () => {
        const at = (x: number) => ({x, y: 0});
        pan.onPan?.({state: 'began', translation: at(5), velocity: at(0)});
        pan.onPan?.({state: 'changed', translation: at(40), velocity: at(0)});
        pan.onPan?.({state: 'ended', translation: at(40), velocity: at(0)});
      });
      expect({
        transition: card.style.transition,
        translate: card.style.translate,
      }).toEqual(thrown);
      await act(async () => {
        card.dispatchEvent(new Event('transitionend'));
      });
      expect({face: card.textContent, opacity: card.style.opacity}).toEqual({
        face: 'K\u2665',
        opacity: '1',
      });
      await act(async () => {
        root.unmount();
      });
    });

    it(`deals one card for a second Discard pressed while the first throw runs (${name})`, async () => {
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(createElement(Block));
      });
      const button = container.querySelector('button');
      const card = container.querySelector('[aria-label="Top card"]');
      if (button == null || card == null) {
        throw new Error('the block renders no Discard button or top card');
      }
      expect(card.textContent).toBe('A\u2660');
      await act(async () => {
        button.click();
        button.click();
      });
      // The throw's two transitions end one after the other.
      await act(async () => {
        card.dispatchEvent(new Event('transitionend'));
        card.dispatchEvent(new Event('transitionend'));
      });
      expect(card.textContent).toBe('K\u2665');
      await act(async () => {
        root.unmount();
      });
    });
  }
});
