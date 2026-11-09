// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file HoverCard.tsx
 * @input Uses React, useHoverCard hook
 * @output Exports HoverCard component for hover/focus triggered layers
 * @position Layer component; inline-safe trigger wrapper, floating layer hosted by useLayer
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/HoverCard/HoverCard.test.tsx
 * - /packages/core/src/HoverCard/HoverCard.doc.mjs
 * - /packages/core/src/HoverCard/index.ts
 * - /apps/storybook/stories/HoverCard.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/HoverCard/ (showcase blocks)
 */

import {
  useCallback,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {isRenderable} from '../utils/isRenderable';
import {observeMutations} from '../utils/sharedMutationObserver';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import * as stylex from '@stylexjs/stylex';
import {focusOutlineProps} from '../utils/focusOutline.stylex';
import {
  useHoverCard,
  type HoverCardFocusTrigger,
  type HoverCardTouchTrigger,
} from './useHoverCard';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import type {BaseProps} from '../BaseProps';
import {colorVars, spacingVars} from '../theme/tokens.stylex';

export type {
  HoverCardFocusTrigger,
  HoverCardTouchTrigger,
} from './useHoverCard';
import {mergeIds} from './mergeIds';
import {
  ROLELESS_TRIGGER,
  applyPopupTriggerAttributes,
  labelledTriggerAttributes,
  popupTriggerSupport,
} from './popupTrigger';

const styles = stylex.create({
  wrapperContents: {
    display: 'contents',
  },
  wrapperInline: {
    display: 'inline',
  },
  hoverIndication: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dashed',
    textDecorationColor: colorVars['--color-border-emphasized'],
    textUnderlineOffset: spacingVars['--spacing-0-5'],
  },
});

export interface HoverCardProps extends Pick<
  BaseProps,
  'xstyle' | 'className' | 'style'
> {
  /**
   * The trigger element(s). Children refs are preserved.
   */
  children: ReactNode;

  /**
   * Content to display in the hover card.
   */
  content: ReactNode;

  /**
   * Position placement relative to anchor
   * @default 'above'
   */
  placement?: LayerPlacement;

  /**
   * Alignment along the placement axis
   * @default 'center'
   */
  alignment?: LayerAlignment;

  /**
   * Delay before showing on hover (ms)
   * @default 300
   */
  delay?: number;

  /**
   * Delay before hiding after mouse/focus leave (ms)
   * @default 200
   */
  hideDelay?: number;

  /**
   * When to trigger on focus:
   * - `auto`: focus on the trigger itself, or within a trigger that is
   *   focusable when focus arrives
   * - `always`: focus on the trigger or anything inside it
   * - `never`: never on focus (for composite widgets)
   *
   * @default 'auto'
   */
  focusTrigger?: HoverCardFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the card, unless the trigger performs an action of its
   *   own (a button, a link, a form control) — that tap belongs to the control
   * - `tap`: tap always opens the card, even on a trigger that acts
   * - `none`: touch never opens the card
   *
   * @default 'auto'
   */
  touchTrigger?: HoverCardTouchTrigger;

  /**
   * Whether the hover card is enabled.
   * When false, hover/focus triggers are disabled.
   *
   * @default true
   */
  isEnabled?: boolean;

  /**
   * Accessible name for the hover card popup.
   *
   * When provided, the popup is exposed to assistive technology as a named
   * `role="dialog"`. When omitted, the popup falls back to `role="group"` —
   * a group may validly be unnamed, an unnamed dialog may not.
   */
  label?: string;

  /**
   * Callback fired when hover card visibility changes.
   * Called with `true` when shown and `false` when hidden.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Whether to show hover indication (dashed underline) on a text trigger.
   * An element trigger keeps its own styling, so this has no effect on it.
   * - `'auto'`: Show when children is text: strings and numbers, such as
   *   `Edited {when}`, with holes such as `false` and `null` ignored
   * - `true`: Show on a text trigger
   * - `false`: Never show
   *
   * @default 'auto'
   */
  hasHoverIndication?: 'auto' | boolean;

  /**
   * Controlled open state. When provided, overrides the hover trigger:
   * - `true`: force-show the hover card (hover/focus hide is suppressed)
   * - `false`: hide the hover card and keep hover and focus from opening it
   * - `undefined`: uncontrolled — hover/focus triggers manage visibility
   *
   * A controlled hover card still takes Escape when it is the top-most layer,
   * and answers by calling `onOpenChange(false)` without hiding itself —
   * closing is your update's decision, exactly as for a controlled Dialog.
   * Ignore the call and the card stays, and so does the press: nothing
   * underneath dismisses.
   */
  isOpen?: boolean;

  /**
   * Whether the hover card should be shown on mount.
   * The hover card is still dismissible — this just opens it initially.
   */
  isDefaultOpen?: boolean;
}

/**
 * Check if children are text-only (no React elements)
 */
function isTextOnly(children: ReactNode): boolean {
  if (typeof children === 'string' || typeof children === 'number') {
    return true;
  }
  // Text written around an expression, such as `Edited {when}`, reaches React
  // as several strings. Holes that render nothing do not change that; one
  // element does.
  if (!Array.isArray(children)) {
    return false;
  }
  let hasText = false;
  for (const child of children.flat(Infinity) as ReactNode[]) {
    if (!isRenderable(child)) {
      continue;
    }
    if (typeof child !== 'string' && typeof child !== 'number') {
      return false;
    }
    hasText = true;
  }
  return hasText;
}

/**
 * HoverCard component for displaying interactive content on hover/focus.
 *
 * Uses a display:contents wrapper so children refs are preserved.
 * Uses CSS anchor positioning and the Popover API for optimal performance.
 *
 * @example
 * ```
 * <HoverCard
 *   content={<ProfileCard user={user} />}
 *   placement="above">
 *   <Button>Hover me</Button>
 * </HoverCard>
 * ```
 */
export function HoverCard({
  children,
  content,
  placement = 'above',
  alignment = 'center',
  delay = 300,
  hideDelay = 200,
  focusTrigger = 'auto',
  touchTrigger = 'auto',
  isEnabled = true,
  label,
  onOpenChange,
  hasHoverIndication = 'auto',
  isOpen,
  isDefaultOpen,
  xstyle,
  className,
  style,
}: HoverCardProps): ReactElement {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const textOnly = isTextOnly(children);

  // Determine if hover indication should be shown
  const showHoverIndication =
    hasHoverIndication === true || (hasHoverIndication === 'auto' && textOnly);

  const handleShow = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handleHide = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  // Use the hook for all hover card behavior
  const hoverCard = useHoverCard({
    placement,
    alignment,
    delay,
    hideDelay,
    focusTrigger,
    touchTrigger,
    isEnabled,
    label,
    isOpen,
    isDefaultOpen,
    onShow: handleShow,
    onHide: handleHide,
  });

  // The wrapper's first element is the trigger, and it can be replaced after
  // mount: by new children, or by a child component that swaps its own root
  // without a render here. Syncs with the DOM: on a replacement the wiring
  // below re-runs, so the old element is released before the new one is wired.
  const [triggerReplacements, setTriggerReplacements] = useState(0);
  const observedTriggerRef = useRef<Element | null>(null);
  useIsomorphicLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (textOnly || wrapper == null) {
      return;
    }
    observedTriggerRef.current = wrapper.firstElementChild;
    return observeMutations(wrapper, {childList: true}, () => {
      const trigger = wrapper.firstElementChild;
      if (trigger === observedTriggerRef.current) {
        return;
      }
      observedTriggerRef.current = trigger;
      setTriggerReplacements(count => count + 1);
    });
  }, [textOnly]);

  // For element children with display:contents, attach ref to first child
  useIsomorphicLayoutEffect(() => {
    if (textOnly) {
      return;
    } // Skip for text-only (ref is on wrapper)

    const wrapper = wrapperRef.current;
    if (!wrapper) {
      return;
    }

    const firstChild = wrapper.firstElementChild as HTMLElement | null;
    if (!firstChild) {
      return;
    }

    // Use combined ref for position + interaction
    hoverCard.ref(firstChild);

    if (label) {
      // When named, the hover card is a dialog. The trigger names it through
      // aria-controls, not aria-describedby, which is for plain-text
      // descriptions, not navigable regions. The trigger's own popup
      // attributes (e.g. a menu button's) come back on cleanup.
      const own = {
        haspopup: firstChild.getAttribute('aria-haspopup'),
        controls: firstChild.getAttribute('aria-controls'),
        expanded: firstChild.getAttribute('aria-expanded'),
      };
      applyPopupTriggerAttributes(
        firstChild,
        labelledTriggerAttributes(popupTriggerSupport(firstChild), own, {
          id: hoverCard.id,
          isOpen: hoverCard.isOpen,
        }),
      );

      return () => {
        hoverCard.ref(null);
        applyPopupTriggerAttributes(
          firstChild,
          labelledTriggerAttributes(ROLELESS_TRIGGER, own, {
            id: null,
            isOpen: false,
          }),
        );
      };
    }

    // Unnamed fallback: the popup remains role="group", which is not a dialog,
    // so keep the previous description relationship until a naming decision is
    // made for the no-label case (tracked in #5049).
    const existingDescribedBy = firstChild.getAttribute('aria-describedby');
    firstChild.setAttribute(
      'aria-describedby',
      mergeIds(existingDescribedBy, hoverCard.describedBy) ?? '',
    );

    return () => {
      hoverCard.ref(null);
      if (existingDescribedBy) {
        firstChild.setAttribute('aria-describedby', existingDescribedBy);
      } else {
        firstChild.removeAttribute('aria-describedby');
      }
    };
  }, [
    textOnly,
    label,
    hoverCard.ref,
    hoverCard.id,
    hoverCard.isOpen,
    hoverCard.describedBy,
    triggerReplacements,
  ]);

  // While closed, useLayer leaves only an inert <template> marker at this JSX
  // position. When the card needs to open, it uses that marker to keep the
  // final layer inline when the parent is safe or portal it outside a <p>,
  // link, or other ancestor that cannot contain it safely.
  const renderedHoverCard = hoverCard.renderHoverCard(content, {
    xstyle,
    className,
    style,
  });

  // For text-only children: use inline span with ref on wrapper
  if (textOnly) {
    return (
      <>
        <span
          ref={hoverCard.ref}
          tabIndex={0}
          // The wrapper is a role-less <span>: when labelled, it names the
          // open card through aria-controls only.
          {...(label
            ? labelledTriggerAttributes(
                ROLELESS_TRIGGER,
                {},
                {id: hoverCard.id, isOpen: hoverCard.isOpen},
              )
            : null)}
          aria-describedby={label ? undefined : hoverCard.describedBy}
          // The span is a tab stop Astryx adds: it draws the shared ring,
          // which a theme restyles through the focus-outline tokens.
          {...focusOutlineProps.focusVisible(
            styles.wrapperInline,
            showHoverIndication && styles.hoverIndication,
          )}>
          {children}
        </span>
        {renderedHoverCard}
      </>
    );
  }

  // For element children: use inline-safe display:contents, ref on first child
  return (
    <>
      <span ref={wrapperRef} {...stylex.props(styles.wrapperContents)}>
        {children}
      </span>
      {renderedHoverCard}
    </>
  );
}

HoverCard.displayName = 'HoverCard';
