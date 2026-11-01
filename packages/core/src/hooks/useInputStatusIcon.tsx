// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useInputStatusIcon.tsx
 * @input Input status, statusVariant, and InputGroup awareness
 * @output The on-field status icon element (with tooltip) and aria-describedby wiring
 * @position Shared hook for bordered inputs that render a status affordance inside the control
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (exports)
 *
 * Centralizes the on-field status icon across the bordered inputs (TextInput,
 * TextArea, NumberInput, DateInput, DateTimeInput, DateRangeInput, TimeInput,
 * FileInput) so the three statusVariants behave consistently:
 *
 * - `attached`  → icon sits inside the control; the message box below carries
 *   the text.
 * - `detached`  → the detached message box renders its OWN leading icon, so the
 *   on-field icon is suppressed here to avoid a duplicate glyph.
 * - `tooltip`   → no message box renders; the status is surfaced through an
 *   info-tip on the on-field icon. The icon is a real focusable `<button>` so
 *   the status is reachable by every user, not just those with hover or a
 *   screen reader:
 *     - Keyboard (no AT): the button is in the tab order (WCAG 2.1.1) with a
 *       visible focus ring (WCAG 2.4.7); focusing it opens the tooltip.
 *     - Pointer: hover opens it (guarded to fine pointers).
 *     - Touch: hover is unavailable, so a tap toggles the tooltip open/closed.
 *     - Assistive tech: the button has an accessible name (its status type,
 *       WCAG 4.1.2) and is described by the message via `aria-describedby`.
 *     - Dismissible with Escape and hoverable (WCAG 1.4.13) via useTooltip.
 */

import {useCallback, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Icon, type IconName, type IconSize} from '../Icon';
import type {InputStatus, InputStatusType} from '../Field/types';
import {useTooltip} from '../Tooltip';
import {useTranslator} from '../i18n';
import {radiusVars} from '../theme/tokens.stylex';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import type {FieldStatusPlacement} from '../Field/fieldStatusPlacement';

/**
 * Maps each status type to its glyph. Shared so every input shows the same icon
 * for a given status, matching the detached message box's leading icon.
 */
const STATUS_ICON: Record<InputStatusType, IconName> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

/**
 * Accessible-name i18n keys for the focusable status button, keyed by type.
 */
const STATUS_BUTTON_LABEL_KEY: Record<InputStatusType, string> = {
  warning: '@astryx.input.statusButton.warning',
  error: '@astryx.input.statusButton.error',
  success: '@astryx.input.statusButton.success',
};

const styles = stylex.create({
  // Contain the anchor so the tooltip positions against the icon, and keep the
  // glyph vertically centered within the input control.
  iconAnchor: {
    display: 'inline-flex',
    alignItems: 'center',
  },
  // The tooltip-variant status affordance is a real button so it is keyboard
  // focusable and tappable. Strip the native chrome and show only a focus ring.
  statusButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // Own the interactivity so the tooltip opens on hover even when the field
    // renders this affordance inside a non-interactive trailing slot. TextArea
    // positions its end slot as an absolute overlay with `pointer-events: none`
    // (right for the decorative spinner/icon it was built for), which otherwise
    // swallows this button's hover — keyboard focus still worked, pointer did
    // not.
    pointerEvents: 'auto',
    borderRadius: radiusVars['--radius-full'],
    // Not the shared offset: this button sits inside the field, and measured at
    // the standard 3px its ring crosses the field border.
    outlineOffset: {default: null, ':focus-visible': '2px'},
  },
});

export interface UseInputStatusIconOptions {
  /** The input's status, or undefined when there is none. */
  status?: InputStatus;
  /** How the status is presented relative to the input. */
  statusVariant?: FieldStatusPlacement;
  /** Whether the input is inside an InputGroup (which owns status rendering). */
  isInGroup?: boolean;
  /** Size of the on-field icon. @default 'md' */
  size?: IconSize;
}

export interface UseInputStatusIconReturn {
  /**
   * The on-field status affordance to render inside the input container —
   * the status icon (plain, for attached) or a focusable info-tip button plus
   * its tooltip layer (for the `tooltip` variant). `null` when no icon should
   * render (no status, `detached` variant, or inside a group).
   */
  statusIcon: ReactNode;
  /**
   * ID to add to the input's `aria-describedby` when — and only when — the
   * status is surfaced through a rendered tooltip layer (the `tooltip` variant
   * with a message). It is `undefined` in every other case (no status, no
   * message, `attached`/`detached`, or inside a group), so call-sites can drop
   * it straight into their described-by list without a dangling reference: the
   * id is present exactly when its tooltip element is in the DOM.
   */
  describedBy: string | undefined;
}

/**
 * Builds the on-field status icon and its accessibility wiring for a bordered
 * input. See the file header for the per-variant behavior.
 */
export function useInputStatusIcon({
  status,
  statusVariant = 'attached',
  isInGroup = false,
  size = 'md',
}: UseInputStatusIconOptions): UseInputStatusIconReturn {
  const t = useTranslator();
  const isTooltipVariant = statusVariant === 'tooltip';
  const hasTooltip = isTooltipVariant && !!status?.message;

  // Touch tap-to-toggle. Hover is unavailable on touch, and useTooltip
  // suppresses simulated hover there, so on touch a tap controls visibility.
  // `undefined` leaves the tooltip uncontrolled (pointer + keyboard drive it);
  // a boolean takes control for the current open/close cycle.
  const [tapOpen, setTapOpen] = useState<boolean | undefined>(undefined);

  const tooltip = useTooltip({
    placement: 'above',
    isEnabled: hasTooltip,
    isOpen: tapOpen,
  });

  // Re-hand control back to hover/focus once a tap-opened tooltip is dismissed
  // (Escape/outside interaction), so subsequent pointer/keyboard use behaves
  // normally.
  const handleButtonBlur = useCallback(() => {
    setTapOpen(undefined);
  }, []);

  const handleButtonClick = useCallback(() => {
    // Only take control on touch/hover-less devices. On hover-capable devices
    // pointer hover and keyboard focus already drive the tooltip (uncontrolled),
    // so a click-toggle would fight them; leave it uncontrolled there.
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia('(hover: none)').matches
    ) {
      return;
    }
    setTapOpen(prev => (prev === true ? false : true));
  }, []);

  // Dismiss a tap-opened tooltip on Escape and return to the uncontrolled
  // state (useTooltip owns Escape for the uncontrolled case, but while we hold
  // control via isOpen it does not, so mirror it here).
  useEffect(() => {
    if (tapOpen !== true) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTapOpen(undefined);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [tapOpen]);

  // Inside a group the group owns status rendering; the detached message box
  // renders its own leading icon, so the on-field icon would duplicate it.
  const shouldRenderIcon =
    !!status && !isInGroup && statusVariant !== 'detached';

  if (!shouldRenderIcon) {
    return {statusIcon: null, describedBy: undefined};
  }

  const icon = (
    <Icon
      icon={STATUS_ICON[status.type]}
      size={size}
      color={status.type}
      // Stable theme target on the status glyph itself, so a theme can restyle
      // just this icon (color, size) — and each status — via `defineTheme`.
      // Same-element rules in @layer astryx-theme win over the icon's own base
      // width/height/fontSize, which a field-level target could not reach.
      // Shared by the attached and tooltip variants across all bordered inputs.
      {...themeProps('input-status-icon', {size, status: status.type})}
    />
  );

  // Attached (and tooltip-without-message) variants: plain, non-interactive
  // icon. The message box (attached) already carries the text.
  if (!hasTooltip) {
    return {statusIcon: icon, describedBy: undefined};
  }

  return {
    statusIcon: (
      <>
        <button
          type="button"
          ref={tooltip.ref}
          aria-label={t(STATUS_BUTTON_LABEL_KEY[status.type])}
          aria-describedby={tooltip.describedBy}
          onClick={handleButtonClick}
          onBlur={handleButtonBlur}
          {...stylex.props(
            focusOutlineStyles.focusVisible,
            styles.statusButton,
          )}>
          {icon}
        </button>
        {tooltip.renderTooltip(status.message)}
      </>
    ),
    describedBy: tooltip.describedBy,
  };
}
