// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MobileNavToggle.tsx
 * @input Uses React, Button, Icon, AppShell mobile context; forwards host props
 *   to the Button
 * @output Exports MobileNavToggle, and MobileNavDrawer, the drawer slot that
 *   loads the drawer on first intent or open
 * @position Standalone toggle button; can be placed anywhere in the AppShell tree.
 *
 * Hamburger button that opens/closes the mobile nav drawer.
 * Reads from AppShell mobile context — renders nothing above the mobile
 * breakpoint, without that context, or when AppShell has no mobile
 * navigation.
 * Can be placed anywhere in the component tree (TopNav, content area, custom toolbar, etc.).
 * Host attributes and DOM handlers reach the button; its `aria-expanded` and
 * `aria-controls` stay component-owned, and a caller `onClick` runs after the
 * toggle.
 */

import React, {
  startTransition,
  use,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {Button} from '../Button';
import {Icon} from '../Icon';
import {useAppShellMobile} from '../AppShell/AppShellMobileContext';
import type {BaseProps} from '../BaseProps';
import {composeEventHandlers} from '../utils';
import {createModuleLoader} from '../utils/moduleLoader';
import {createSharedContext} from '../utils/sharedContext';
import {sharedState} from '../utils/sharedRealm';
import {warnOnce} from '../utils/devWarning';
import type * as MobileNavModule from './MobileNav';
import type {MobileNavProps} from './MobileNav';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/MobileNav/MobileNavToggle.generated';

registerEnglishFallback(english);

// The drawer loads on the first intent on the toggle or the first open, never
// while the server renders or the page hydrates. Shell pages that stay closed
// never load it.
const drawerModule = createModuleLoader<typeof MobileNavModule>(
  async () => import('./MobileNav'),
);
type Drawer = (typeof MobileNavModule)['MobileNav'];

// Shared by every copy of Core. Each listener takes the drawer that loaded:
// a copy whose own loader has not run still shows another copy's drawer.
const drawerListeners = sharedState(
  'MobileNav/MobileNavToggle/drawerListeners',
  2,
  () => new Set<(drawer: Drawer) => void>(),
);

function subscribeToDrawer(listener: (drawer: Drawer) => void): () => void {
  drawerListeners.add(listener);
  return () => {
    drawerListeners.delete(listener);
  };
}

const loadedDrawer = () => drawerModule.loaded()?.MobileNav ?? null;

/**
 * Starts loading the drawer, once. Resolves false when the load failed: the
 * toggle and the page keep working, and a later intent tries again. Internal.
 */
export async function loadMobileNavDrawer(): Promise<boolean> {
  let drawer: Drawer;
  try {
    drawer = (await drawerModule.load()).MobileNav;
  } catch {
    warnOnce(
      'mobile-nav:drawer-load-failed',
      'MobileNav',
      'The navigation drawer could not load. The next open tries again.',
    );
    return false;
  }
  for (const listener of drawerListeners) {
    listener(drawer);
  }
  return true;
}

function loadDrawerOnIntent() {
  void loadMobileNavDrawer();
}

function loadDrawerOnHover(event: React.PointerEvent) {
  // A touch reports its own pointerdown, which starts the load.
  if (event.pointerType !== 'touch') {
    loadDrawerOnIntent();
  }
}

/**
 * The drawer once it has loaded. It is null while the server renders and
 * while the page hydrates. The update after a load is a transition, so it
 * waits for server markup that has not hydrated yet instead of replacing it.
 */
function useLoadedDrawer(isListening: boolean): Drawer | null {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  // Syncs with the drawer module's load.
  useEffect(() => {
    if (!isListening) {
      return;
    }
    const update = (loaded: Drawer | null) => {
      startTransition(() => {
        setDrawer(() => loaded);
      });
    };
    update(loadedDrawer());
    return subscribeToDrawer(update);
  }, [isListening]);
  return drawer;
}

// Undefined outside an AppShell, which provides it.
const LoadedDrawerContext = createSharedContext<Drawer | null | undefined>(
  'MobileNav/MobileNavToggle/LoadedDrawerContext',
  1,
  undefined,
);
LoadedDrawerContext.displayName = 'MobileNavLoadedDrawerContext';

/**
 * Re-renders the drawer slot when the drawer loads. AppShell renders it
 * outside the `Activity` boundary that hides a closed drawer: a hidden
 * subtree runs no Effects, but it does take a new context value. So the
 * drawer mounts while it is still closed, and its slide-in starts from the
 * closed state. Internal.
 */
export function MobileNavDrawerLoad({children}: {children: ReactNode}) {
  const drawer = useLoadedDrawer(true);
  return <LoadedDrawerContext value={drawer}>{children}</LoadedDrawerContext>;
}

/**
 * The drawer an AppShell's SideNav or TopNav renders on narrow screens.
 * Until the drawer has loaded it renders an empty, closed `<dialog>` with
 * the drawer's id, so the toggle's `aria-controls` names an element. The
 * swap to the drawer happens only while it is closed: an open made before
 * the load opens the drawer once it has mounted. Internal.
 */
export function MobileNavDrawer(props: MobileNavProps) {
  const loadedInShell = use(LoadedDrawerContext);
  const loadedHere = useLoadedDrawer(loadedInShell === undefined);
  const Drawer = loadedInShell === undefined ? loadedHere : loadedInShell;
  const {isMobileNavOpen, mobileNavId, closeMobileNav} = useAppShellMobile();
  const isOpen = props.isOpen ?? isMobileNavOpen;
  // Syncs the drawer module with an open request, controlled or not. A
  // failed load drops the open, so the toggle does not report a drawer that
  // never shows. This run ignores a result that arrives after it ends: the
  // drawer closed, or the handler changed. So it never closes a closed
  // drawer.
  useEffect(() => {
    if (!isOpen || Drawer != null) {
      return;
    }
    let isCurrent = true;
    void loadMobileNavDrawer().then(isLoaded => {
      if (isCurrent && !isLoaded) {
        (props.onOpenChange ?? closeMobileNav)(false);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, Drawer, props.onOpenChange, closeMobileNav]);
  if (Drawer != null) {
    return <Drawer {...props} />;
  }
  return <dialog id={mobileNavId} data-testid={props['data-testid']} />;
}

export interface MobileNavToggleProps extends Omit<
  BaseProps<HTMLButtonElement>,
  'aria-expanded' | 'aria-controls'
> {
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Custom content to render instead of the default hamburger icon.
   */
  children?: ReactNode;
  /**
   * Accessible label for the toggle button.
   * @default 'Open navigation'
   */
  label?: string;
  /**
   * Test ID for the button element.
   */
  'data-testid'?: string;
}

/**
 * Mobile nav toggle button. Reads from AppShell context to open/close
 * the mobile navigation drawer.
 *
 * Renders nothing above the mobile breakpoint, without an AppShell mobile
 * context (AppShell's, or an `AppShellMobileContext` you provide), or when
 * AppShell has no mobile navigation — safe to include unconditionally in
 * your layout.
 *
 * @example
 * ```
 * <div className="my-toolbar">
 *   <MobileNavToggle />
 *   <h1>Page Title</h1>
 * </div>
 * <MobileNavToggle label="Menu">
 *   <MyCustomMenuIcon />
 * </MobileNavToggle>
 * ```
 */
export function MobileNavToggle({
  ref,
  children,
  label: labelFromProps,
  'data-testid': testId,
  xstyle,
  className,
  style,
  onClick,
  ...rest
}: MobileNavToggleProps) {
  const t = useComponentTranslator();
  const label = labelFromProps ?? t('@astryx.mobileNav.toggle.open');
  const {
    isMobile,
    isMobileNavEnabled,
    isMobileNavOpen,
    mobileNavId,
    toggleMobileNav,
  } = useAppShellMobile();

  // Don't render above the breakpoint or when mobile nav is disabled
  if (!isMobile || !isMobileNavEnabled) {
    return null;
  }

  return (
    <Button
      {...rest}
      ref={ref}
      variant="ghost"
      label={label}
      icon={children ?? <Icon icon="menu" color="inherit" />}
      onClick={composeEventHandlers(toggleMobileNav, onClick)}
      onPointerEnter={composeEventHandlers(
        loadDrawerOnHover,
        rest.onPointerEnter,
      )}
      onPointerDown={composeEventHandlers(
        loadDrawerOnIntent,
        rest.onPointerDown,
      )}
      onFocus={composeEventHandlers(loadDrawerOnIntent, rest.onFocus)}
      aria-expanded={isMobileNavOpen}
      aria-controls={mobileNavId || undefined}
      data-testid={testId ?? 'mobile-nav-toggle'}
      xstyle={xstyle}
      className={className}
      style={style}
      isIconOnly
    />
  );
}

MobileNavToggle.displayName = 'MobileNavToggle';
