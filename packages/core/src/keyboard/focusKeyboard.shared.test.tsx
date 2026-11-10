// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusKeyboard.shared.test.tsx
 * @input Two loads of the focus-trap and keyboard modules, as the package and
 *   a swizzled copy each carry one
 * @output Proves both loads see one set of focus traps (a copy's region
 *   nested in a package region answers its own Tab), one keyboard layout
 *   guide per window, and one set of keyboard targets
 * @position Shared-state tests for useFocusTrap.ts and the keyboard modules
 *   (spec:AST-110 FR3)
 */

import {act, cleanup, render, renderHook} from '@testing-library/react';
import {useRef, useState, type ReactNode} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';

/** One load of a module, as the package or a copy has. */
async function load<T>(importModule: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return importModule();
}

afterEach(async () => {
  cleanup();
  (await import('../utils/sharedRealm')).resetSharedStateForTest('keyboard/');
  (await import('../utils/sharedRealm')).resetSharedStateForTest('hooks/');
  vi.resetModules();
});

describe('focus traps and the keyboard, shared by the package and a copy', () => {
  it("reports a copy's active Escape trap to the package", async () => {
    const pkg = await load(async () => import('../hooks/useFocusTrap'));
    const copy = await load(async () => import('../hooks/useFocusTrap'));
    const trap = renderHook(() =>
      copy.useFocusTrapEscapeCompatibilitySignal(true),
    );
    expect(pkg.hasActiveFocusTrapEscape()).toBe(true);
    trap.unmount();
    expect(pkg.hasActiveFocusTrapEscape()).toBe(false);
  });

  it("wraps Tab inside a copy's region nested in a package region", async () => {
    const pkg = await load(async () => import('../hooks/useFocusTrap'));
    const copy = await load(async () => import('../hooks/useFocusTrap'));
    function Region({mod, children}: {mod: typeof pkg; children: ReactNode}) {
      const ref = useRef<HTMLDivElement>(null);
      mod.useFocusRegionContainment(ref, true);
      return <div ref={ref}>{children}</div>;
    }
    let open: () => void = () => {};
    function Page() {
      const [isOpen, setOpen] = useState(false);
      open = () => setOpen(true);
      return (
        <Region mod={pkg}>
          <button type="button">A</button>
          {isOpen && (
            <Region mod={copy}>
              <button type="button">B1</button>
              <button type="button">B2</button>
            </Region>
          )}
        </Region>
      );
    }
    const {getByText} = render(<Page />);
    // The copy's region opens after the package's, as an overlay opened from
    // a page region does, so the package's Tab handler runs first.
    act(() => open());
    getByText('B2').focus();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement?.textContent).toBe('B1');
  });

  it('gives both loads one keyboard layout guide per window', async () => {
    const pkg = await load(async () => import('./keyboardLayoutGuide'));
    const copy = await load(async () => import('./keyboardLayoutGuide'));
    expect(copy.getKeyboardLayoutGuide(window)).toBe(
      pkg.getKeyboardLayoutGuide(window),
    );
  });

  it('recognizes a keyboard target a copy registered', async () => {
    const pkg = await load(async () => import('./keyboardTarget'));
    const copy = await load(async () => import('./keyboardTarget'));
    const target = document.createElement('div');
    const field = document.createElement('input');
    target.append(field);
    document.body.append(target);
    const release = copy.registerKeyboardTarget(target);
    expect(pkg.isInsideKeyboardTarget(field)).toBe(true);
    release();
    target.remove();
  });
});
