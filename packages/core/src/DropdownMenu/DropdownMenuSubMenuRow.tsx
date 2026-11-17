// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file DropdownMenuSubMenuRow.tsx
 * @input DropdownMenuSubMenu props, the DropdownMenu context, Item, Icon, the
 *   shared module loader, and the sub-menu surface component or its loader
 * @output Exports SubMenuRow (a sub-menu's row and its nested surface), the
 *   row styles, the surface contract, and the surface loader for data items
 * @position Internal to DropdownMenu. DropdownMenuSubMenu renders the row with
 *   its surface; renderDropdownItems renders it with the surface's loader.
 *
 * The row is the part of a sub-menu that shows while its level is closed:
 * role, name, tab stop, popup state, chevron. A data-driven menu renders it
 * at once and loads the surface (flyout, drill-in view, keys, hover) on the
 * row's first intent: a mouse or pen entering it, focus, a press, or an open
 * key. The row element stays the same across the load, so focus stays where
 * it is. The latest intent made during the load is held and replayed once by
 * the loaded surface. A failed load leaves the row in place; the next intent
 * asks the loader again.
 *
 * SYNC: When modified, update DropdownMenuSubMenu.tsx (the surface).
 */

import {
  use,
  useCallback,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {flushSync} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {Icon, renderIconSlot} from '../Icon/Icon';
import {Item} from '../Item/Item';
import {
  colorVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
  focusVars,
} from '../theme/tokens.stylex';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {isRenderable} from '../utils/isRenderable';
import {mergeProps} from '../utils/mergeProps';
import {rtlStyles} from '../utils/rtlStyles';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {menuPressLitRowStyle} from '../privateAttributes/menuPressLit.stylex';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {isMenuPressActivation} from '../hooks/useMenuPress';
import {themeProps} from '../utils/themeProps';
import {createModuleLoader} from '../utils/moduleLoader';
import {createDevWarnings} from '../utils/devWarning';
import {keepDisabledRowUnfocused} from './menuItemRoles';
import {
  DropdownMenuSurfaceContext,
  useDropdownMenuContext,
} from './DropdownMenuContext';
import {focusMenuItemOnHover} from './menuItemHover';
import type {DropdownMenuSubMenuProps} from './DropdownMenuSubMenu';

export const subMenuRowStyles = stylex.create({
  root: {
    boxSizing: 'border-box',
    width: '100%',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-2'],
    borderRadius: `max(0px, calc(var(--_dropdown-menu-radius, ${spacingVars['--spacing-2']}) - var(--_dropdown-menu-padding, ${spacingVars['--spacing-1']})))`,
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: {
      default: 'transparent',
      // menuPressLitRowStyle sets the variable on the row a held finger or pen
      // lights.
      ':focus': `var(--_menu-row-focus-paint, ${colorVars['--color-overlay-hover']})`,
    },
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    // Rows show focus with a translucent overlay, which forced colors replace
    // with the page color. The standard focus ring (focusOutlineStyles), drawn
    // inside the row by its own width, marks the focused row in every mode.
    outlineOffset: `calc(-1 * ${focusVars['--focus-outline-width']})`,
  },
  // While the flyout is open, keep the trigger visibly active so the open
  // branch reads as the current path even when focus has moved into the child.
  open: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  disabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  caret: {
    display: 'flex',
    alignItems: 'center',
  },
});

const subMenuRowSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {},
});

/** An intent made on the row before its surface loaded. */
export type SubMenuHeldIntent =
  | {readonly kind: 'open-key'}
  | {readonly kind: 'press'; readonly isPointer: boolean}
  | {readonly kind: 'hover'; readonly enteredAt: number};

/** What the loaded surface does for the row it belongs to. */
export interface SubMenuSurfaceApi {
  click(event: MouseEvent): void;
  keyDown(event: KeyboardEvent): void;
  mouseEnter(): void;
  mouseLeave(event: MouseEvent): void;
  replay(intent: SubMenuHeldIntent): void;
}

/** The row's ids and state that its surface reads and names. */
export interface SubMenuRowLink {
  readonly rowRef: RefObject<HTMLDivElement | null>;
  readonly apiRef: RefObject<SubMenuSurfaceApi | null>;
  readonly triggerId: string;
  readonly contentId: string;
  readonly frameId: string;
  readonly labelId: string;
  readonly viewId: string;
  readonly hasNodeLabel: boolean;
  readonly onFlyoutOpenChange: (isOpen: boolean) => void;
}

export type SubMenuSurfaceProps = Pick<
  DropdownMenuSubMenuProps,
  | 'label'
  | 'isDisabled'
  | 'hasSpinner'
  | 'menuWidth'
  | 'onOpenChange'
  | 'presentation'
  | 'delay'
  | 'hideDelay'
  | 'header'
  | 'footer'
  | 'children'
  | 'menuDataTestId'
> & {readonly link: SubMenuRowLink};

type SubMenuSurface = ComponentType<SubMenuSurfaceProps>;

/** The surface of a data item's sub-menu, loaded on the row's first intent. */
export const subMenuSurfaceLoader = createModuleLoader<SubMenuSurface>(
  async () =>
    import('./DropdownMenuSubMenu').then(module => module.SubMenuSurface),
);

export interface SubMenuRowProps extends DropdownMenuSubMenuProps {
  /** The surface, rendered with the row. */
  surface?: SubMenuSurface;
  /** Loads the surface on the row's first intent instead. */
  loadSurface?: typeof subMenuSurfaceLoader;
  /** What ends the row in place of the chevron, such as a spinner. */
  endAffordance?: ReactNode;
}

// A failed load warns once per page in development.
const warnOnce = createDevWarnings();

/**
 * A sub-menu's row, and its surface once that has loaded.
 * @internal
 */
export function SubMenuRow(props: SubMenuRowProps): ReactNode {
  const {
    icon,
    label,
    description,
    isDisabled = false,
    hasSpinner,
    menuWidth,
    onOpenChange,
    presentation = 'adaptive',
    delay,
    hideDelay,
    header,
    footer,
    children,
    xstyle,
    className,
    style,
    'data-testid': testId,
    menuDataTestId,
    ref,
    id: idProp,
    onMouseEnter,
    onMouseLeave,
    onPointerMove,
    onClick,
    onKeyDown,
    surface,
    loadSurface,
    endAffordance,
    // Host attributes and DOM handlers for the row.
    ...rest
  } = props;

  const menuCtx = useDropdownMenuContext();
  const rootSurface = use(DropdownMenuSurfaceContext);
  const menuSize = menuCtx?.menuSize ?? 'md';
  const hasRegions =
    (isRenderable(header) || isRenderable(footer)) && rootSurface != null;

  const frameId = useId();
  const contentId = useId();
  const generatedTriggerId = useId();
  // A caller's `id` names the row; the flyout stays labelled by it.
  const triggerId = idProp ?? generatedTriggerId;
  const viewId = useId();
  const labelId = useId();
  const stringLabel = typeof label === 'string' ? label : undefined;
  // A node label renders in its own element, so a drilled-in view is named by
  // the label alone, not by the whole row with its description.
  const hasNodeLabel = stringLabel == null && isRenderable(label);
  const rowLabel = hasNodeLabel ? <span id={labelId}>{label}</span> : label;

  // Drill-in: the root keeps a view stack, and the surface pushes this row's
  // view onto it. Decided from the root's pointer kind, or by `presentation`.
  const drillIn = menuCtx?.drillIn;
  const isDrillIn =
    drillIn != null &&
    (presentation === 'drill-in' ||
      (presentation === 'adaptive' && drillIn.isCompactTouch));
  const isOnStack = isDrillIn && drillIn.viewStack.includes(viewId);
  const [isFlyoutOpen, setIsFlyoutOpen] = useState(false);
  const isOpen = isDrillIn ? isOnStack : isFlyoutOpen;

  const rowRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useMergedRefs<HTMLElement>(rowRef, ref);
  const apiRef = useRef<SubMenuSurfaceApi | null>(null);

  const [Surface, setSurface] = useState<SubMenuSurface | null>(
    () => surface ?? loadSurface?.loaded() ?? null,
  );
  const heldIntentRef = useRef<SubMenuHeldIntent | null>(null);
  const isLoadingRef = useRef(false);

  const startLoad = useCallback(() => {
    if (Surface != null || loadSurface == null || isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;
    loadSurface.load().then(
      loaded => {
        isLoadingRef.current = false;
        // Commit the surface synchronously: the held intent replays on the
        // committed surface right after, in this same callback, with no
        // Effect between them.
        // eslint-disable-next-line @eslint-react/dom-no-flush-sync
        flushSync(() => setSurface(() => loaded));
        const intent = heldIntentRef.current;
        heldIntentRef.current = null;
        if (intent != null && rowRef.current?.isConnected === true) {
          apiRef.current?.replay(intent);
        }
      },
      (error: unknown) => {
        isLoadingRef.current = false;
        heldIntentRef.current = null;
        warnOnce(
          'DropdownMenuSubMenu',
          `a sub-menu could not load (${String(error)}). Its row stays; the next intent tries again.`,
          'load-failed',
        );
      },
    );
  }, [Surface, loadSurface]);

  const holdIntent = useCallback(
    (intent: SubMenuHeldIntent) => {
      if (isDisabled) {
        return;
      }
      heldIntentRef.current = intent;
      startLoad();
    },
    [isDisabled, startLoad],
  );

  const handleClick = useCallback(
    (event: MouseEvent) => {
      if (apiRef.current != null) {
        apiRef.current.click(event);
        return;
      }
      if (isDisabled) {
        // As a disabled DropdownMenuItem does: the click is spent, so a
        // caller's onClick composed after this one does not run.
        event.preventDefault();
        return;
      }
      holdIntent({
        kind: 'press',
        isPointer: event.detail > 0 || isMenuPressActivation(),
      });
    },
    [isDisabled, holdIntent],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (apiRef.current != null) {
        apiRef.current.keyDown(event);
        return;
      }
      if (isDisabled) {
        return;
      }
      const isRtl =
        rowRef.current != null &&
        window.getComputedStyle(rowRef.current).direction === 'rtl';
      const openKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
      if (event.key === openKey || event.key === 'Enter' || event.key === ' ') {
        // As the loaded row does: this level handles the key, so the parent
        // menu's handler does not act on it too.
        event.preventDefault();
        event.stopPropagation();
        holdIntent({kind: 'open-key'});
      }
    },
    [isDisabled, holdIntent],
  );

  const handleMouseEnter = useCallback(() => {
    if (apiRef.current != null) {
      apiRef.current.mouseEnter();
      return;
    }
    holdIntent({kind: 'hover', enteredAt: performance.now()});
  }, [holdIntent]);

  const handleMouseLeave = useCallback((event: MouseEvent) => {
    if (apiRef.current != null) {
      apiRef.current.mouseLeave(event);
      return;
    }
    // Leaving drops a held hover.
    if (heldIntentRef.current?.kind === 'hover') {
      heldIntentRef.current = null;
    }
  }, []);

  // Focus and a press from any pointer start the load without an intent of
  // their own: focus opens nothing, and the click that follows a press does.
  const handleFocus = useCallback(() => {
    if (!isDisabled) {
      startLoad();
    }
  }, [isDisabled, startLoad]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) =>
      focusMenuItemOnHover(event, isDisabled),
    [isDisabled],
  );

  const link: SubMenuRowLink = {
    rowRef,
    apiRef,
    triggerId,
    contentId,
    frameId,
    labelId,
    viewId,
    hasNodeLabel,
    onFlyoutOpenChange: setIsFlyoutOpen,
  };

  return (
    <>
      <Item
        // Host attributes and handlers first: the row's role, tab stop, popup
        // state and wiring are set after them, and its own handlers run
        // before the caller's.
        {...rest}
        onMouseDown={composeEventHandlers(
          rest.onMouseDown,
          isDisabled ? keepDisabledRowUnfocused : undefined,
        )}
        onFocus={composeEventHandlers(handleFocus, rest.onFocus)}
        onPointerDown={composeEventHandlers(handleFocus, rest.onPointerDown)}
        ref={rowRefs}
        id={triggerId}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup={hasRegions ? 'dialog' : 'menu'}
        aria-expanded={isOpen}
        aria-controls={isOpen ? (hasRegions ? frameId : contentId) : undefined}
        aria-disabled={isDisabled || undefined}
        data-testid={testId}
        onMouseEnter={composeEventHandlers(handleMouseEnter, onMouseEnter)}
        onMouseLeave={composeEventHandlers(handleMouseLeave, onMouseLeave)}
        onPointerMove={composeEventHandlers(handlePointerMove, onPointerMove)}
        startContent={
          icon
            ? renderIconSlot(icon, {size: 'sm', color: 'secondary'})
            : undefined
        }
        label={rowLabel}
        description={description}
        endContent={
          endAffordance ?? (
            <span {...stylex.props(subMenuRowStyles.caret)}>
              <Icon
                icon="chevronRight"
                size="sm"
                color="secondary"
                xstyle={rtlStyles.mirror}
                {...themeProps('dropdown-menu-indicator-icon')}
              />
            </span>
          )
        }
        // Item reports the click as a generic element event; its root is the
        // row's HTMLElement.
        onClick={(event: MouseEvent) =>
          composeEventHandlers<MouseEvent<HTMLElement>>(
            handleClick,
            onClick,
          )(event as MouseEvent<HTMLElement>)
        }
        onKeyDown={composeEventHandlers<KeyboardEvent<HTMLElement>>(
          handleKeyDown,
          onKeyDown,
        )}
        isDisabled={isDisabled}
        xstyle={[
          focusOutlineStyles.focusVisible,
          subMenuRowStyles.root,
          menuPressLitRowStyle,
          subMenuRowSizeStyles[menuSize],
          isOpen && subMenuRowStyles.open,
          isDisabled && subMenuRowStyles.disabled,
          xstyle,
        ]}
        {...mergeProps(themeProps('dropdown-menu-item', {size: menuSize}), {
          className,
          style,
        })}
      />
      {Surface != null && (
        <Surface
          label={label}
          isDisabled={isDisabled}
          hasSpinner={hasSpinner}
          menuWidth={menuWidth}
          onOpenChange={onOpenChange}
          presentation={presentation}
          delay={delay}
          hideDelay={hideDelay}
          header={header}
          footer={footer}
          menuDataTestId={menuDataTestId}
          link={link}>
          {children}
        </Surface>
      )}
    </>
  );
}
