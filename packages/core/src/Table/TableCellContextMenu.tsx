// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCellContextMenu.tsx
 * @input React (lazy, Suspense), ContextMenuTrigger, useLongPress,
 *   useIsHydrating, useInteractionModalityTracking
 * @output TableCellContextMenu, loadTableContextMenu
 * @position Renders a cell's `contextMenuActions` for TableCell and
 * TableHeaderCell. The menu code loads only for cells that have actions. The
 * cell renders the trigger, and the menu loads beside it, so the content
 * keeps its node, focus and state. The cell holds an invocation that comes
 * before the load and replays it when the menu arrives.
 */

import {lazy, Suspense, useEffect, useRef, type ReactNode} from 'react';
import type {
  ContextMenuExternalTrigger,
  ContextMenuTriggerHandlers,
} from '../ContextMenu/ContextMenu';
import {ContextMenuTrigger} from '../ContextMenu/ContextMenuTrigger';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {useLongPress} from '../hooks/useLongPress';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {currentGesture} from '../Layer/gestureCounter';
import {useInteractionModalityTracking} from '../utils/interactionModality';
import type {StyleXStyles} from '../theme/types';
import type {TableContextActions} from './types';
import type {TableContextMenuForTrigger} from './tableContextMenu';
import {hasContextActions} from './tableContextActions';

interface TableContextMenuModule {
  TableContextMenuForTrigger: typeof TableContextMenuForTrigger;
}

let menuModule: Promise<TableContextMenuModule> | null = null;

/**
 * Starts loading the table context menu, once. The returned promise settles
 * when the module has loaded; a cell with actions renders its menu a tick
 * later.
 */
export async function loadTableContextMenu(): Promise<TableContextMenuModule> {
  menuModule ??= import('./tableContextMenu');
  return menuModule;
}

const LazyTableContextMenu = lazy(async () =>
  loadTableContextMenu().then(mod => ({
    default: mod.TableContextMenuForTrigger,
  })),
);

/** An invocation that arrived before the menu, replayed when it attaches. */
type HeldInvocation = {
  owner: object;
  gesture: number;
} & (
  | {kind: 'contextmenu'; event: React.MouseEvent<HTMLElement>}
  | {kind: 'long-press'; point: {x: number; y: number}}
);

// One hold serves all cells. A later invocation replaces it, as a second
// press closes the first menu after the load.
let heldInvocation: HeldInvocation | null = null;

function holdInvocation(held: HeldInvocation): void {
  heldInvocation = held;
}

function dropHeldInvocation(owner: object): void {
  if (heldInvocation?.owner === owner) {
    heldInvocation = null;
  }
}

function takeHeldInvocation(owner: object): HeldInvocation | null {
  const held = heldInvocation;
  if (held?.owner !== owner) {
    return null;
  }
  heldInvocation = null;
  return held;
}

/**
 * A cell's content, wrapped in a right-click context menu when `actions` can
 * open one. Without actions it returns the content untouched, so the native
 * browser menu passes through and the menu code never loads.
 */
export function TableCellContextMenu({
  children,
  actions,
  triggerXstyle,
}: {
  children: ReactNode;
  actions: TableContextActions | undefined;
  triggerXstyle?: StyleXStyles | StyleXStyles[];
}): ReactNode {
  if (actions === undefined || !hasContextActions(actions)) {
    return children;
  }
  return (
    <CellTrigger actions={actions} triggerXstyle={triggerXstyle}>
      {children}
    </CellTrigger>
  );
}

function CellTrigger({
  children,
  actions,
  triggerXstyle,
}: {
  children: ReactNode;
  actions: TableContextActions;
  triggerXstyle?: StyleXStyles | StyleXStyles[];
}): ReactNode {
  const triggerRef = useRef<HTMLElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const handlersRef = useRef<ContextMenuTriggerHandlers | null>(null);
  // True from a touch that starts before the menu attaches until it ends. The
  // cell's own detector follows that press to its end, even if the menu
  // attaches during it, because the menu's detector never saw it start.
  const earlyPressRef = useRef(false);

  const triggerHandle = useRef<ContextMenuExternalTrigger>({
    triggerRef,
    anchorRef,
    onHandlersChange: handlers => {
      handlersRef.current = handlers;
      if (handlers == null) {
        return;
      }
      const held = takeHeldInvocation(triggerRef);
      if (held == null) {
        return;
      }
      // Replay after the commit that attached the menu, so its layer is
      // anchored before it opens. A press or key since the hold drops it.
      queueMicrotask(() => {
        if (
          handlersRef.current !== handlers ||
          currentGesture() !== held.gesture
        ) {
          return;
        }
        if (held.kind === 'contextmenu') {
          handlers.onContextMenu(held.event);
        } else {
          handlers.openFromLongPress(held.point);
        }
      });
    },
  }).current;

  // The menu is not in server markup or the hydrating render: a lazy
  // component that has not loaded would abort hydration. The trigger holds
  // an invocation until the menu renders right after hydration.
  const isHydrating = useIsHydrating();
  // The menu reads the last input type when it opens. The cell starts
  // tracking here, so the tracker records a press before the menu mounts.
  const {ref: modalityRef} = useInteractionModalityTracking();
  const mergedTriggerRef = useMergedRefs(triggerRef, modalityRef);

  // Syncs the shared hold with this cell's lifetime: a cell that unmounts
  // before its menu loads drops its own hold, and keeps another cell's.
  useEffect(() => () => dropHeldInvocation(triggerRef), []);

  // The same hold time, movement tolerance and lift rule as the menu's own
  // long press, for a press that starts before the menu attaches.
  const earlyLongPress = useLongPress({
    onLongPress: point => {
      const handlers = handlersRef.current;
      if (handlers != null) {
        handlers.openFromLongPress(point);
      } else {
        holdInvocation({
          owner: triggerRef,
          gesture: currentGesture(),
          kind: 'long-press',
          point,
        });
      }
    },
  });

  return (
    <>
      <ContextMenuTrigger
        ref={mergedTriggerRef}
        anchorRef={anchorRef}
        xstyle={triggerXstyle}
        onContextMenu={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onContextMenu(event);
            return;
          }
          // Hold the invocation until the menu loads. Then the browser's own
          // menu does not open.
          event.preventDefault();
          holdInvocation({
            owner: triggerRef,
            gesture: currentGesture(),
            kind: 'contextmenu',
            event,
          });
          void loadTableContextMenu();
        }}
        onTouchStart={event => {
          const handlers = handlersRef.current;
          if (handlers != null && !earlyPressRef.current) {
            handlers.onTouchStart(event);
            return;
          }
          earlyPressRef.current = true;
          earlyLongPress.onTouchStart(event);
          void loadTableContextMenu();
        }}
        onTouchMove={event => {
          if (earlyPressRef.current) {
            earlyLongPress.onTouchMove(event);
          } else {
            handlersRef.current?.onTouchMove(event);
          }
        }}
        onTouchEnd={event => {
          if (earlyPressRef.current) {
            earlyLongPress.onTouchEnd(event);
            earlyPressRef.current = event.touches.length > 0;
          } else {
            handlersRef.current?.onTouchEnd(event);
          }
        }}
        onTouchCancel={event => {
          if (earlyPressRef.current) {
            earlyLongPress.onTouchCancel(event);
            earlyPressRef.current = false;
          } else {
            handlersRef.current?.onTouchCancel(event);
          }
        }}>
        {children}
      </ContextMenuTrigger>
      {isHydrating ? null : (
        <Suspense fallback={null}>
          <LazyTableContextMenu actions={actions} trigger={triggerHandle} />
        </Suspense>
      )}
    </>
  );
}
