// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCellContextMenu.tsx
 * @input React (lazy, Suspense), createModuleLoader, ContextMenuTrigger,
 *   useIsHydrating, useInteractionModalityTracking
 * @output TableCellContextMenu, loadTableContextMenu
 * @position Renders a cell's `contextMenuActions` for TableCell and
 * TableHeaderCell. The menu code loads only for cells that have actions. The
 * cell renders the trigger, and the menu loads beside it, so the content
 * keeps its node, focus and state. The cell holds an invocation that comes
 * before the load and replays it when the menu arrives. It recognizes no
 * gesture itself: the loaded menu reads a held touch's events.
 */

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import type {
  ContextMenuExternalTrigger,
  ContextMenuTriggerHandlers,
} from '../ContextMenu/ContextMenu';
import {
  ContextMenuTrigger,
  contextMenuPoint,
  type TriggerPoint,
} from '../ContextMenu/ContextMenuTrigger';
import {useIsHydrating} from '../hooks/useIsHydrating';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {currentGesture} from '../Layer/gestureCounter';
import {useInteractionModalityTracking} from '../utils/interactionModality';
import {createModuleLoader} from '../utils/moduleLoader';
import {realmValue, sharedKey} from '../utils/sharedRealm';
import type {StyleXStyles} from '../theme/types';
import type {TableContextActions} from './types';
import type {TableContextMenuForTrigger} from './tableContextMenu';
import {hasContextActions} from './tableContextActions';

interface TableContextMenuModule {
  TableContextMenuForTrigger: typeof TableContextMenuForTrigger;
}

const tableContextMenu = createModuleLoader<TableContextMenuModule>(
  async () => import('./tableContextMenu'),
);

/**
 * Starts loading the table context menu, once. The returned promise settles
 * when the module has loaded; a cell with actions renders its menu a tick
 * later. A failed load (a dropped connection, a removed chunk) is not kept,
 * so the next call asks the module loader again.
 */
export const loadTableContextMenu = tableContextMenu.load;

/** Starts the load for an early invocation. The lazy menu reports a failure. */
function preloadTableContextMenu(): void {
  loadTableContextMenu().catch(() => {});
}

type LazyMenuProps = ComponentProps<typeof TableContextMenuForTrigger> & {
  onUnavailable: () => void;
};

/** Renders in place of the menu when it failed to load. */
function MenuUnavailable({onUnavailable}: LazyMenuProps): ReactNode {
  // Syncs the cell with the failed load: it drops its held invocation and
  // stops holding, so the browser's own menu returns.
  useEffect(onUnavailable, [onUnavailable]);
  return null;
}

// React.lazy keeps a rejection. A failed load resolves to MenuUnavailable
// instead of throwing. A cell mounted later gets a new lazy that loads again.
function createLazyTableContextMenu() {
  return lazy(async () => {
    try {
      const mod = await loadTableContextMenu();
      return {default: mod.TableContextMenuForTrigger};
    } catch {
      LazyTableContextMenu = createLazyTableContextMenu();
      return {default: MenuUnavailable};
    }
  });
}

let LazyTableContextMenu: ComponentType<LazyMenuProps> =
  createLazyTableContextMenu();

/**
 * An invocation that arrived before the menu, replayed when it attaches. Its
 * point is in the trigger's own box, so a scroll during the load keeps it on
 * the content.
 */
type HeldInvocation = {
  owner: object;
  gesture: number;
  point: TriggerPoint;
};

// One hold serves all cells, in every copy of Core on the page. A later
// invocation replaces it, as a second press closes the first menu after the
// load.
const hold = realmValue(sharedKey('table/context-menu-hold', 1), () => ({
  current: null as HeldInvocation | null,
}));

function holdInvocation(held: HeldInvocation): void {
  hold.current = held;
}

function dropHeldInvocation(owner: object): void {
  if (hold.current?.owner === owner) {
    hold.current = null;
  }
}

function takeHeldInvocation(owner: object): HeldInvocation | null {
  const held = hold.current;
  if (held?.owner !== owner) {
    return null;
  }
  hold.current = null;
  return held;
}

type TouchPhase = 'start' | 'move' | 'end' | 'cancel';

/**
 * The touch events of a press that starts before the menu attaches. The menu
 * gets them in order when it attaches. Its long press then times the press
 * from the touch's own start, and tells a long press from a tap.
 */
type HeldTouch = {
  gesture: number;
  events: {phase: TouchPhase; event: ReactTouchEvent<HTMLElement>}[];
};

/** Adds a touch event to a held press. Only the last move is kept. */
function holdTouchEvent(
  held: HeldTouch | null,
  phase: TouchPhase,
  event: ReactTouchEvent<HTMLElement>,
): HeldTouch | null {
  if (phase === 'start' && event.touches.length === 1) {
    return {gesture: currentGesture(), events: [{phase, event}]};
  }
  if (held == null) {
    return null;
  }
  const last = held.events.at(-1);
  if (last?.phase === 'end' || last?.phase === 'cancel') {
    return held;
  }
  const events =
    phase === 'move' && last?.phase === 'move'
      ? held.events.slice(0, -1)
      : held.events;
  return {...held, events: [...events, {phase, event}]};
}

function replayTouch(
  held: HeldTouch,
  handlers: ContextMenuTriggerHandlers,
): void {
  for (const {phase, event} of held.events) {
    if (phase === 'start') {
      handlers.onTouchStart(event);
    } else if (phase === 'move') {
      handlers.onTouchMove(event);
    } else if (phase === 'end') {
      handlers.onTouchEnd(event);
    } else {
      handlers.onTouchCancel(event);
    }
  }
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
  const heldTouchRef = useRef<HeldTouch | null>(null);
  // True after this cell's menu failed to load, until a later load succeeds.
  const [isMenuUnavailable, setMenuUnavailable] = useState(false);
  const retryMenu = () => {
    loadTableContextMenu().then(
      () => setMenuUnavailable(false),
      () => {},
    );
  };

  const triggerHandle = useRef<ContextMenuExternalTrigger>({
    triggerRef,
    anchorRef,
    onHandlersChange: handlers => {
      handlersRef.current = handlers;
      if (handlers == null) {
        return;
      }
      const held = takeHeldInvocation(triggerRef);
      const heldTouch = heldTouchRef.current;
      heldTouchRef.current = null;
      if (held == null && heldTouch == null) {
        return;
      }
      // Replay after the commit that attached the menu, so the menu anchors its
      // layer before it opens. A press or key since the hold drops it.
      queueMicrotask(() => {
        if (handlersRef.current !== handlers) {
          return;
        }
        if (heldTouch != null && currentGesture() === heldTouch.gesture) {
          replayTouch(heldTouch, handlers);
        }
        if (held != null && currentGesture() === held.gesture) {
          handlers.openAtTriggerPoint(held.point);
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

  // A failed load drops this cell's held touch and invocation, so no later
  // menu opens for them.
  const onMenuUnavailable = useRef(() => {
    heldTouchRef.current = null;
    dropHeldInvocation(triggerRef);
    setMenuUnavailable(true);
  }).current;

  // Before the menu attaches, a touch only starts the load and is held.
  const holdTouch = (
    phase: TouchPhase,
    event: ReactTouchEvent<HTMLElement>,
  ): void => {
    heldTouchRef.current = holdTouchEvent(heldTouchRef.current, phase, event);
  };

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
          if (isMenuUnavailable) {
            retryMenu();
            // Another cell may have loaded the menu since this cell's load
            // failed. Then this invocation waits for this cell's menu.
            if (tableContextMenu.loaded() == null) {
              return;
            }
          }
          // Hold the invocation until the menu loads. Then the browser's own
          // menu does not open.
          event.preventDefault();
          holdInvocation({
            owner: triggerRef,
            gesture: currentGesture(),
            point: contextMenuPoint(event, triggerRef.current),
          });
          preloadTableContextMenu();
        }}
        onTouchStart={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onTouchStart(event);
            return;
          }
          if (isMenuUnavailable) {
            retryMenu();
            if (tableContextMenu.loaded() == null) {
              return;
            }
          }
          holdTouch('start', event);
          preloadTableContextMenu();
        }}
        onTouchMove={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onTouchMove(event);
          } else {
            holdTouch('move', event);
          }
        }}
        onTouchEnd={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onTouchEnd(event);
          } else {
            holdTouch('end', event);
          }
        }}
        onTouchCancel={event => {
          const handlers = handlersRef.current;
          if (handlers != null) {
            handlers.onTouchCancel(event);
          } else {
            holdTouch('cancel', event);
          }
        }}>
        {children}
      </ContextMenuTrigger>
      {isHydrating || isMenuUnavailable ? null : (
        <Suspense fallback={null}>
          <LazyTableContextMenu
            actions={actions}
            trigger={triggerHandle}
            onUnavailable={onMenuUnavailable}
          />
        </Suspense>
      )}
    </>
  );
}
