// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useIsHydrating.test.tsx
 * @input useIsHydrating, React server render, hydration, and client roots
 * @output Proves the hook is true only on the server and while hydrating
 * @position Unit test for the internal hydration-state utility
 */

import {act, useState} from 'react';
import {afterEach, describe, expect, it} from 'vitest';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {useIsHydrating} from './useIsHydrating';

const seen: boolean[] = [];

function Probe() {
  const isHydrating = useIsHydrating();
  seen.push(isHydrating);
  return <span data-hydrating={String(isHydrating)} />;
}

afterEach(() => {
  seen.length = 0;
  document.body.replaceChildren();
});

describe('useIsHydrating', () => {
  it('is true on the server', () => {
    expect(renderToString(<Probe />)).toContain('data-hydrating="true"');
  });

  it('is true while hydrating, then false after hydration', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Probe />);
    document.body.appendChild(container);
    seen.length = 0;

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Probe />);
    });

    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
    expect(container.querySelector('span')).toHaveAttribute(
      'data-hydrating',
      'false',
    );
    await act(async () => root.unmount());
  });

  it('is false in a client-only root and for elements mounted after hydration', async () => {
    let show!: () => void;
    function Later() {
      const [isShown, setIsShown] = useState(false);
      show = () => setIsShown(true);
      return isShown ? <Probe /> : null;
    }
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Later />));
    await act(async () => show());

    expect(seen).toEqual([false]);
    await act(async () => root.unmount());
  });
});
