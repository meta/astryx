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
 */

import {useCallback, useEffect, useState} from 'react';
import type {ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Icon, type IconSize} from '../Icon/Icon';
import type {IconName} from '../Icon/globalIconRegistry';
import type {InputStatus, InputStatusType} from '../Field/types';
import {useTooltip} from '../Tooltip/useTooltip';
import {radiusVars} from '../theme/tokens.stylex';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import type {FieldStatusPlacement} from '../Field/fieldStatusPlacement';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/hooks/useInputStatusIcon.generated';

registerEnglishFallback(english);

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
    // The button owns its pointer events, so hover opens the tooltip in a
    // non-interactive trailing slot. TextArea's end slot has
    // `pointer-events: none`, which would block this button's hover.
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
 * input, so every bordered input shows status the same way:
 * - `attached`: the icon is in the control, and the message box below has
 *   the text.
 * - `detached`: the message box shows its own leading icon, so this hook
 *   shows none.
 * - `tooltip`: no message box. The icon is a focusable `<button>` with an
 *   info-tip, so every user can reach the status. Focus or a fine-pointer
 *   hover opens it, and a tap toggles it on touch. Its accessible name is the
 *   status type, and the message describes it. Escape dismisses it.
 */
export function useInputStatusIcon({
  status,
  statusVariant = 'attached',
  isInGroup = false,
  size = 'md',
}: UseInputStatusIconOptions): UseInputStatusIconReturn {
  const t = useComponentTranslator();
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

  // Give control back to hover and focus after a tap-opened tooltip is
  // dismissed.
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

  // Escape dismisses a tap-opened tooltip and returns to the uncontrolled
  // state. useTooltip handles Escape only when it is uncontrolled.
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
      // A stable theme target on the glyph, so a theme can restyle this icon
      // for each status. Same-element rules in @layer astryx-theme override
      // the icon's base size, which a field-level target cannot reach.
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
