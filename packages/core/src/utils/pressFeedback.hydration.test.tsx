// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file pressFeedback.hydration.test.tsx
 * @input Server markup of a page with a Suspense boundary, partial hydration
 *   and a finger's press on a pressable surface the boundary still holds
 * @output Proves the press controller paints no surface React has not
 *   hydrated, so the boundary hydrates with no attribute mismatch, and that a
 *   hydrated surface still paints at once (`spec:AST-013` FR9)
 * @position SSR acceptance test for the press controller (pressFeedback.ts)
 */

import {act, lazy, Suspense, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot, type Root} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Button} from '../Button/Button';
import {PRESSED_ATTRIBUTE} from './pressFeedback';

function Late(): ReactNode {
  return <Button label="Save" onClick={() => {}} />;
}

const page = (content: ReactNode) => (
  <main>
    <Button label="Menu" onClick={() => {}} />
    <Suspense fallback={null}>{content}</Suspense>
  </main>
);

function fingerDown(target: Element): void {
  target.dispatchEvent(
    Object.assign(new MouseEvent('pointerdown', {bubbles: true, button: 0}), {
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
    }),
  );
}

function fingerUp(target: Element): void {
  target.dispatchEvent(
    Object.assign(new MouseEvent('pointerup', {bubbles: true, button: 0}), {
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
    }),
  );
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('press feedback during partial hydration (AST-013 FR9)', () => {
  it('paints no surface React has not hydrated, and that boundary hydrates without a mismatch', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(page(<Late />));
    document.body.append(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    let deliver: (module: {default: typeof Late}) => void = () => {};
    const LateCode = lazy(async () => {
      const module = await new Promise<{default: typeof Late}>(resolve => {
        deliver = resolve;
      });
      return module;
    });
    await act(async () => {
      root = hydrateRoot(container, page(<LateCode />));
    });

    // A finger presses the served "Save" button before its boundary
    // hydrates.
    const [menu, save] = container.querySelectorAll('button');
    fingerDown(save);
    expect(save).not.toHaveAttribute(PRESSED_ATTRIBUTE);

    // The boundary's code arrives during the press, and it hydrates.
    await act(async () => {
      deliver({default: Late});
    });
    expect(
      errors.mock.calls.some(call =>
        String(call[0]).includes('hydrated but some attributes'),
      ),
    ).toBe(false);
    fingerUp(save);

    // A surface React has hydrated still paints a finger's press at once.
    fingerDown(menu);
    expect(menu).toHaveAttribute(PRESSED_ATTRIBUTE, 'on');
    fingerUp(menu);
  });
});

// The press controller reads React's private element keys to tell hydrated
// markup (isAwaitingHydration in pressFeedback.ts). If a React upgrade
// renames them, the check fails safe and the mismatch above returns; this
// canary says so loudly.
describe('React still sets the element keys isAwaitingHydration reads', () => {
  it('marks a hydrated root container and its elements', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(page(<Late />));
    document.body.append(container);
    await act(async () => {
      root = hydrateRoot(container, page(<Late />));
    });
    const keysOf = (element: Element) => Object.keys(element).join(', ');
    const button = container.querySelector('button');
    expect(
      Object.keys(container).some(key => key.startsWith('__reactContainer$')),
      `React no longer sets __reactContainer$ on a root container (own keys: ${keysOf(container)}). Update isAwaitingHydration in utils/pressFeedback.ts.`,
    ).toBe(true);
    expect(
      button != null &&
        Object.keys(button).some(key => key.startsWith('__reactProps$')),
      `React no longer sets __reactProps$ on a hydrated element. Update isAwaitingHydration in utils/pressFeedback.ts.`,
    ).toBe(true);
  });
});
