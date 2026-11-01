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
 * - /packages/core/src/HoverCard/index.ts
 * - /apps/storybook/stories/HoverCard.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/HoverCard/ (showcase blocks)
 */

import {useCallback, useRef, type ReactElement, type ReactNode} from 'react';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import * as stylex from '@stylexjs/stylex';
import {
  useHoverCard,
  type HoverCardFocusTrigger,
  type HoverCardPressTrigger,
  type HoverCardTouchTrigger,
} from './useHoverCard';
import {isPressPinTrigger, stopPressPinClick} from '../Layer/usePressPin';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import type {BaseProps} from '../BaseProps';
import {colorVars, spacingVars} from '../theme/tokens.stylex';

export type {
  HoverCardFocusTrigger,
  HoverCardPressTrigger,
  HoverCardTouchTrigger,
} from './useHoverCard';

// `aria-haspopup` and `aria-controls` are global, so any trigger may carry
// them. `aria-expanded` is not. This is the ARIA 1.2 "Supported States and
// Properties" list for it — deliberately the narrow reading: axe accepts the
// attribute on rather more roles, since it also allows every subclass of these,
// so a role outside this set is not necessarily a violation. Widening it is
// safe; the set is a floor, not the spec's ceiling. The same rule is applied in
// Chat/useTriggerMenu.tsx, which only emits the combobox attributes once the
// element is actually a combobox.
const EXPANDABLE_ROLES = new Set([
  'application',
  'button',
  'checkbox',
  'columnheader',
  'combobox',
  'gridcell',
  'link',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'treeitem',
]);

const BUTTON_INPUT_TYPES = new Set(['button', 'submit', 'reset', 'image']);

// Deliberately partial, and unlisted elements are read as role-less: dropping
// aria-expanded where it might have been legal costs an AT user a state they
// can still infer, whereas emitting it where it is illegal is a critical
// aria-allowed-attr defect.
function supportsAriaExpanded(el: HTMLElement): boolean {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) {
    return EXPANDABLE_ROLES.has(explicit);
  }
  switch (el.tagName) {
    case 'BUTTON':
    case 'SUMMARY':
      return true;
    case 'A':
    case 'AREA':
      return el.hasAttribute('href');
    case 'INPUT':
      // The button-flavoured input types map to role="button"; every other
      // type maps to a textbox-family role, which does not take it.
      return BUTTON_INPUT_TYPES.has(
        (el as HTMLInputElement).type?.toLowerCase(),
      );
    case 'SELECT':
      // combobox when it is a single-line picker, listbox otherwise; both
      // support aria-expanded.
      return true;
    default:
      return false;
  }
}

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
   * - `auto`: Only if element is naturally focusable
   * - `always`: Always attach focus listeners
   * - `never`: Never attach focus listeners (for composite widgets)
   *
   * @default 'auto'
   */
  focusTrigger?: HoverCardFocusTrigger;

  /**
   * What a tap does on a touch pointer, where there is no hover:
   * - `auto`: tap opens the card, unless the trigger performs an action of its
   *   own (a button, a link, a form control) — that tap belongs to the control
   * - `tap`: tap always opens the card, even on a trigger that acts.
   *   Ignored under `pressTrigger="toggle"`
   * - `none`: touch never opens the card
   *
   * @default 'auto'
   */
  touchTrigger?: HoverCardTouchTrigger;

  /**
   * Whether a press on the trigger pins the card open:
   * - `none`: no press pins it; `touchTrigger` decides what a tap does
   * - `toggle`: on a button trigger, a click, a tap, Enter, or Space pins the
   *   card open and the same press closes it; hover and focus still preview
   *   it. A pinned card stays until Escape, a second press on the trigger, a
   *   press outside the trigger and the card, or focus leaving them, and the
   *   press stops at the trigger: no clickable row or card around it
   *   activates. The trigger reports `aria-expanded` and `aria-controls`, and
   *   the card's `label` (else its text) is announced once when it pins.
   *   `touchTrigger` is ignored.
   *
   * @default 'none'
   */
  pressTrigger?: HoverCardPressTrigger;

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
   * Whether to show hover indication (dashed underline) on the trigger.
   * - `'auto'`: Show for text-only children
   * - `true`: Always show
   * - `false`: Never show
   *
   * @default 'auto'
   */
  hasHoverIndication?: 'auto' | boolean;

  /**
   * Controlled open state. When provided, overrides hover/focus triggers:
   * - `true`: force-show the hover card (hover/focus hide is suppressed)
   * - `false`: force-hide the hover card
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
  return typeof children === 'string' || typeof children === 'number';
}

/**
 * Utility to merge ARIA ID strings
 */
function mergeIds(...ids: (string | undefined | null)[]): string | undefined {
  const filtered = ids.filter(Boolean);
  return filtered.length > 0 ? filtered.join(' ') : undefined;
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
  pressTrigger = 'none',
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
    pressTrigger,
    isEnabled,
    label,
    isOpen,
    isDefaultOpen,
    onShow: handleShow,
    onHide: handleHide,
  });

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
      // When named, the hover card is a dialog. The trigger should advertise the
      // popup relationship with aria-haspopup/aria-expanded, not describe the
      // trigger with the dialog's content (aria-describedby is for plain-text
      // descriptions, not navigable regions). See #5049.
      //
      // aria-expanded only goes on a trigger whose role permits it. A role-less
      // trigger (Timestamp's <time>/<span>) gets haspopup + controls, which are
      // global, and no expanded state.
      //
      // Merge rather than overwrite: the trigger may already carry its own
      // popup semantics (e.g. a menu button wrapped in a labelled HoverCard),
      // so preserve the existing values and restore them on cleanup.
      const existingHaspopup = firstChild.getAttribute('aria-haspopup');
      const existingControls = firstChild.getAttribute('aria-controls');
      const existingExpanded = firstChild.getAttribute('aria-expanded');
      // Under the toggle, the press pin owns aria-expanded (true only while
      // pinned) and aria-controls on the button triggers it wires (FR10); the
      // popup role stays here, and so does FR3's state on any other trigger.
      const ownsToggleState = !(
        pressTrigger === 'toggle' && isPressPinTrigger(firstChild)
      );
      const canExpand = ownsToggleState && supportsAriaExpanded(firstChild);
      firstChild.setAttribute('aria-haspopup', 'dialog');
      // Only point aria-controls at the layer while it is open and in the DOM.
      // While closed, useLayer leaves only an inert <template> marker, so the
      // id would reference nothing. DateInput gates it the same way. The
      // trigger's own aria-controls (if any) is preserved either way.
      if (!ownsToggleState) {
        // The press pin sets it.
      } else if (hoverCard.isOpen) {
        firstChild.setAttribute(
          'aria-controls',
          mergeIds(existingControls, hoverCard.id) ?? '',
        );
      } else if (existingControls) {
        firstChild.setAttribute('aria-controls', existingControls);
      } else {
        firstChild.removeAttribute('aria-controls');
      }
      if (!ownsToggleState) {
        // The press pin sets it.
      } else if (canExpand) {
        firstChild.setAttribute('aria-expanded', String(hoverCard.isOpen));
      } else if (existingExpanded) {
        firstChild.setAttribute('aria-expanded', existingExpanded);
      } else {
        firstChild.removeAttribute('aria-expanded');
      }

      return () => {
        hoverCard.ref(null);
        if (existingHaspopup) {
          firstChild.setAttribute('aria-haspopup', existingHaspopup);
        } else {
          firstChild.removeAttribute('aria-haspopup');
        }
        if (!ownsToggleState) {
          return;
        }
        if (existingControls) {
          firstChild.setAttribute('aria-controls', existingControls);
        } else {
          firstChild.removeAttribute('aria-controls');
        }
        if (existingExpanded) {
          firstChild.setAttribute('aria-expanded', existingExpanded);
        } else {
          firstChild.removeAttribute('aria-expanded');
        }
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
    pressTrigger,
    hoverCard.ref,
    hoverCard.id,
    hoverCard.isOpen,
    hoverCard.describedBy,
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
          aria-haspopup={label ? 'dialog' : undefined}
          aria-controls={label && hoverCard.isOpen ? hoverCard.id : undefined}
          // No aria-expanded: this wrapper is a role-less <span>, and
          // aria-expanded is invalid on it (see EXPANDABLE_ROLES above).
          aria-describedby={label ? undefined : hoverCard.describedBy}
          {...stylex.props(
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
      <span
        ref={wrapperRef}
        onClick={stopPressPinClick}
        {...stylex.props(styles.wrapperContents)}>
        {children}
      </span>
      {renderedHoverCard}
    </>
  );
}

HoverCard.displayName = 'HoverCard';
