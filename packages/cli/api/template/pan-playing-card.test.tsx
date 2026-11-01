// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * @file Behavior test for the two playing-card pan blocks.
 * @input The shipped PanPlayingCard (usePanGesture) and PanPlayingCardVanilla
 *   (createPanGesture) blocks, rendered in jsdom with the pan itself stubbed.
 * @output Guards the keyboard path: a second Discard while the first throw
 *   still runs deals one card, not two, in both blocks.
 * @position CLI template regression coverage; runs in the node test project,
 *   under jsdom for this file. The pan is stubbed because the Discard button
 *   is the drag's keyboard path and never goes through it.
 */

import {act, createElement, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import PanPlayingCardVanilla from '../../assets/templates/blocks/components/createPanGesture/PanPlayingCardVanilla';
import PanPlayingCard from '../../assets/templates/blocks/components/usePanGesture/PanPlayingCard';

vi.mock('@astryxdesign/core/hooks', () => ({usePanGesture: () => {}}));
vi.mock('@astryxdesign/core', () => ({
  createPanGesture: () => ({destroy: () => {}}),
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

describe('the playing-card pan blocks', () => {
  for (const [name, Block] of [
    ['usePanGesture', PanPlayingCard],
    ['createPanGesture', PanPlayingCardVanilla],
  ] as ReadonlyArray<[string, ComponentType]>) {
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
