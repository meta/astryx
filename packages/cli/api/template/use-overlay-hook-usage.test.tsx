// Copyright (c) Meta Platforms, Inc. and affiliates.
// @vitest-environment jsdom

/**
 * The useOverlay example spreads the hook's container ref and props on a
 * product Card and renders the returned scrim once over the image. Hover and
 * focus reveal are CSS, which jsdom does not apply, so this checks the wiring
 * and the tab order that keyboard users depend on.
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {useOverlay} from '@astryxdesign/core/Overlay';
import UseOverlayHookUsage from '../../assets/templates/blocks/components/Overlay/useOverlayHookUsage';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLElement;

function overlayScopeClasses(): string[] {
  let className = '';
  function Probe() {
    className = useOverlay().containerProps.className ?? '';
    return null;
  }
  const probeRoot = createRoot(document.createElement('div'));
  act(() => probeRoot.render(<Probe />));
  act(() => probeRoot.unmount());
  return className.split(' ').filter(Boolean);
}

function quickView(): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    candidate => candidate.textContent === 'Quick view',
  );
  if (button == null) {
    throw new Error('no Quick view button rendered');
  }
  return button;
}

beforeEach(() => {
  // A device with a mouse, so hover reveal is CSS-driven.
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(<UseOverlayHookUsage />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

describe('useOverlay example', () => {
  it('renders one Quick view scrim inside the card that carries the container props', () => {
    const card = container.firstElementChild as HTMLElement;
    const scope = overlayScopeClasses();
    expect(scope.length).toBeGreaterThan(0);
    for (const name of scope) {
      expect(card.classList.contains(name)).toBe(true);
    }
    expect(card.contains(quickView())).toBe(true);
    expect(
      Array.from(container.querySelectorAll('button')).filter(
        button => button.textContent === 'Quick view',
      ),
    ).toHaveLength(1);
  });

  it('shows Quick view in a bottom strip, which leaves the image link above it clickable', () => {
    const scrim = quickView().closest('.astryx-overlay-scrim');
    expect(scrim?.getAttribute('data-position')).toBe('bottom');
  });

  it('puts the image link before Quick view in tab order, so focus can reveal it', () => {
    const link = container.querySelector('a');
    if (link == null) {
      throw new Error('no image link rendered');
    }
    expect(link.getAttribute('href')).toBe('#ceramic-mug');
    expect(
      link.compareDocumentPosition(quickView()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
