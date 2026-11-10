// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TableCellContextMenu.tsx
 * @input React (lazy, Suspense), createModuleLoader, ContextMenuTrigger,
 *   useLongPress, useIsHydrating, useInteractionModalityTracking
 * @output TableCellContextMenu, loadTableContextMenu
 * @position Renders a cell's `contextMenuActions` for TableCell and
 * TableHeaderCell. The menu code loads only for cells that have actions. The
 * cell renders the trigger, and the menu loads beside it, so the content
 * keeps its node, focus and state. The cell holds an invocation that comes
 * before the load and replays it when the menu arrives.
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
import {useLongPress} from '../hooks/useLongPress';
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
      if (held == null) {
        return;
      }
      // Replay after the commit that attached the menu, so the menu anchors its
      // layer before it opens. A press or key since the hold drops it.
      queueMicrotask(() => {
        if (
          handlersRef.current !== handlers ||
          currentGesture() !== held.gesture
        ) {
          return;
        }
        handlers.openAtTriggerPoint(held.point);
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
        const rect = triggerRef.current?.getBoundingClientRect();
        holdInvocation({
          owner: triggerRef,
          gesture: currentGesture(),
          point: {
            x: rect ? point.x - rect.left : point.x,
            y: rect ? point.y - rect.top : point.y,
            isTouch: true,
          },
        });
      }
    },
  });

  // A failed load ends this cell's early press too, so its long press cannot
  // hold an invocation that no menu will open.
  const onMenuUnavailable = useRef(() => {
    earlyLongPress.cancel();
    earlyPressRef.current = false;
    dropHeldInvocation(triggerRef);
    setMenuUnavailable(true);
  }).current;

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
          if (handlers != null && !earlyPressRef.current) {
            handlers.onTouchStart(event);
            return;
          }
          if (isMenuUnavailable) {
            retryMenu();
            if (tableContextMenu.loaded() == null) {
              return;
            }
          }
          earlyPressRef.current = true;
          earlyLongPress.onTouchStart(event);
          preloadTableContextMenu();
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
