// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useEntryAnimation.ssr.test.tsx
 * @input FieldStatus server markup, React hydration, and client mounts
 * @output Proves server-rendered entry-animated elements hydrate without mismatches
 * @position SSR acceptance test for useEntryAnimation
 */

import {act, useState} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';

// Each test imports a fresh copy of FieldStatus with the hook's first-frame
// callback held back, so server markup renders before the page "paints" (as on
// a real server) and `paint()` then runs that frame.
async function importFieldStatus() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    frames.push(callback),
  );
  vi.resetModules();
  const {FieldStatus} = await import('../FieldStatus');
  vi.unstubAllGlobals();
  const paint = () => {
    frames.splice(0).forEach(callback => callback(performance.now()));
  };
  return {FieldStatus, paint};
}

function mountServerHTML(html: string): HTMLDivElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

function classesOf(element: Element | null): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('useEntryAnimation — SSR', () => {
  it('hydrates server-rendered FieldStatus after the first paint without a mismatch', async () => {
    const {FieldStatus, paint} = await importFieldStatus();
    const tree = <FieldStatus type="error" message="x" />;
    const serverHTML = renderToString(tree);
    const container = mountServerHTML(serverHTML);
    const serverClassName = container.firstElementChild?.className;
    paint();

    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });

    expect(
      consoleError.mock.calls.filter(call =>
        String(call[0] ?? '')
          .toLowerCase()
          .includes('hydrat'),
      ),
    ).toEqual([]);
    expect(recoverableErrors).toEqual([]);
    expect(container.firstElementChild?.className).toBe(serverClassName);

    await act(async () => {
      root.unmount();
    });
  });

  it('still animates a client-only mount after the first paint', async () => {
    const {FieldStatus, paint} = await importFieldStatus();
    const staticClasses = classesOf(
      mountServerHTML(renderToString(<FieldStatus type="error" message="x" />))
        .firstElementChild,
    );
    paint();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<FieldStatus type="error" message="x" />);
    });

    const clientClasses = classesOf(container.firstElementChild);
    expect(clientClasses).toEqual(expect.arrayContaining(staticClasses));
    expect(clientClasses.length).toBeGreaterThan(staticClasses.length);

    await act(async () => {
      root.unmount();
    });
  });

  it('animates a FieldStatus mounted after hydration', async () => {
    const {FieldStatus, paint} = await importFieldStatus();
    let showSecond!: () => void;
    function Form() {
      const [second, setSecond] = useState(false);
      showSecond = () => setSecond(true);
      return (
        <>
          <FieldStatus type="error" message="first" />
          {second ? <FieldStatus type="error" message="second" /> : null}
        </>
      );
    }
    const container = mountServerHTML(renderToString(<Form />));
    const staticClasses = classesOf(container.firstElementChild);
    paint();

    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <Form />);
    });
    await act(async () => {
      showSecond();
    });

    const mounted = container.children[1] ?? null;
    expect(mounted).toHaveTextContent('second');
    const mountedClasses = classesOf(mounted);
    expect(mountedClasses).toEqual(expect.arrayContaining(staticClasses));
    expect(mountedClasses.length).toBeGreaterThan(staticClasses.length);

    await act(async () => {
      root.unmount();
    });
  });
});
