// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Selector.tsx
 * @input Uses React, StyleX, adaptive selection surfaces, theme-resolved
 *   indicators, Field, and InputGroup context
 * @output Exports Selector with input, secondary, and ghost trigger treatments, content-derived option-mark layout, and token-sized single-line triggers
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Selector/Selector.spec.md
 * - /packages/core/src/Selector/Selector.doc.mjs
 * - /packages/core/src/Selector/Selector.test.tsx
 * - /packages/core/src/Selector/index.ts
 * - /apps/storybook/stories/Selector.stories.tsx
 * - /apps/storybook/stories/InputGroup.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Selector/ (showcase blocks)
 */

import React, {
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useTooltip} from '../Tooltip';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {useIndicator} from '../Indicator';
import type {IndicatorPosition} from '../Indicator';
import type {IconName} from '../Icon';
import {
  Field,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputWrapperStyles,
  type FieldStatusVariant,
} from '../Field';
import {Divider} from '../Divider';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import {useKeepLayerOpenProps, type LayerPlacement} from '../Layer/useLayer';
import {InternalInputClearButton} from '../Field/InputClearButton';
import {Spinner} from '../Spinner';
import {PanelSearchInput} from '../Field/PanelSearchInput';
import {useAnnounce} from '../hooks/useAnnounce';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {
  colorVars,
  sizeVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  typographyVars,
  fontWeightVars,
  typeScaleVars,
  borderVars,
} from '../theme/tokens.stylex';
import type {SelectorOptionType, SelectorOptionData} from './types';
import {
  isOptionData,
  isDivider,
  isSection,
  normalizeOption,
  getSelectableOptions,
} from './utils';
import {useCombobox, useSelectedItemOffset} from './hooks';
import {useMenuPress} from '../hooks/useMenuPress';
import {useMenuOverflow} from '../DropdownMenu/useMenuOverflow';
import {useTypeahead} from '../hooks/useTypeahead';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {SelectorOption} from './SelectorOption';
import {SelectorRowLayoutContext} from './SelectorRowLayoutContext';
import {getInputARIA, isImeKeyEvent, mergeProps} from '../utils';
import {joinAriaIDs} from '../utils/inputAria';
import {warnOnce} from '../utils/devWarning';
import {useSize} from '../SizeContext/SizeContext';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
} from '../Field/fieldParts';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {groupStyles, inputGroupItemProps} from '../InputGroup/groupStyles';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {InputGroupInternalContext} from '../InputGroup/InputGroupInternalContext';
import {VisuallyHidden} from '../VisuallyHidden';
import {useTranslator} from '../i18n';
import type {AdaptivePresentation} from '../hooks/useAdaptivePresentation';
import {SelectorBottomSheet} from './SelectorBottomSheet';
import {useSelectorPresentation} from './useSelectorPresentation';
import {selectorPresentationStyles} from './selectorPresentation.stylex';

const styles = stylex.create({
  // Trigger container — the enhanced click target wrapping the combobox button and clear button as siblings
  triggerContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    paddingBlock: spacingVars['--spacing-2'],
    paddingInline: spacingVars['--spacing-3'],
    fontFamily: typographyVars['--font-family-body'],
    // The 16px floor is iOS-only: iOS Safari zooms the page when a focused
    // control sits under 16px, and only iOS WebKit implements
    // -webkit-touch-callout to key the coarse-pointer floor to it.
    fontSize: {
      default: typeScaleVars['--text-label-size'],
      '@media (pointer: coarse)': {
        '@supports (-webkit-touch-callout: none)': `max(1rem, ${typeScaleVars['--text-label-size']})`,
      },
    },
    // The line box is set per size in sizeStyles below, where it can be capped
    // to what that size token holds.
    color: colorVars['--color-text-primary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  // Trigger button — the actual combobox button, visually integrated with the container
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    padding: 0,
    margin: 0,
    borderWidth: 0,
    borderStyle: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    color: 'inherit',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // The wrapper (inputWrapperStyles.base) renders the focus ring via
    // :focus-within when this button is focused, matching TextInput/NumberInput.
    // The button must not draw its own :focus-visible outline or the two stack
    // into a doubled ring over the trigger.
    outline: 'none',
  },
  triggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
  triggerLabel: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'start',
  },
  // Inside an InputGroup the group's own height is the row, and the trigger
  // takes it: `height: 100%` from `groupStyles.inGroup` can only govern if the
  // trigger stops asserting a floor of its own — otherwise a control sized
  // above its group (`<InputGroup size="md"><Selector size="lg">`) grows the
  // row it was supposed to sit in. The padding goes with it: the row is
  // already the size token, and the value box is centred in it. The line box
  // likewise stops reading the control's own size token (sizeStyles caps it
  // there), so grouped triggers keep one line box whatever their `size`.
  triggerInGroup: {
    minHeight: 0,
    paddingBlock: 0,
    lineHeight: `max(${spacingVars['--spacing-5']}, 20px, 1rem)`,
  },
  // Wrapper for `renderValue` output. Takes the free width and clips
  // horizontally so a long value ellipsizes rather than widening the trigger;
  // vertically the content sizes the control, which the size styles below
  // handle.
  triggerValue: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textAlign: 'start',
  },
  // Inside an InputGroup the row height is the group's, so the trigger clamps
  // its own value box to that row rather than asking the value to fit it: any
  // node is cut off at the row's edge instead of bleeding through the border
  // over whatever sits above and below the group. The rows the system draws
  // itself never reach the cut — the row-layout context folds them onto one
  // line first (SelectorRowLayoutContext).
  //
  // The clamp is a percentage, not the size token, because a group can be a
  // different size than the control inside it; the row is whatever the group
  // made it. That needs a definite height to resolve against, which is what
  // stretching the button provides.
  triggerButtonInGroup: {
    alignSelf: 'stretch',
  },
  triggerValueInGroup: {
    maxHeight: '100%',
  },
  // Only what Icon does not already provide: `size="sm"` gives the 16px box
  // and `color` the token, but the glyph still must not shrink inside the flex
  // trigger.
  triggerIcon: {
    flexShrink: 0,
  },
  // Rotation lives on the chevron glyph itself (passed through `xstyle`), not
  // on the layout wrapper above, so the icon's `selector-indicator-icon` theme
  // target and the open/closed transform sit on one element — a theme can
  // restyle the mark and its rotation through a single selector. The wrapper
  // keeps only layout. The status branch renders a different icon, so it never
  // picks these up and needs no transition opt-out.
  triggerIconRotation: {
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    transformOrigin: 'center',
  },
  triggerIconOpen: {
    transform: 'rotate(180deg)',
  },
  // Ghost has no borders, so its spacing row never overshoots the token; it
  // keeps the uncapped line box from before the sizeStyles cap.
  triggerGhost: {
    width: 'auto',
    borderWidth: 0,
    lineHeight: `max(${spacingVars['--spacing-5']}, 20px, 1rem)`,
    backgroundColor: 'transparent',
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': 'none',
        },
      ':focus-within': 'none',
    },
    fontWeight: fontWeightVars['--font-weight-medium'],
    transitionProperty:
      'background-image, background-color, color, opacity, transform',
    transform: {
      default: 'scale(1)',
      // A mouse press; under a coarse pointer the touch press model writes
      // `data-astryx-press` instead (see interactionOverlay.stylex.ts).
      ':active': {
        default: 'scale(0.98)',
        '@media (pointer: coarse)': 'scale(1)',
      },
      '[data-astryx-press="on"]': 'scale(0.98)',
    },
  },
  // Secondary is ghost's chrome with the resting fill of a secondary
  // button (`--color-neutral`): no border, no shadow, content width, so a
  // selector in a nav reads as the sibling of the secondary buttons and
  // segmented controls beside it instead of as a form field. The hover and
  // pressed answers still come from the shared interaction overlay, layered
  // over the fill via backgroundImage.
  triggerSecondary: {
    width: 'auto',
    borderWidth: 0,
    lineHeight: `max(${spacingVars['--spacing-5']}, 20px, 1rem)`,
    backgroundColor: colorVars['--color-neutral'],
    boxShadow: {
      default: 'none',
      ':hover:not(:focus-within):where(:not(:disabled,[aria-disabled="true"]))':
        {
          '@media (hover: hover)': 'none',
        },
      ':focus-within': 'none',
    },
    fontWeight: fontWeightVars['--font-weight-medium'],
    transitionProperty:
      'background-image, background-color, color, opacity, transform',
    transform: {
      default: 'scale(1)',
      ':active': {
        default: 'scale(0.98)',
        '@media (pointer: coarse)': 'scale(1)',
      },
      '[data-astryx-press="on"]': 'scale(0.98)',
    },
  },
  // A disabled input-variant trigger keeps its tab stop (`spec:AST-085` FR1),
  // and the shared disabled wrapper style drops the field focus ring, so the
  // trigger shows keyboard focus here instead (FR6). It keys on the trigger
  // itself, a direct child, so a focused status button keeps its own outline.
  triggerDisabledFocus: {
    borderColor: {
      default: colorVars['--color-border-emphasized'],
      ':has(> [aria-disabled="true"]:focus-visible)':
        colorVars['--color-accent'],
    },
    boxShadow: {
      default: 'none',
      ':has(> [aria-disabled="true"]:focus-visible)': `inset 0px 0px 0px 2px ${colorVars['--color-accent-muted']}`,
    },
  },
  triggerGhostDisabled: {
    backgroundImage: 'none',
    transform: {
      default: 'none',
      ':active': 'none',
      '[data-astryx-press="on"]': 'none',
    },
  },
  triggerReadOnly: {
    cursor: 'default',
  },
  triggerGhostReadOnly: {
    backgroundImage: 'none',
    transform: {
      default: 'none',
      ':active': 'none',
      '[data-astryx-press="on"]': 'none',
    },
  },

  // Clear button
  statusButton: {
    display: 'flex',
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
    borderRadius: radiusVars['--radius-element'],
  },

  // Dropdown container
  dropdown: {
    boxSizing: 'border-box',
    maxHeight: '300px',
    overflowY: 'auto',
    outline: 'none',
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-1'],
    opacity: 1,
    transition: `opacity ${durationVars['--duration-fast']}`,
  },
  dropdownInput: {
    // The input trigger's text inset includes its border. Mirror that extra
    // pixel in the menu; the borderless secondary/ghost variants need no correction.
    paddingInline: `calc(${spacingVars['--spacing-1']} + ${borderVars['--border-width']})`,
  },
  // Scroll ownership by the browser's own signal, as the menus declare it: a
  // list whose options fit keeps every one-finger move, so a slide over the
  // options stays a slide; one that scrolls lets the browser pan it vertically
  // and cancel the press when it does. Both leave a two-finger pinch to the
  // browser, so the page stays zoomable over an open list.
  touchPinchZoom: {
    touchAction: 'pinch-zoom',
  },
  touchPanYPinchZoom: {
    touchAction: 'pan-y pinch-zoom',
    overscrollBehavior: 'contain',
  },
  // Same correction for the search row's gutter, so the search field and the
  // option rows share one left edge.
  searchRowInput: {
    paddingInline: `calc(${spacingVars['--spacing-1']} + ${borderVars['--border-width']})`,
  },
  dropdownHidden: {
    opacity: 0,
    transition: 'none',
  },

  // Popover container (for anchor positioning)
  popover: {
    minWidth: 'anchor-size(width)',
  },

  // Empty state
  emptyState: {
    padding: spacingVars['--spacing-3'],
    textAlign: 'center',
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
  },

  // Section heading. Plain secondary text, no rules — the same treatment
  // DropdownMenu and CommandPaletteGroup already use for a group heading in a
  // panel list. A labeled Divider (line–text–line) reads as a separator, and
  // next to the search row's own divider it stacked two rules a few pixels
  // apart.
  sectionHeading: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
    userSelect: 'none',
  },

  // Divider
  divider: {
    marginBlock: spacingVars['--spacing-1'],
  },

  // Individual item
  item: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacingVars['--spacing-2'],
    width: '100%',
    padding: spacingVars['--spacing-2'],
    borderRadius: radiusVars['--radius-element'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    textAlign: 'start',
    outline: 'none',
  },
  itemContent: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flex: 1,
    minWidth: 0,
  },
  // The wrapper keeps a visible mark at either logical position and lets a
  // replacement indicator grow beyond the default 1rem minimum. When the
  // resolved indicator draws nothing, `:empty` removes the wrapper from layout
  // instead of reserving blank space. Selected and unselected labels may
  // therefore shift or have different available width by design (AST-004).
  itemMarkColumn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minWidth: '1rem',
    ':empty': {
      display: 'none',
    },
  },
  itemCheckmark: {
    flexShrink: 0,
    width: 16,
    height: 16,
    color: colorVars['--color-icon-primary'],
  },
  itemHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  itemSelected: {
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  itemDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
});

// The trigger is sized by PADDING, not by a fixed height, so it is the size
// token plus one text line for each extra line the value uses: 28/32/36 for
// one line, 48/52/56 for two with the default tokens, where the token and a
// text line are both multiples of 4 and the trigger lines up with the Buttons
// and inputs beside it. No prop picks the height — the content does.
//
// The line box is `--spacing-5`, floored at the 20px clear control and 1rem
// icons. When that row would not fit inside the size token's borders, it is
// capped at what the token holds, so a spacing scale taller than the token
// cannot push a one-line trigger past it. The cap never goes below 1.5em of
// the trigger's own font — the type scale's loosest target leading, a
// conservative bound above a label's glyph extent — so label text too large
// for the token keeps room rather than being clipped. Line box and padding
// read the same value; nothing changes wherever the row already fit. Ghost and
// grouped triggers keep the uncapped line box. `renderValue` content inherits
// this row like the built-in label; content that sets a larger font should set
// its own line height, as it must at any spacing scale.
// Keep these calculations inline: a consumer's Babel preset can lower a
// module-scope helper to a function expression before StyleX evaluates this
// object, and StyleX cannot constant-evaluate that transformed helper.

const sizeStyles = stylex.create({
  sm: {
    minHeight: sizeVars['--size-element-sm'],
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-sm']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-sm']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-sm']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
  md: {
    minHeight: sizeVars['--size-element-md'],
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-md']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-md']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-md']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
  lg: {
    minHeight: sizeVars['--size-element-lg'],
    lineHeight: `max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-lg']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem)`,
    paddingBlock: `calc((${sizeVars['--size-element-lg']} - max(min(${spacingVars['--spacing-5']}, max(${sizeVars['--size-element-lg']} - 2 * ${borderVars['--border-width']}, 1.5em)), 20px, 1rem) - 2 * ${borderVars['--border-width']}) / 2)`,
  },
});

/**
 * Size-specific overrides for dropdown list items.
 * Matches the pattern used by DropdownMenuItem so that
 * an `sm` selector renders compact list items, `md`/`lg` use
 * the base padding defined in `styles.item`.
 */
const itemSizeStyles = stylex.create({
  sm: {
    paddingBlock: spacingVars['--spacing-1'],
    paddingInline: spacingVars['--spacing-2'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
  },
  lg: {},
});

const STATUS_ICON_MAP: Record<SelectorStatusType, IconName> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const STATUS_ICON_COLOR_MAP: Record<
  SelectorStatusType,
  'warning' | 'error' | 'success'
> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const STATUS_BUTTON_LABEL_KEY: Record<SelectorStatusType, string> = {
  warning: '@astryx.input.statusButton.warning',
  error: '@astryx.input.statusButton.error',
  success: '@astryx.input.statusButton.success',
};

export type SelectorSize = 'sm' | 'md' | 'lg';

export type SelectorVariant = 'input' | 'secondary' | 'ghost';

export type SelectorPresentation = AdaptivePresentation;

export type SelectorStatusType = 'warning' | 'error' | 'success';

export interface SelectorStatus {
  /**
   * The type of status to display.
   */
  type: SelectorStatusType;
  /**
   * Optional message to display below the input.
   */
  message?: string;
}

interface SelectorPropsBase<
  T extends SelectorOptionType = SelectorOptionType,
> extends Omit<FieldInputBaseProps, 'onChange' | 'defaultValue'> {
  /**
   * Label text for the selector (always rendered for accessibility).
   */
  label: string;

  /**
   * Ref to the trigger button: the element that carries the combobox role,
   * the accessible name, and the value.
   */
  ref?: React.Ref<HTMLButtonElement>;

  /**
   * Click handler on the trigger button. It runs before the selector toggles
   * its surface (the press then reaches the control box), and calling
   * `preventDefault()` does not keep the surface closed.
   */
  onClick?: React.MouseEventHandler<HTMLElement>;

  /**
   * Focus handler on the trigger button. It runs before the selector's own
   * focus handling.
   */
  onFocus?: React.FocusEventHandler<HTMLElement>;

  /**
   * Key handler on the trigger button. It runs after the built-in keyboard
   * model and is skipped for keys that model handles and cancels.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;

  /**
   * Whether to visually hide the label (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;

  /**
   * Description text displayed between the label and selector.
   */
  description?: string;

  /**
   * Whether the field is optional. Mutually exclusive with isRequired.
   * @default false
   */
  isOptional?: boolean;

  /**
   * Whether the field is required. Mutually exclusive with isOptional.
   * @default false
   */
  isRequired?: boolean;

  /**
   * Whether the selector is disabled.
   * @default false
   */
  isDisabled?: boolean;

  /**
   * Whether the selector is read-only.
   * The selected value stays visible, focusable, and included in form
   * submission, and retains its combobox identity with `aria-readonly`. The
   * selection surface and editing affordances are removed.
   * Unlike `isDisabled`, a read-only selector is not dimmed and keeps its
   * value in form submission. `isDisabled` takes precedence when both are set.
   * @default false
   */
  isReadOnly?: boolean;

  /**
   * Explains why the selector is disabled. When set together with
   * `isDisabled`, the selector shows a tooltip with this text on hover and
   * keyboard focus, and the trigger stays focusable (via `aria-disabled`)
   * so the reason is discoverable by keyboard and assistive technology.
   * Activation stays blocked.
   *
   * Use this instead of wrapping a disabled selector in `Tooltip`, so the
   * reason is attached to the trigger itself.
   *
   * @example
   * ```
   * <Selector
   *   label="Owner"
   *   options={owners}
   *   isDisabled
   *   disabledMessage="You need the Editor role to change this"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The options to display in the selector.
   * Can be strings, objects, dividers, or sections.
   */
  options: T[];

  // value, onChange, changeAction, and hasClear are in the discriminated union below

  /**
   * Whether the selector is in a loading state.
   * @default false
   */
  isLoading?: boolean;

  /**
   * Placeholder text when no value is selected.
   * @default 'Select...'
   */
  placeholder?: string;

  /**
   * The size of the selector.
   * - 'sm': Compact size
   * - 'md': Default size
   * @default 'md'
   */
  size?: SelectorSize;

  /**
   * Visual style of the selector trigger.
   * - 'input': bordered input-style trigger for forms
   * - 'secondary': matches the theme's secondary buttons (borderless and
   *   neutral-filled by default), for navs and toolbars where the selector
   *   sits beside secondary actions
   * - 'ghost': borderless trigger matching ghost buttons, for toolbars
   * @default 'input'
   */
  variant?: SelectorVariant;

  /**
   * Status indicator for the selector.
   * When set, displays a colored border and status icon.
   * If message is provided, displays a message box below the selector.
   */
  status?: SelectorStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the bordered input (input variant only)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': message is exposed from the on-field status icon
   * @default 'attached' for input selectors; 'detached' for secondary/ghost selectors
   */
  statusVariant?: FieldStatusVariant;

  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field (label, control, and status) so they
   * stay aligned, unlike setting width via `controlXstyle`/`controlClassName`/`controlStyle`.
   */
  width?: SizeValue;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;

  /**
   * Icon displayed at the start of the selector trigger. Takes precedence over
   * the selected option's own `icon`, which the trigger otherwise renders.
   */
  startIcon?: ReactNode | IconType;

  /**
   * Custom render function for options.
   * Only called for selectable options (not dividers/sections).
   */
  renderOption?: (option: SelectorOptionData) => ReactNode;

  /**
   * Custom render function for the selected option inside the closed trigger.
   * Only called when something is selected; the placeholder is unaffected.
   *
   * Passing this does not change the trigger's height — what it draws does. A
   * one-line value measures exactly the `size` token, so the control still
   * lines up with the Buttons and inputs beside it; each further line of
   * content adds one text line. Inside an `InputGroup` the group owns the row
   * height: the trigger clamps its value box to that row, so a `SelectorOption`
   * folds onto one line and ellipsizes, and anything taller than the row is cut
   * off at it rather than bleeding over the rows above and below.
   *
   * @example
   * ```
   * renderValue={option => (
   *   <SelectorOption
   *     icon={option.icon}
   *     label={option.label}
   *     description={option.description}
   *   />
   * )}
   * ```
   */
  renderValue?: (option: SelectorOptionData) => ReactNode;

  /**
   * Which logical edge of the option row carries a rendered selection mark. An
   * empty mark consumes no space, so selected and unselected labels may shift or
   * have different available width. `end` is the house convention shared with
   * Typeahead and CommandPalette.
   *
   * @default 'end'
   */
  indicatorPosition?: IndicatorPosition;

  /**
   * Whether to show a search input for filtering options.
   * @default false
   */
  hasSearch?: boolean;

  /**
   * Placeholder text for the search input.
   * @default 'Search...'
   */
  searchPlaceholder?: string;

  /**
   * Content shown in the panel when there are no options to show, and
   * announced in a polite live region when the panel opens. Not shown while
   * `isLoading` — the options have not arrived yet.
   * @default 'No options'
   */
  emptyText?: ReactNode;

  /**
   * Content shown in the panel when a search query matches no options, and
   * announced in a polite live region at the same time.
   *
   * The panel message is `role="presentation"`, so the live region is the
   * only route to assistive tech. It announces the text this content renders,
   * read from the DOM, so an element is announced as written and anything
   * marked `aria-hidden` is left out of both.
   * @default 'No results found'
   */
  emptySearchText?: ReactNode;

  /**
   * Position placement relative to the trigger.
   *
   * Omit to use the selector's default selected-item overlay behavior: the
   * selected item is positioned over the trigger and clamped to the viewport.
   * Set a placement to opt into explicit layer positioning (for example,
   * `placement="above"` for bottom-fixed toolbars).
   */
  placement?: LayerPlacement;

  /**
   * How the option list is presented.
   * - 'popover': anchored to the trigger
   * - 'bottom-sheet': modal sheet suited to compact touch screens
   * - 'adaptive': bottom sheet on compact coarse-pointer screens, otherwise popover
   * @default 'popover'
   */
  presentation?: SelectorPresentation;

  /**
   * Whether the dropdown starts open on mount.
   * Useful for showcases and previews.
   * @default false
   */
  isDefaultOpen?: boolean;

  /**
   * The HTML name attribute for form submissions. When set, a hidden input
   * carries the selected value under this name, matching how a native
   * select serializes.
   */
  htmlName?: string;

  /**
   * Test ID for testing frameworks.
   */
  'data-testid'?: string;
}

/**
 * Without `hasClear`, the selector always has a string value (or undefined for placeholder).
 * With `hasClear`, the value can be `null` and onChange receives `null` on clear.
 */
type SelectorPropsNonClearable<
  T extends SelectorOptionType = SelectorOptionType,
> = SelectorPropsBase<T> & {
  hasClear?: false;
  value?: string;
  onChange?: (value: string) => void;
  changeAction?: (value: string) => void | Promise<void>;
};

type SelectorPropsClearable<T extends SelectorOptionType = SelectorOptionType> =
  SelectorPropsBase<T> & {
    /**
     * Whether to show a clear button when a value is selected.
     * When clicked, resets the value to `null` and returns focus to the trigger.
     *
     * When enabled, `value` and `onChange` widen to include `null`.
     */
    hasClear: true;
    value: string | null;
    onChange?: (value: string | null) => void;
    changeAction?: (value: string | null) => void | Promise<void>;
  };

export type SelectorProps<T extends SelectorOptionType = SelectorOptionType> =
  SelectorPropsNonClearable<T> | SelectorPropsClearable<T>;

/**
 * Default option renderer
 */
function DefaultOption({option}: {option: SelectorOptionData}) {
  return (
    <SelectorOption
      icon={option.icon}
      label={option.label ?? option.value}
      description={option.description}
    />
  );
}

// Case-insensitive substring match for a single option. The one predicate used
// by both the flat filter (count + keyboard nav) and the grouped renderer, so
// what is shown while searching stays in lockstep with the announced count.
function optionMatchesQuery(
  option: SelectorOptionData,
  query: string,
): boolean {
  if (!query) {
    return true;
  }
  return (option.label ?? option.value)
    .toLowerCase()
    .includes(query.toLowerCase());
}

// Case-insensitive substring filter over the selectable options. Shared by the
// `filteredItems` memo (rendering) and the search-change handler, which needs
// the count for the *next* query synchronously to announce it exactly once per
// keystroke rather than reacting to state in an effect.
function filterOptionsByQuery(
  items: SelectorOptionData[],
  query: string,
): SelectorOptionData[] {
  if (!query) {
    return items;
  }
  return items.filter(item => optionMatchesQuery(item, query));
}

/**
 * A selector/dropdown component for choosing from a list of options.
 *
 * @example
 * ```
 * <Selector
 *   label="Fruit"
 *   options={['Apple', 'Banana', 'Orange']}
 *   value={fruit}
 *   onChange={setFruit}
 *   placeholder="Select a fruit..."
 * />
 * ```
 */
export function Selector<T extends SelectorOptionType>(
  props: SelectorProps<T>,
) {
  const t = useTranslator();
  const pressable = usePressFeedback();
  const {
    label,
    isLabelHidden = false,
    description,
    isOptional = false,
    isRequired = false,
    isDisabled: isDisabledProp = false,
    isReadOnly = false,
    disabledMessage,
    options,
    value,
    onChange,
    changeAction,
    isLoading = false,
    placeholder: placeholderFromProps,
    size: sizeProp,
    variant = 'input',
    status,
    statusVariant = 'attached',
    labelTooltip,
    startIcon,
    htmlName,
    renderOption,
    renderValue,
    indicatorPosition = 'end',
    hasSearch = false,
    searchPlaceholder: searchPlaceholderFromProps,
    emptyText: emptyTextFromProps,
    emptySearchText: emptySearchTextFromProps,
    placement,
    presentation = 'popover',
    isDefaultOpen = false,
    width,
    containerXstyle,
    containerClassName,
    containerStyle,
    controlXstyle,
    controlClassName,
    controlStyle,
    ref,
    onFocus,
    onKeyDown: onKeyDownProp,
    'aria-describedby': ariaDescribedByProp,
    'aria-labelledby': ariaLabelledByProp,
    hasClear: hasClearProp,
    id,
    ...restProps
  } = props as SelectorPropsClearable<T>;
  const inputGroup = useInputGroup();
  const inputGroupState = use(InputGroupInternalContext);
  const isDisabled = isDisabledProp || inputGroupState.isDisabled;
  const {rest, container} = useFieldInputStyling('Selector', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder = placeholderFromProps ?? t('@astryx.selector.placeholder');
  const searchPlaceholder =
    searchPlaceholderFromProps ?? t('@astryx.selector.searchPlaceholder');
  const emptyText = emptyTextFromProps ?? t('@astryx.selector.empty');
  const emptySearchText =
    emptySearchTextFromProps ?? t('@astryx.selector.emptySearchResults');
  const hasClear = hasClearProp === true;
  const size = useSize(sizeProp, 'md');
  const effectiveStatusVariant =
    variant !== 'input' && statusVariant === 'attached'
      ? 'detached'
      : statusVariant;
  const isEffectivelyReadOnly = isReadOnly && !isDisabled;

  // Normalize null to undefined for internal use (null is the clear sentinel)
  const normalizedValue = value === null ? undefined : value;
  const generatedTriggerId = useId();
  // A caller's `id` lands on the trigger either way, so the internal identity
  // has to be that same value or the label and listbox point at nothing.
  const triggerId = id ?? generatedTriggerId;
  const listboxId = useId();
  // Read by the live region above so it speaks what this element renders.
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const statusMessageId = useId();
  const fieldLabelId = useId();
  const inputLabelId = useId();
  const readOnlyDescriptionId = useId();
  const searchId = useId();
  // Measure from the same outer control that usePopover anchors to; using the
  // shorter inner button makes every size's selected row land too low.
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const triggerButtonRef = useMergedRefs<HTMLButtonElement>(
    triggerRef as React.Ref<HTMLButtonElement>,
    ref,
  );
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  // Mirrors searchQuery for the seed path, which runs before focus reaches the
  // input and so cannot read the rendered state.
  const searchQueryRef = useRef('');
  // A typed query shows the search row's clear (✕) button, which becomes
  // the next tab stop after the search input.
  const hasQuery = searchQuery.length > 0;

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(normalizedValue);
  const isBusy = isLoading || optimisticValue !== normalizedValue;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), triggerRef);
  const announce = useAnnounce();

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the trigger container (which already exists)
  // and the trigger button stays perceivable via aria-disabled instead of the
  // disabled attribute. Activation is blocked by the isDisabled guards in
  // useCombobox (onTriggerClick / onKeyDown).
  const showsDisabledMessage = isDisabled && !!disabledMessage;
  const disabledMessageTooltip = useTooltip({
    placement: 'above',
    // The container div is not naturally focusable; focusin bubbles up from
    // the trigger button, so always attach focus listeners.
    focusTrigger: 'always',
    isEnabled: showsDisabledMessage,
  });
  const statusTooltip = useTooltip({
    placement: 'above',
    isEnabled: effectiveStatusVariant === 'tooltip' && !!status?.message,
  });

  const {ariaLabelledBy, ariaDescribedBy} = getInputARIA(
    inputLabelId,
    [
      description ? descriptionId : null,
      !inputGroup && effectiveStatusVariant !== 'tooltip' && status?.message
        ? statusMessageId
        : null,
      effectiveStatusVariant === 'tooltip' && status?.message
        ? statusTooltip.describedBy
        : null,
      showsDisabledMessage ? disabledMessageTooltip.describedBy : null,
      isEffectivelyReadOnly ? readOnlyDescriptionId : null,
    ],
    inputGroup,
  );
  // A caller aria-labelledby names the trigger together with the field's own
  // label (the Field label standalone, the group and input labels in a group).
  const triggerLabelledBy =
    ariaLabelledByProp != null
      ? joinAriaIDs(ariaLabelledBy ?? fieldLabelId, ariaLabelledByProp)
      : ariaLabelledBy;

  // Flatten options for keyboard navigation
  const selectableItems = useMemo(
    () => getSelectableOptions(options),
    [options],
  );

  // `action` is declared on the shared option type for `MultiSelector`;
  // this listbox has not adopted it, so it renders the option without the
  // control and says so (spec:AST-058 FR9) rather than nesting a control in
  // an option.
  useEffect(() => {
    if (selectableItems.some(item => item.action != null)) {
      warnOnce(
        'selector:option-action',
        'Selector',
        'An option carries `action`, which Selector does not render yet; the ' +
          'option is shown without it. MultiSelector renders option actions.',
      );
    }
  }, [selectableItems]);

  // Filter items by search query
  const filteredItems = useMemo(
    () => filterOptionsByQuery(selectableItems, searchQuery),
    [selectableItems, searchQuery],
  );

  // Find selected item and its index for positioning
  const selectedItemIndex = useMemo(() => {
    return selectableItems.findIndex(item => item.value === optimisticValue);
  }, [selectableItems, optimisticValue]);

  const selectedItem = useMemo(() => {
    return selectedItemIndex >= 0
      ? selectableItems[selectedItemIndex]
      : undefined;
  }, [selectableItems, selectedItemIndex]);

  // Ref for listbox to measure selected item position
  const listboxRef = useRef<HTMLDivElement>(null);

  // Typeahead is defined below (it needs the popover), but closing and clearing
  // must drop its pending buffer — otherwise a stale prefix survives the reset
  // window and poisons the next keystroke ("Dog" then "c" would search "dc").
  const resetTypeaheadRef = useRef<() => void>(() => {});

  // Layer for dropdown positioning
  const handleLayerHide = useCallback(() => {
    setSearchQuery('');
    searchQueryRef.current = '';
    resetTypeaheadRef.current();
    // Clear any lingering result count when the popover closes so stale status
    // text does not linger in the a11y tree.
    announce('');
  }, [announce]);

  const handleLayerShow = useCallback(() => {
    if (hasSearch) {
      requestAnimationFrame(() => {
        const input = searchRef.current;
        if (input) {
          input.focus();
          // When typing seeded the query, place the caret after it so the user
          // keeps typing where they left off.
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }
  }, [hasSearch]);

  const surface = useSelectorPresentation({
    presentation,
    onHide: handleLayerHide,
    onShow: handleLayerShow,
    triggerRef,
    popoverOptions: {
      hasLightDismiss: true,
      hasCloseButton: false,
      hasAutoFocus: false,
      // The popup's own role="listbox" is the exposed semantics; the trigger
      // keeps DOM focus, so wrapping it in a modal dialog would misrepresent it.
      role: 'none',
      // The theme target belongs on the SURFACE that paints the popup, which
      // `usePopover` owns — not on the scrolling list inside it.
      surfaceTarget: 'selector-popup',
    },
  });
  const {popover} = surface;
  const hideSurface = surface.hide;
  const isSurfaceOpen = surface.isOpen;
  const keepOpenProps = useKeepLayerOpenProps(popover.id, popover.isOpen);

  // Open dropdown on mount when isDefaultOpen is true and interaction is allowed.
  useEffect(() => {
    if (isDefaultOpen && !isEffectivelyReadOnly) {
      surface.show();
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- mount-only: isDefaultOpen is not reactive
  }, []);

  // Read-only is controlled by caller policy, so an already-open surface must
  // close when that policy changes. The presentation controller keeps a sheet
  // mounted through its exit and lets BottomSheet return final focus.
  useEffect(() => {
    if (isEffectivelyReadOnly && isSurfaceOpen) {
      hideSurface();
    }
  }, [isEffectivelyReadOnly, isSurfaceOpen, hideSurface]);

  // Announce the filtered result count from the query-change handlers (matching
  // BaseTypeahead) rather than a reactive effect: computing the count for the
  // next query here fires the announcement exactly once per keystroke and does
  // not re-speak on unrelated re-renders. Split out from handleSearchChange so
  // the type-to-open seed below reaches the same live region — a query the user
  // typed is a query however it arrived.
  const announceSearchResults = useCallback(
    (nextQuery: string) => {
      if (nextQuery.length === 0) {
        // Emptying the query clears the region rather than announcing a count.
        announce('');
        return;
      }
      // While isLoading the panel deliberately shows nothing, so announcing a
      // result would put a claim in the one channel the screen has gone quiet
      // for.
      if (isLoading) {
        announce('');
        return;
      }
      const count = filterOptionsByQuery(selectableItems, nextQuery).length;
      if (count === 0) {
        // The empty panel is announced from the rendered message below, not
        // from here. Two speakers for one transition would say it twice, and
        // this one cannot cover an empty result that arrives after the
        // keystroke — an async load landing with nothing that matches.
        return;
      }
      announce(t('@astryx.selector.resultCount', {count}));
    },
    [announce, isLoading, selectableItems, t],
  );

  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      setSearchQuery(nextQuery);
      searchQueryRef.current = nextQuery;
      announceSearchResults(nextQuery);
    },
    [announceSearchResults],
  );

  // The panel's empty message is role="presentation" — role="listbox" permits
  // only option and group children — so this region is its only route to
  // assistive tech, and the region has to say what the panel says. Both
  // `emptyText` and `emptySearchText` take a ReactNode, so the words are read
  // off the rendered element rather than guessed from the prop: a caller who
  // puts a link in the dead end is announced their link, not a default
  // (`spec:AST-056` AR1).
  //
  // Watching the rendered STATE rather than the keystroke also covers the
  // case the old keystroke-time announcement could not: a fetch that lands
  // with nothing matching an active query left the message on screen and the
  // region silent.
  const isPanelEmpty =
    surface.isOpen && !isLoading && filteredItems.length === 0;
  useAnnounceRenderedText(emptyStateRef, isPanelEmpty, searchQuery);

  // Calculate offset to position selected item over trigger. Explicit
  // placement opts out of the selector-specific overlay behavior and uses the
  // standard layer positioning API instead.
  const shouldOverlaySelectedItem = placement == null && !hasSearch;
  const {offset: rawOffset, isPositioned: rawIsPositioned} =
    useSelectedItemOffset({
      isOpen: popover.isOpen && shouldOverlaySelectedItem,
      selectedItemIndex,
      listboxId,
      listboxRef,
      anchorRef,
    });

  const selectedItemOffset = shouldOverlaySelectedItem ? rawOffset : 0;
  const isPositioned = shouldOverlaySelectedItem ? rawIsPositioned : true;
  const popoverPlacement = placement ?? 'below';
  const popoverOffsetStyle: React.CSSProperties | undefined =
    selectedItemOffset > 0
      ? {marginBlockStart: `-${selectedItemOffset}px`}
      : undefined;

  // Clear the current value. Shared by the clear button and the keyboard
  // Delete/Backspace path so clearing is reachable without a mouse.
  const clearValue = useCallback(() => {
    resetTypeaheadRef.current();
    onChange?.(null);
    if (changeAction) {
      startTransition(async () => {
        setOptimisticValue(undefined);
        await changeAction(null);
      });
    }
  }, [onChange, changeAction, startTransition, setOptimisticValue]);

  // Type-to-find appends to the query rather than replacing it: characters
  // typed before focus reaches the search input must not be dropped. The ref
  // is what makes that safe without a state updater — it advances
  // synchronously, so a second character seeded in the same tick still sees
  // the first, and the announcement can be computed here rather than inside a
  // setState callback.
  const appendSearchQuery = useCallback(
    (char: string) => {
      const nextQuery = searchQueryRef.current + char;
      searchQueryRef.current = nextQuery;
      setSearchQuery(nextQuery);
      announceSearchResults(nextQuery);
    },
    [announceSearchResults],
  );

  const commitValue = useCallback(
    (newValue: string) => {
      onChange?.(newValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [onChange, changeAction, startTransition, setOptimisticValue],
  );

  // Selector behavior (keyboard nav, selection)
  const {
    highlightedIndex,
    setHighlightedIndex,
    getItemId,
    onTriggerClick,
    onKeyDown,
    onItemSelect,
    onItemMouseEnter,
  } = useCombobox({
    selectableItems: filteredItems,
    // The optimistic value, not the raw prop: with a pending changeAction the
    // prop still holds the old selection, so the popup would open with the
    // highlight on it and Delete/Backspace could clear a value the action has
    // already replaced.
    value: optimisticValue,
    isDisabled: isDisabled || isEffectivelyReadOnly,
    isOpen: surface.isOpen,
    hasSearch,
    onOpen: useCallback(() => surface.show(), [surface]),
    onClose: surface.hide,
    onSelect: commitValue,
    onClear: hasClear ? clearValue : undefined,
    onSearchSeed: appendSearchQuery,
    listboxId,
  });

  // Type-to-select, shared with the other collections (menus, listboxes).
  // Open, it walks the highlight — aria-activedescendant announces each match.
  // Closed, it commits the match like a native select, which changes the value
  // without opening the popup or moving focus, so nothing else would prompt
  // assistive tech to re-read the trigger: announce it explicitly.
  const typeahead = useTypeahead({
    getItemLabels: () => selectableItems.map(item => item.label ?? item.value),
    isDisabled: index => selectableItems[index]?.disabled === true,
    // Cycle onward from the highlight when open, from the committed selection
    // when closed — the optimistic one, so a pending changeAction cannot strand
    // cycling on the first match. -1 means nothing is selected or highlighted,
    // which the hook reads as "search from the top".
    getCurrentIndex: () =>
      surface.isOpen ? highlightedIndex : selectedItemIndex,
    onMatch: index => {
      const item = selectableItems[index];
      if (surface.isOpen) {
        setHighlightedIndex(index);
      } else if (item.value !== optimisticValue) {
        commitValue(item.value);
        announce(item.label ?? item.value);
      }
    },
  });
  resetTypeaheadRef.current = typeahead.reset;

  // The press model for the listbox: the option under a finger's or
  // a mouse's RELEASE is the one picked, and the highlight follows a held
  // pointer through `highlightedIndex` — DOM focus stays on the trigger, as a
  // combobox's must. A mouse released outside dismisses the list; a finger
  // leaves it open.
  const optionIndexFromRow = useCallback((row: HTMLElement): number => {
    const match = /-item-(\d+)$/.exec(row.id);
    return match == null ? -1 : Number(match[1]);
  }, []);
  // Re-measured when the option set changes; the count is the dependency.
  const listboxHasOverflow = useMenuOverflow(
    listboxRef,
    filteredItems.length,
    surface.isOpen,
  );
  const listboxPress = useMenuPress({
    menuRef: listboxRef,
    itemSelector: '[role="option"]:not([aria-disabled="true"])',
    onHighlight: row => {
      if (row == null) {
        setHighlightedIndex(-1);
        return;
      }
      // The hover path, not the raw setter: a pointer-driven highlight must
      // never scroll the option into view, or the rows move under the
      // stationary finger and the highlight runs away (the same rule hover
      // follows).
      const index = optionIndexFromRow(row);
      const item = filteredItems[index];
      if (item != null) {
        onItemMouseEnter(item, index);
      }
    },
    onActivate: row => {
      const item = filteredItems[optionIndexFromRow(row)];
      if (item != null) {
        onItemSelect(item);
      }
    },
    onDismiss: surface.hide,
  });

  const handleTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isDisabled || isEffectivelyReadOnly) {
        return;
      }
      // With hasSearch the query input owns typing, so type-to-select is off.
      if (!hasSearch && typeahead.onKeyDown(e)) {
        e.preventDefault();
        return;
      }
      onKeyDown(e);
    },
    [isDisabled, isEffectivelyReadOnly, hasSearch, typeahead, onKeyDown],
  );

  // Highlight scrolling (and its hover/keyboard split) lives in useCombobox.

  // Handle clear button click
  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't open dropdown
      clearValue();
      // A keyboard activation (detail 0) leaves focus on the clear button,
      // which unmounts once the value is null and would drop focus to <body>;
      // hand it to the trigger as `hasClear` documents. A pointer press never
      // focuses the button, so there is no focus to repair, and moving it
      // would pull it out of an open list's search input.
      if (e.detail === 0) {
        triggerRef.current?.focus();
      }
    },
    [clearValue],
  );

  // Render search input
  const renderSearch = useCallback(() => {
    if (!hasSearch) {
      return null;
    }
    return (
      <PanelSearchInput
        ref={searchRef}
        id={searchId}
        // The search row is the panel's header: a magnifier, a borderless
        // input, and the shared clear (✕) button. It deliberately does NOT
        // render a bordered TextInput — the popup is already a bordered
        // surface, and a field inside it drew a second box within that box.
        label={t('@astryx.selector.searchOptions')}
        // Same accessible name the TextInput's built-in clear produced
        // ("Clear Search options"), so the affordance keeps its name while its
        // chrome changes.
        clearLabel={t('@astryx.textInput.clearLabel', {
          label: t('@astryx.selector.searchOptions'),
        })}
        {...themeProps('selector-search')}
        xstyle={
          surface.activePresentation === 'popover' &&
          variant === 'input' &&
          styles.searchRowInput
        }
        // When hasSearch is set, focus moves into this input on open, so it —
        // not the trigger — must be the combobox that reports the highlighted
        // option via aria-activedescendant (comboboxes-4). A bare searchbox
        // left the highlight silent to screen readers.
        role="combobox"
        aria-expanded={surface.isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          surface.isOpen && highlightedIndex >= 0
            ? getItemId(highlightedIndex)
            : undefined
        }
        value={searchQuery}
        onValueChange={handleSearchChange}
        onContainerKeyDown={e => {
          // The clear (✕) button lives inside the row, after the input in DOM
          // order. When it is focused and the user tabs forward there is
          // nothing else in the popup, so dismiss it (Shift+Tab returns to the
          // input natively). Key events originating on the input are handled on
          // the input below; ignore them here so we don't double-dismiss.
          if (e.target === searchRef.current) {
            return;
          }
          if (e.key === 'Tab' && !e.shiftKey) {
            onKeyDown(e);
          }
        }}
        onKeyDown={e => {
          // An in-progress IME composition uses these same keys (Enter to
          // commit the candidate, Escape/Arrows to navigate the candidate
          // window); the composing keydown fires before compositionend, so
          // without this guard a Korean/Japanese/Chinese user committing a
          // syllable with Enter would instead select the highlighted option.
          // See utils/ime.ts.
          if (isImeKeyEvent(e.nativeEvent)) {
            return;
          }
          // Arrow keys navigate options; Enter selects; Escape closes.
          // Home/End are left to the input for caret movement (APG editable
          // combobox); PageUp/PageDown are the sanctioned substitute for
          // jumping to the first/last option.
          if (
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp' ||
            e.key === 'PageUp' ||
            e.key === 'PageDown' ||
            e.key === 'Enter' ||
            e.key === 'Escape'
          ) {
            onKeyDown(e);
            return;
          }
          // Tab: when a query is showing the clear (✕) button, forward-tab
          // moves focus to it (keeping the popup open) so the affordance is
          // keyboard-reachable. Every other Tab dismisses the popup as usual.
          if (e.key === 'Tab' && (e.shiftKey || !hasQuery)) {
            onKeyDown(e);
          }
        }}
        placeholder={searchPlaceholder}
      />
    );
  }, [
    hasSearch,
    searchId,
    listboxId,
    searchQuery,
    hasQuery,
    searchPlaceholder,
    handleSearchChange,
    onKeyDown,
    surface.isOpen,
    surface.activePresentation,
    highlightedIndex,
    getItemId,
    variant,
    t,
  ]);

  // The single-selection mark, resolved from the theme once per render. A
  // theme that maps `check` to another indicator (a radio, say) changes every
  // selected-option mark in the app through this one lookup.
  const SelectionMark = useIndicator('check');

  // Render an individual item
  const renderItem = useCallback(
    (item: SelectorOptionData, flatIndex: number) => {
      const isHighlighted = flatIndex === highlightedIndex;
      const isSelected = item.value === normalizedValue;

      /*
       * Rendered UNCONDITIONALLY, with the state passed down: the default
       * check draws nothing when unchecked, but a theme that replaces the
       * `check` indicator with a radio needs the unselected state to draw
       * its empty circle. `{isSelected && …}` would make that impossible.
       *
       * `selector-check` stays the stable target for the mark's position
       * in the row; the indicator owns what the mark looks like.
       */
      const mark = (
        <span {...stylex.props(styles.itemMarkColumn)}>
          <SelectionMark
            state={isSelected ? 'checked' : 'unchecked'}
            size="sm"
            isDisabled={item.disabled ?? false}
            {...themeProps('selector-check')}
          />
        </span>
      );

      const optionContent = (
        <span {...stylex.props(styles.itemContent)}>
          {renderOption ? renderOption(item) : <DefaultOption option={item} />}
        </span>
      );

      const content =
        indicatorPosition === 'start' ? (
          <>
            {mark}
            {optionContent}
          </>
        ) : (
          <>
            {optionContent}
            {mark}
          </>
        );

      return (
        <div
          key={item.value}
          id={getItemId(flatIndex)}
          role="option"
          aria-selected={isSelected}
          aria-disabled={item.disabled}
          onClick={() => onItemSelect(item)}
          onMouseEnter={() => onItemMouseEnter(item, flatIndex)}
          {...mergeProps(
            // Stable theme target on the option row itself, mirroring
            // `multi-selector-option`: it carries the row's size and runtime
            // state so a theme can express "selected option at large" or
            // restyle a given row density without structural selectors. The
            // row's padding is split across a base and a per-size override (the
            // default `md` trims the block axis), so `size` is what a theme
            // needs to reach it. Named `-option-row` because `selector-option`
            // is the public SelectorOption content primitive, not this row.
            themeProps('selector-option-row', {
              size,
              selected: isSelected ? 'selected' : null,
              disabled: item.disabled ? 'disabled' : null,
            }),
            stylex.props(
              styles.item,
              itemSizeStyles[size],
              isHighlighted && styles.itemHighlighted,
              isSelected && styles.itemSelected,
              item.disabled && styles.itemDisabled,
            ),
          )}>
          {content}
        </div>
      );
    },
    [
      renderOption,
      indicatorPosition,
      highlightedIndex,
      size,
      normalizedValue,
      getItemId,
      onItemSelect,
      onItemMouseEnter,
      SelectionMark,
    ],
  );

  // Render all options (handling sections/dividers)
  const renderOptions = useCallback(() => {
    const isSearching = hasSearch && Boolean(searchQuery);

    // Nothing to show — either the query matched nothing, or no options were
    // given at all. Both render the same slot with different copy. While
    // isLoading the options have not arrived yet, so asserting either would be
    // a claim the component cannot make; the trigger's spinner covers it.
    if (filteredItems.length === 0 && !isLoading) {
      // role="presentation" keeps the message out of the listbox's
      // accessibility tree (role="listbox" only permits option/group
      // children); the no-results outcome is announced via the
      // result-count live region instead.
      return [
        <div
          key="empty"
          ref={emptyStateRef}
          role="presentation"
          {...mergeProps(
            themeProps('selector-empty-state'),
            stylex.props(styles.emptyState),
          )}>
          {isSearching ? emptySearchText : emptyText}
        </div>,
      ];
    }

    let flatIndex = 0;
    const elements: ReactNode[] = [];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];

      if (isDivider(option)) {
        // While searching, a standalone divider between groups would orphan
        // itself once its neighbors are filtered out, so skip it.
        if (isSearching) {
          continue;
        }
        // role="listbox" only permits option/group children; the divider
        // carries no information the options don't, so it's hidden from the
        // accessibility tree entirely rather than exposing role="separator"
        // as a disallowed listbox child (axe aria-required-children).
        elements.push(
          <Divider
            key={`divider-${i}`}
            aria-hidden="true"
            xstyle={styles.divider}
          />,
        );
      } else if (isSection(option)) {
        const sectionItems: ReactNode[] = [];
        for (const opt of option.options) {
          const normalized = normalizeOption(opt);
          if (isSearching && !optionMatchesQuery(normalized, searchQuery)) {
            continue;
          }
          sectionItems.push(renderItem(normalized, flatIndex));
          flatIndex++;
        }
        // Hide a group entirely (header + wrapper) when none of its items
        // match the query, so no header is left standing over nothing.
        if (sectionItems.length === 0) {
          continue;
        }
        // The heading lives INSIDE the group and is aria-hidden: the group
        // already carries the title as its accessible name, so exposing the
        // text again would announce it twice. This also keeps role="listbox"'s
        // children to option/group only — the old labeled Divider sat in the
        // listbox as a stray role="separator".
        elements.push(
          <div key={`section-${i}`} role="group" aria-label={option.title}>
            {option.title && (
              <div
                aria-hidden="true"
                {...mergeProps(
                  themeProps('selector-section-heading'),
                  stylex.props(styles.sectionHeading),
                )}>
                {option.title}
              </div>
            )}
            {sectionItems}
          </div>,
        );
      } else if (isOptionData(option)) {
        const normalized = normalizeOption(option);
        if (isSearching && !optionMatchesQuery(normalized, searchQuery)) {
          continue;
        }
        elements.push(renderItem(normalized, flatIndex));
        flatIndex++;
      }
    }

    return elements;
  }, [
    options,
    renderItem,
    hasSearch,
    searchQuery,
    filteredItems,
    isLoading,
    emptyText,
    emptySearchText,
  ]);

  // The detached message box renders its own leading status icon, so the
  // on-field icon would duplicate it — keep the chevron indicator instead.
  const showStatusIcon =
    status != null && effectiveStatusVariant !== 'detached';
  const showStatusTooltip =
    status != null && effectiveStatusVariant === 'tooltip' && !!status.message;

  // Two lines cannot fit inside an InputGroup: the group pins the row height,
  // and the trigger clamps its value box to one line so nothing bleeds through
  // its border (styles.triggerValueInGroup). The clamp holds for any node; the
  // context is what lets the rows the system draws itself reflow into that one
  // line — label and description side by side — instead of being cut off at
  // it. Outside a group the caller's own row decides, and the trigger's
  // padding sizes it to whatever that draws.
  const rowLayout = inputGroup ? 'inline' : 'stacked';

  // What the closed trigger shows for the current selection: the option's icon
  // and label. `startIcon` wins over the option's own icon so a caller who
  // pins a field icon does not get two.
  const valueContent =
    selectedItem && renderValue ? (
      <SelectorRowLayoutContext value={rowLayout}>
        <span
          {...stylex.props(
            styles.triggerValue,
            inputGroup && styles.triggerValueInGroup,
          )}>
          {renderValue(selectedItem)}
        </span>
      </SelectorRowLayoutContext>
    ) : (
      <>
        {!startIcon &&
          selectedItem?.icon != null &&
          renderIconSlot(selectedItem.icon, {size: 'sm', color: 'secondary'})}
        <span {...stylex.props(styles.triggerLabel)}>
          {selectedItem?.label ?? placeholder}
        </span>
      </>
    );

  const panelContent = hasSearch ? (
    <div>
      {renderSearch()}
      <Divider />
      <div
        ref={listboxRef}
        id={listboxId}
        role="listbox"
        aria-labelledby={triggerId}
        {...listboxPress.menuProps}
        {...stylex.props(
          styles.dropdown,
          listboxHasOverflow
            ? styles.touchPanYPinchZoom
            : styles.touchPinchZoom,
          surface.activePresentation === 'popover' &&
            variant === 'input' &&
            styles.dropdownInput,
        )}>
        {renderOptions()}
      </div>
    </div>
  ) : (
    <div
      ref={listboxRef}
      id={listboxId}
      role="listbox"
      {...listboxPress.menuProps}
      // The bottom sheet is a modal layer, so Chromium drops the trigger
      // outside it from the accessibility tree and a reference to it yields
      // no name. Name only this no-search sheet directly from the component's
      // label; the searchable sheet and the popovers keep the trigger
      // relationship.
      aria-label={
        surface.activePresentation === 'bottom-sheet' ? label : undefined
      }
      aria-labelledby={
        surface.activePresentation === 'bottom-sheet' ? undefined : triggerId
      }
      aria-activedescendant={
        surface.isOpen && highlightedIndex >= 0
          ? getItemId(highlightedIndex)
          : undefined
      }
      tabIndex={surface.activePresentation === 'bottom-sheet' ? 0 : undefined}
      onKeyDown={
        surface.activePresentation === 'bottom-sheet'
          ? handleTriggerKeyDown
          : undefined
      }
      {...stylex.props(
        styles.dropdown,
        listboxHasOverflow ? styles.touchPanYPinchZoom : styles.touchPinchZoom,
        surface.activePresentation === 'popover' &&
          variant === 'input' &&
          styles.dropdownInput,
        surface.activePresentation === 'popover' &&
          !isPositioned &&
          styles.dropdownHidden,
      )}>
      {renderOptions()}
    </div>
  );

  let selectionSurface: ReactNode = null;
  if (surface.activePresentation === 'bottom-sheet') {
    if (!isEffectivelyReadOnly || surface.isSheetPresented) {
      selectionSurface = (
        <SelectorBottomSheet
          isOpen={surface.isSheetOpen}
          onOpenChange={surface.onSheetOpenChange}
          finalFocusRef={triggerRef}
          initialFocusRef={hasSearch ? searchRef : listboxRef}
          label={label}>
          {panelContent}
        </SelectorBottomSheet>
      );
    }
  } else if (!isEffectivelyReadOnly) {
    selectionSurface = popover.render(panelContent, {
      placement: popoverPlacement,
      alignment: 'start',
      // The system's standard menu clearance, except in overlay mode:
      // there the measured negative margin owns the block geometry and
      // the menu is meant to sit on the trigger, not clear it.
      offset: shouldOverlaySelectedItem
        ? undefined
        : spacingVars['--spacing-1'],
      xstyle: [styles.popover, layerAnimations[popoverPlacement]],
      style: popoverOffsetStyle,
    });
  }

  // A disabled trigger stays focusable but, like a natively disabled button,
  // runs no caller event handler other than focus and blur, and a press on it
  // reaches no handler at all (`spec:AST-085` FR2).
  const callerProps = isDisabled
    ? Object.fromEntries(
        Object.entries(rest).filter(
          ([key]) => !/^on[A-Z]/.test(key) || /^on(Focus|Blur)/.test(key),
        ),
      )
    : rest;
  const triggerSharedProps: React.HTMLAttributes<HTMLElement> = {
    ...callerProps,
    onClick: isDisabled
      ? event => {
          event.preventDefault();
          event.stopPropagation();
        }
      : rest.onClick,
    id: triggerId,
    // A caller's description is kept alongside the field's own.
    'aria-describedby':
      [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
      undefined,
    'aria-labelledby': triggerLabelledBy,
    'aria-required': isEffectivelyRequired ? 'true' : undefined,
    'aria-invalid': status?.type === 'error' ? 'true' : undefined,
    'aria-busy': isBusy || undefined,
    // The built-in keyboard model runs first; a caller handler sees the keys
    // it leaves uncancelled. A caller `onClick` arrives through `rest` and
    // runs on the trigger before the press bubbles to the control box's
    // toggle, as it always has.
    onKeyDown: isDisabled
      ? handleTriggerKeyDown
      : composeEventHandlers(handleTriggerKeyDown, onKeyDownProp),
    onFocus: event => {
      onFocus?.(event);
      surface.onTriggerFocus(event);
    },
    tabIndex: 0,
    ...stylex.props(
      styles.trigger,
      isEffectivelyReadOnly && styles.triggerReadOnly,
      inputGroup && styles.triggerButtonInGroup,
    ),
  };

  const selectorContent = (
    <>
      <div
        ref={el => {
          anchorRef.current = el;
          popover.triggerRef(el);
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, and anchor names
          // compose, so attaching unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        onClick={onTriggerClick}
        {...pressable}
        {...(inputGroup ? inputGroupItemProps : undefined)}
        {...mergeProps(
          themeProps('selector', {
            variant,
            size,
            status: status?.type ?? null,
            disabled: isDisabled ? 'disabled' : null,
            readonly: isEffectivelyReadOnly ? 'readonly' : null,
          }),
          stylex.props(
            inputWrapperStyles.base,
            styles.triggerContainer,
            sizeStyles[size],
            variant === 'ghost' && styles.triggerGhost,
            variant === 'secondary' && styles.triggerSecondary,
            variant !== 'input' && interactionOverlayStyles.backgroundImage,
            variant !== 'input' && focusOutlineStyles.focusWithin,
            surface.isTriggerFocusRingSuppressed &&
              selectorPresentationStyles.pointerRestoredFocus,
            isDisabled && inputWrapperStyles.disabled,
            variant === 'input' &&
              isDisabled &&
              !surface.isTriggerFocusRingSuppressed &&
              styles.triggerDisabledFocus,
            isEffectivelyReadOnly && styles.triggerReadOnly,
            variant !== 'input' && isDisabled && styles.triggerGhostDisabled,
            variant !== 'input' &&
              isEffectivelyReadOnly &&
              styles.triggerGhostReadOnly,
            !selectedItem && styles.triggerPlaceholder,
            variant === 'input' &&
              status &&
              inputStatusBorderStyles[status.type],
            variant === 'input' &&
              status &&
              !isDisabled &&
              inputStatusHoverShadowStyles[status.type],
            // Grouped secondary triggers keep their neutral fill but take the
            // group's row height, connected edge radii, and focus stacking.
            variant !== 'ghost' && inputGroup && groupStyles.inGroup,
            inputGroup && styles.triggerInGroup,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {startIcon &&
          renderIconSlot(startIcon, {size: 'sm', color: 'secondary'})}
        {inputGroup && (
          <VisuallyHidden id={inputLabelId}>{label}</VisuallyHidden>
        )}
        {isEffectivelyReadOnly && (
          <VisuallyHidden id={readOnlyDescriptionId}>
            {t('@astryx.input.readOnly')}
          </VisuallyHidden>
        )}
        <button
          {...triggerSharedProps}
          ref={triggerButtonRef}
          type="button"
          // The read-only trigger stays a combobox even when hasSearch is set:
          // no search input is rendered in that state, and preserving the role
          // keeps the control's programmatic identity stable. Editable search
          // mode still moves combobox semantics to the popup input.
          role={isEffectivelyReadOnly || !hasSearch ? 'combobox' : undefined}
          aria-haspopup={
            isEffectivelyReadOnly
              ? undefined
              : surface.activePresentation === 'bottom-sheet'
                ? 'dialog'
                : 'listbox'
          }
          aria-expanded={isEffectivelyReadOnly ? false : surface.isOpen}
          aria-controls={isEffectivelyReadOnly ? undefined : listboxId}
          aria-readonly={isEffectivelyReadOnly || undefined}
          aria-activedescendant={
            !isEffectivelyReadOnly &&
            !hasSearch &&
            surface.isOpen &&
            highlightedIndex >= 0
              ? getItemId(highlightedIndex)
              : undefined
          }
          // A disabled trigger keeps its tab stop and says so through
          // aria-disabled (`spec:AST-085` FR1); the isDisabled guards in
          // useCombobox block every way of opening it.
          aria-disabled={isDisabled ? 'true' : undefined}>
          {valueContent}
        </button>
        {/* A disabled selector submits no value (`spec:AST-085` FR3). */}
        {htmlName != null && !isDisabled && (
          <input type="hidden" name={htmlName} value={value ?? ''} />
        )}
        {isBusy && <Spinner size="sm" aria-hidden="true" />}
        {hasClear && value != null && !isDisabled && !isEffectivelyReadOnly && (
          <InternalInputClearButton
            {...keepOpenProps}
            label={t('@astryx.selector.clearLabel', {label})}
            onClick={handleClear}
          />
        )}
        {/*
          No wrapper span: Icon's own span already provides the 16px box (`sm`)
          and the icon color, so the status glyph and the chevron are each
          directly targetable instead of sharing one untargetable parent — and
          the two affordances stop sharing a node.
        */}
        {showStatusIcon ? (
          showStatusTooltip ? (
            <button
              ref={statusTooltip.ref}
              type="button"
              aria-label={t(STATUS_BUTTON_LABEL_KEY[status.type])}
              aria-describedby={statusTooltip.describedBy}
              {...keepOpenProps}
              onClick={e => e.stopPropagation()}
              {...stylex.props(
                focusOutlineStyles.focusVisible,
                styles.statusButton,
              )}>
              <Icon
                icon={STATUS_ICON_MAP[status.type]}
                size="sm"
                color={STATUS_ICON_COLOR_MAP[status.type]}
                xstyle={styles.triggerIcon}
              />
            </button>
          ) : (
            <Icon
              icon={STATUS_ICON_MAP[status.type]}
              size="sm"
              color={STATUS_ICON_COLOR_MAP[status.type]}
              xstyle={styles.triggerIcon}
            />
          )
        ) : !isEffectivelyReadOnly ? (
          <Icon
            icon="chevronDown"
            size="sm"
            color="secondary"
            // The rotation rides on the glyph, alongside the box and color
            // the wrapper used to provide, so one element carries the mark,
            // its open/closed transform, and the theme target.
            xstyle={[
              styles.triggerIcon,
              styles.triggerIconRotation,
              surface.isOpen && styles.triggerIconOpen,
            ]}
            // Stable theme target on the chevron glyph itself, so a theme can
            // restyle just this icon (color, size, hover) — and its
            // open/closed state — via `defineTheme`. Same-element rules in
            // @layer astryx-theme win over the icon's own base color/size,
            // which a button-level target could not reach.
            {...themeProps('selector-indicator-icon', {
              state: surface.isOpen ? 'expanded' : 'collapsed',
            })}
          />
        ) : null}
      </div>

      {selectionSurface}

      {showStatusTooltip && statusTooltip.renderTooltip(status?.message ?? '')}

      {showsDisabledMessage &&
        disabledMessageTooltip.renderTooltip(disabledMessage)}
    </>
  );

  if (inputGroup) {
    return selectorContent;
  }

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={triggerId}
      labelID={ariaLabelledByProp != null ? fieldLabelId : undefined}
      descriptionID={description ? descriptionId : undefined}
      isOptional={isOptional}
      isRequired={isRequired}
      isDisabled={isDisabled}
      status={
        status
          ? {
              type: status.type,
              message: status.message,
              messageID: status.message ? statusMessageId : undefined,
            }
          : undefined
      }
      statusVariant={effectiveStatusVariant}
      labelTooltip={labelTooltip}
      width={width}
      {...container}>
      {selectorContent}
    </Field>
  );
}

Selector.displayName = 'Selector';
