// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file menuPressContinuation.fixture.tsx
 * @input useMenuSurfacePress (its continueGesture)
 * @output ContinuedPressFixture: a plain button whose finger long press opens
 *   a list menu under the held finger and hands that finger to the menu's
 *   press model (`module:DropdownMenu/useMenuPress` FR11), with each picked
 *   row printed outside the menu
 * @position The fixture the menu-press continuation interaction spec drives
 *   (hooks/__tests__/MenuPressContinuation.interaction.browser.spec.ts),
 *   through apps/storybook/stories/MenuPressContinuationA11y.stories.tsx.
 *   No component hands a pointer over yet; this stands in for the context
 *   menu's long press FR11 names.
 *
 * SYNC: The spec aims at rows from menuPressContinuation.geometry.ts.
 */

import {useCallback, useEffect, useRef, useState} from 'react';
import {useMenuSurfacePress, type MenuPressContinuation} from '../useMenuPress';
import {
  CONTINUED_PRESS_HOLD_MS,
  CONTINUED_PRESS_ROWS,
  CONTINUED_PRESS_ROW_PX,
} from './menuPressContinuation.geometry';

export function ContinuedPressFixture() {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [picked, setPicked] = useState<ReadonlyArray<string>>([]);
  // The touch model the press model needs for FR11's handoff: 'uikit', as
  // DropdownMenu's default presentation runs it for a finger on every device
  // (`spec:AST-094` FR43).
  const press = useMenuSurfacePress({
    menuRef,
    itemSelector: '[role="menuitem"]',
    onDismiss: () => setIsOpen(false),
    touchModel: 'uikit',
  });
  const holdTimerRef = useRef<number | null>(null);
  const handOffRef = useRef<MenuPressContinuation | null>(null);
  const continueGesture = press.continueGesture;

  // Hands the held pointer to the menu as its element attaches, so the press
  // model listens in the menu's document.
  const attachMenu = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node;
      if (node != null && handOffRef.current != null) {
        continueGesture(handOffRef.current);
        handOffRef.current = null;
      }
    },
    [continueGesture],
  );

  const clearHold = () => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };
  // Clears a pending hold on unmount.
  useEffect(() => clearHold, []);

  return (
    <div style={{padding: 24, width: 240}}>
      <button
        type="button"
        style={{
          display: 'block',
          width: 200,
          height: CONTINUED_PRESS_ROW_PX,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          if (event.pointerType === 'mouse' || isOpen) {
            return;
          }
          const {pointerId} = event;
          const pointerType = event.pointerType === 'pen' ? 'pen' : 'touch';
          clearHold();
          holdTimerRef.current = window.setTimeout(() => {
            holdTimerRef.current = null;
            handOffRef.current = {pointerId, pointerType, time: Date.now()};
            setIsOpen(true);
          }, CONTINUED_PRESS_HOLD_MS);
        }}
        onPointerUp={clearHold}
        onPointerCancel={clearHold}>
        Hold me
      </button>
      {isOpen ? (
        <div
          ref={attachMenu}
          role="menu"
          aria-label="Actions"
          tabIndex={-1}
          {...press.menuProps}
          style={{display: 'flex', flexDirection: 'column', width: 200}}>
          {CONTINUED_PRESS_ROWS.map(label => (
            <div
              key={label}
              role="menuitem"
              tabIndex={-1}
              style={{
                height: CONTINUED_PRESS_ROW_PX,
                boxSizing: 'border-box',
                padding: 12,
              }}
              onClick={() => {
                setPicked(previous => [...previous, label]);
                setIsOpen(false);
              }}>
              {label}
            </div>
          ))}
        </div>
      ) : null}
      <output data-testid="picked">{picked.join(',')}</output>
    </div>
  );
}
