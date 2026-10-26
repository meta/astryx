// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file MultiSelector.tsx
 * @input Uses React, StyleX, usePopover, useTooltip, CheckboxInput, Field, Badge, Icon, InputGroupContext
 * @output Exports MultiSelector with input, secondary, and ghost trigger variants
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update:
 * - /packages/core/src/MultiSelector/MultiSelector.doc.mjs
 * - /packages/core/src/MultiSelector/MultiSelector.test.tsx
 * - /packages/core/src/MultiSelector/index.ts
 * - /apps/storybook/stories/MultiSelector.stories.tsx
 * - /apps/storybook/stories/InputGroup.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/MultiSelector/ (showcase blocks)
 */

import React, {
  use,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
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
import type {IconName} from '../Icon';
import {
  Field,
  inputStatusBorderStyles,
  inputStatusHoverShadowStyles,
  inputWrapperStyles,
  type FieldStatusVariant,
} from '../Field';
import {useKeepLayerOpenProps} from '../Layer/useLayer';
import {InternalInputClearButton} from '../Field/InputClearButton';
import {Divider} from '../Divider';
import {Spinner} from '../Spinner';
import {PanelSearchInput} from '../Field/PanelSearchInput';
import {CheckboxInput} from '../CheckboxInput';
import type {IndicatorPosition} from '../Indicator';
import {Badge} from '../Badge';
import {
  colorVars,
  focusVars,
  sizeVars,
  spacingVars,
  radiusVars,
  durationVars,
  easeVars,
  typographyVars,
  fontWeightVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import type {
  MultiSelectorOptionType,
  MultiSelectorOptionData,
  MultiSelectorStatus,
} from './types';
import {
  isOptionData,
  isDivider,
  isSection,
  normalizeOption,
  getSelectableOptions,
} from '../Selector/utils';
import {useMultiCombobox} from './hooks';
import {getInputARIA, isImeKeyEvent, mergeProps} from '../utils';
import {devWarn, warnOnce} from '../utils/devWarning';
import {
  getInteractionModality,
  useInteractionModalityTracking,
} from '../utils/interactionModality';
import {useAnnounce} from '../hooks/useAnnounce';
import {FOCUSABLE_SELECTOR} from '../hooks/focusableSelector';
import {useAnnounceRenderedText} from '../hooks/useAnnounceRenderedText';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
  type FieldPartStyleProps,
} from '../Field/fieldParts';
import {useDevWarning} from '../hooks/useDevWarning';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {mergeRefs} from '../utils/mergeRefs';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import type {SizeValue} from '../utils/types';
import {useSize} from '../SizeContext/SizeContext';
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
import {SelectorBottomSheet} from '../Selector/SelectorBottomSheet';
import {useSelectorPresentation} from '../Selector/useSelectorPresentation';
import {selectorPresentationStyles} from '../Selector/selectorPresentation.stylex';

// Sentinel value for the select-all item in keyboard navigation
const SELECT_ALL_VALUE = '__xds_select_all__';

// Value of the synthetic "Create <query>" row `hasCreate` offers. Never a real
// option value: picking it reports a `create` change, not a toggle.
const CREATE_VALUE_PREFIX = '__astryx_multi_selector_create__';

function isCreateValue(value: string): boolean {
  return value.startsWith(CREATE_VALUE_PREFIX);
}

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
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
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
    // :focus-within when this button is focused, matching
    // TextInput/NumberInput/Selector. The button must not draw its own
    // :focus-visible outline or the two stack into a doubled ring over the
    // trigger.
    outline: 'none',
    borderRadius: radiusVars['--radius-element'],
  },
  triggerPlaceholder: {
    color: colorVars['--color-text-secondary'],
  },
  triggerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  triggerText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  triggerBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacingVars['--spacing-1'],
    alignItems: 'center',
  },
  triggerOverflow: {
    flexShrink: 0,
    fontSize: typeScaleVars['--text-label-size'],
    color: colorVars['--color-text-secondary'],
    fontWeight: fontWeightVars['--font-weight-medium'],
  },
  // Only what Icon does not already provide: `size="sm"` gives the 16px box
  // and `color` the token, but the glyph still must not shrink inside the flex
  // trigger.
  triggerIcon: {
    flexShrink: 0,
  },
  // Rotation lives on the chevron glyph itself (passed through `xstyle`), not
  // on the layout wrapper above, so the icon's `multi-selector-indicator-icon`
  // theme target and the open/closed transform sit on one element — a theme can
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
  triggerGhost: {
    width: 'auto',
    borderWidth: 0,
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
  // Keep the input-family width contract while reusing ghost's borderless paint
  // and the neutral resting fill used by secondary buttons.
  triggerSecondary: {
    borderWidth: 0,
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
    padding: spacingVars['--spacing-1'],
  },
  listbox: {
    outline: 'none',
  },

  // Popover container (for anchor positioning)
  popover: {
    minWidth: 'anchor-size(width)',
  },

  // Select-all wrapper
  selectAllWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
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
    gap: spacingVars['--spacing-2'],
    width: '100%',
    borderRadius: radiusVars['--radius-element'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    // Row typography lives here, not on the label span, so a theme override on
    // the row target reaches both the fallback label and renderOption output
    // (a declaration on the span would win over the inherited row value).
    // Matches Selector, whose option row owns its typography the same way.
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-primary'],
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderStyle: 'none',
    outline: 'none',
  },
  itemHighlighted: {
    backgroundColor: colorVars['--color-overlay-hover'],
  },
  itemDisabled: {
    opacity: 0.5,
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
  },

  // Decorative checkbox (non-interactive, purely visual)
  checkboxDecorative: {
    pointerEvents: 'none',
    display: 'flex',
    flexShrink: 0,
  },
  // Pushed to the row's far edge rather than sitting against the label, which
  // is what an end-positioned control means here. The row is not
  // `space-between` (a truncating label plus a trailing control is what wants
  // the auto margin), and `renderOption` content is not wrapped in a growing
  // span, so the margin has to live on the checkbox itself.
  checkboxDecorativeEnd: {
    marginInlineStart: 'auto',
  },

  // Label text for items (rendered outside checkbox for correct click
  // behavior). Typography is inherited from the row; this only handles
  // truncation.
  itemLabel: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Grid rows (spec:AST-058): the row carries today's option chrome (padding,
  // radius, highlight); its two cells split it into the option's click
  // target and the action's slot. The action cell is a real cell for the
  // active-descendant ring, drawn with the shared focus-outline parts because
  // no element inside the popup has DOM focus.
  gridRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
  },
  optionCell: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-2'],
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  actionCell: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderRadius: radiusVars['--radius-element'],
  },
  // The standard ring, from the focus tokens themselves: inside
  // `stylex.create` StyleX resolves an imported `defineVars` group, and a
  // plain object such as `FOCUS_OUTLINE_PARTS` compiles to variables nothing
  // defines.
  actionCellActive: {
    outlineWidth: focusVars['--focus-outline-width'],
    outlineStyle: focusVars['--focus-outline-style'],
    outlineColor: focusVars['--focus-outline-color'],
    outlineOffset: focusVars['--focus-outline-offset'],
  },

  // Empty state
  emptyState: {
    padding: spacingVars['--spacing-3'],
    textAlign: 'center',
    color: colorVars['--color-text-secondary'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
  },
});

const sizeStyles = stylex.create({
  sm: {
    height: sizeVars['--size-element-sm'],
  },
  md: {
    height: sizeVars['--size-element-md'],
  },
  lg: {
    height: sizeVars['--size-element-lg'],
  },
});

const itemSizeStyles = stylex.create({
  sm: {
    padding: spacingVars['--spacing-1'],
  },
  md: {
    paddingBlock: spacingVars['--spacing-1-5'],
    paddingInline: spacingVars['--spacing-2'],
  },
  lg: {
    padding: spacingVars['--spacing-2'],
  },
});

const selectAllSizeStyles = stylex.create({
  sm: {
    paddingInline: spacingVars['--spacing-1'],
    paddingBlock: spacingVars['--spacing-0-5'],
  },
  md: {
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
  },
  lg: {
    paddingInline: spacingVars['--spacing-2'],
    paddingBlock: spacingVars['--spacing-1'],
  },
});

const RENDER_TRIGGER_PARTS_MESSAGE =
  '`container*` and `control*` styling props have no effect with `renderTrigger`: ' +
  'no Field box or control box renders. Style the control you render instead.';

const STATUS_ICON_MAP: Record<MultiSelectorStatusType, IconName> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const STATUS_ICON_COLOR_MAP: Record<
  MultiSelectorStatusType,
  'warning' | 'error' | 'success'
> = {
  warning: 'warning',
  error: 'error',
  success: 'success',
};

const STATUS_BUTTON_LABEL_KEY: Record<MultiSelectorStatusType, string> = {
  warning: '@astryx.input.statusButton.warning',
  error: '@astryx.input.statusButton.error',
  success: '@astryx.input.statusButton.success',
};

export type MultiSelectorSize = 'sm' | 'md' | 'lg';

export type MultiSelectorVariant = 'input' | 'secondary' | 'ghost';

export type MultiSelectorPresentation = AdaptivePresentation;

export type MultiSelectorStatusType = 'warning' | 'error' | 'success';

export type {MultiSelectorStatus};

/**
 * Props the `renderTrigger` render prop hands to the control the caller
 * renders.
 * Spread them onto that control: it becomes the panel's anchor, the element
 * focus returns to, and the control that announces the panel's state.
 */
export interface MultiSelectorRenderTriggerProps extends Omit<
  FieldInputBaseProps,
  | keyof FieldPartStyleProps
  | 'id'
  | 'onClick'
  | 'onKeyDown'
  | 'onFocus'
  | 'aria-haspopup'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-busy'
  | 'aria-readonly'
> {
  /**
   * Attaches the control as the panel's anchor and focus-return target, and
   * forwards it to the selector's own `ref`.
   */
  ref: (element: HTMLElement | null) => void;
  /** The id the field would have given its own button. */
  id: string;
  /**
   * Opening handlers, present only when there is a panel to open. A
   * read-only selector withholds them, so spreading these props onto a
   * control gives it no opener rather than a dead one.
   */
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: (event: React.FocusEvent<HTMLElement>) => void;
  /**
   * Disclosure state. A read-only selector has no surface to disclose, so
   * `aria-haspopup` and `aria-controls` are absent and `aria-expanded` is
   * `false` (`spec:AST-011` FR4).
   */
  'aria-haspopup'?: 'listbox' | 'grid' | 'dialog';
  'aria-expanded': boolean;
  'aria-controls'?: string;
  'aria-busy': boolean | undefined;
  /**
   * `true` when the selector is read-only, so the caller's control can show
   * that state the way its own design calls for.
   */
  'aria-readonly'?: boolean;
}

/**
 * Imperative control surface for MultiSelector, accessed via the `handleRef`
 * prop. Methods drive the same popover machinery as the built-in trigger, so
 * they respect focus restoration, light dismiss, and Escape. Pair with
 * `onOpenChange` to observe every open and close, including the ones the
 * selector performs itself. Same shape as `ComplexSelectorHandle`.
 */
export interface MultiSelectorHandle {
  /** Open the panel. No-op when disabled, read-only, or already open. */
  open(): void;
  /** Close the panel. Restores focus to the trigger. */
  close(): void;
  /** Toggle the panel open or closed. */
  toggle(): void;
  /** Whether the panel is currently open. Reads live state. */
  isOpen(): boolean;
}

/**
 * What kind of change an `onChange` call reports. Only a creation is reported
 * today; a plain toggle, clear, or select-all passes no descriptor, so a
 * one-argument `onChange` keeps working unchanged.
 */
export type MultiSelectorChange = {
  /** The person picked the `Create "<query>"` row of a search. */
  type: 'create';
  /** The trimmed query, which is also the new entry appended to `value`. */
  query: string;
};

export interface MultiSelectorSelectedItem {
  value: string;
  label: string;
}

export interface MultiSelectorProps<
  T extends MultiSelectorOptionType = MultiSelectorOptionType,
> extends Omit<FieldInputBaseProps, 'onChange' | 'defaultValue'> {
  /**
   * Label text for the multi-selector (always rendered for accessibility).
   */
  label: string;

  /**
   * Ref to the trigger: the button that carries the combobox role, the
   * accessible name, and the value — or, with `renderTrigger`, the caller's
   * control.
   */
  ref?: React.Ref<HTMLElement>;

  /**
   * Click handler on the trigger (or, with `renderTrigger`, the caller's
   * control). It runs after the built-in toggle and cannot cancel it.
   */
  onClick?: React.MouseEventHandler<HTMLElement>;

  /**
   * Focus handler on the trigger. It runs before the selector's own focus
   * handling.
   */
  onFocus?: React.FocusEventHandler<HTMLElement>;

  /**
   * Key handler on the trigger. It runs after the built-in keyboard model and
   * is skipped for keys that model handles and cancels.
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
   * The selected values stay visible, focusable, and included in form
   * submission, and retain their combobox identity with `aria-readonly`. The
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
   * <MultiSelector
   *   label="Columns"
   *   options={columns}
   *   value={selected}
   *   onChange={setSelected}
   *   isDisabled
   *   disabledMessage="Select a table first"
   * />
   * ```
   */
  disabledMessage?: string;

  /**
   * The options to display in the selector.
   * Can be strings, objects, dividers, or sections.
   */
  options: T[];

  /**
   * The currently selected values.
   */
  value: string[];

  /**
   * The HTML name attribute for form submissions. When set, hidden inputs
   * carry one entry per selected value under this name, matching how a
   * native multi-select serializes.
   */
  htmlName?: string;

  /**
   * Callback when selection changes. A creation (`hasCreate`) arrives with
   * a descriptor as the second argument and the typed text appended to
   * `value`; the caller adds the matching option and accepts the value in the
   * same update. Every other change passes no descriptor.
   */
  onChange: (value: string[], change?: MultiSelectorChange) => void;

  /**
   * Async action on change. Fires after onChange.
   */
  changeAction?: (value: string[]) => void | Promise<void>;

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
   * @default 'md'
   */
  size?: MultiSelectorSize;

  /**
   * Visual style of the selector trigger.
   * - 'input': bordered input-style trigger for forms
   * - 'secondary': matches the theme's secondary buttons (borderless and
   *   neutral-filled by default)
   * - 'ghost': borderless, transparent trigger matching ghost buttons
   * @default 'input'
   */
  variant?: MultiSelectorVariant;

  /**
   * Status indicator for the selector.
   */
  status?: MultiSelectorStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the bordered input (input variant only)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': message is exposed from the on-field status icon
   * @default 'attached' for input selectors; 'detached' for secondary and ghost selectors
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
   * Icon displayed at the start of the selector trigger.
   */
  startIcon?: ReactNode | IconType;

  /**
   * Whether to show a clear button when values are selected.
   * When clicked, resets the value to an empty array and returns focus to the trigger.
   * @default false
   */
  hasClear?: boolean;

  /**
   * Whether to show a "Select all" checkbox.
   * @default false
   */
  hasSelectAll?: boolean;

  /**
   * Label for the select-all checkbox.
   * @default 'Select all'
   */
  selectAllLabel?: string;

  /**
   * Whether to show a search input.
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
   * With `hasSearch`, offer a `Create "<query>"` row first in the list when the
   * trimmed query equals no option's label under the search's own matching
   * (case-insensitive). Picking it, or Enter with nothing highlighted, calls
   * `onChange` with the query appended to `value` and a `{type: 'create',
   * query}` descriptor, then clears the search. The caller MUST add an option
   * for the new value in that same update; the component does not mint
   * options. Nothing is offered while `isLoading`. Setting this without
   * `hasSearch` warns in development and offers nothing.
   * @default false
   */
  hasCreate?: boolean;

  /**
   * How to display selected items in the trigger.
   * - 'count': "3 selected"
   * - 'labels': "Name, Email, +3"
   * - 'badges': [Name] [Email] +2
   * @default 'count'
   */
  triggerDisplay?: 'count' | 'labels' | 'badges';

  /**
   * Formats the trigger text when triggerDisplay is 'count' or 'labels'.
   * Receives the selected items (value plus resolved label, in selection
   * order) and returns the full trigger text; the count is `items.length`.
   * Not called when nothing is selected — the placeholder shows instead — and
   * not called for triggerDisplay 'badges', which renders Badge elements
   * rather than text.
   * @default items => `${items.length} selected` for 'count', "A, B, C, +N" for 'labels'
   */
  formatValue?: (items: MultiSelectorSelectedItem[]) => string;

  /**
   * Maximum number of badges to show before showing "+N".
   * Only used when triggerDisplay is 'badges'.
   * @default 3
   */
  maxBadges?: number;

  /**
   * Custom render function for options.
   * Only called for selectable options (not dividers/sections or the select-all row).
   */
  renderOption?: (option: MultiSelectorOptionData) => ReactNode;

  /**
   * Which edge of the option row carries the checkbox.
   *
   * @default 'start'
   */
  indicatorPosition?: IndicatorPosition;

  /**
   * How the option list is presented.
   * - 'popover': anchored to the trigger
   * - 'bottom-sheet': modal sheet suited to compact touch screens
   * - 'adaptive': bottom sheet on compact coarse-pointer screens, otherwise popover
   * @default 'popover'
   */
  presentation?: MultiSelectorPresentation;

  /**
   * Whether the dropdown starts open on mount.
   * Useful for showcases and previews.
   * @default false
   */
  isDefaultOpen?: boolean;

  /**
   * Render the control the panel hangs off — a glyph in a list row, a chip,
   * an icon button — instead of the selector's own field and button. Spread
   * the given props onto it; the listbox is then anchored to and labelled by
   * that control, and `label` names the listbox for assistive technology.
   * The field chrome (`Field`, status, clear button, spinner) is not
   * rendered; the caller owns the opener. Pair with `handleRef` to open the
   * panel from a keystroke elsewhere.
   *
   * Hover and pressed paint stay yours. The open state reaches your control
   * as `aria-expanded` on the given props, so style it from the rendered
   * attribute. A pressed look keyed to `:active` is not a substitute:
   * `:active` does not behave the same under a coarse pointer, which is why
   * menu rows drop coarse-pointer `:active` paint entirely.
   *
   * A read-only selector has no panel to open, so the disclosure attributes
   * and the opening handlers are withheld: your control reports
   * `aria-expanded="false"` and points at nothing.
   *
   * @example
   * ```
   * <MultiSelector
   *   label="Labels"
   *   renderTrigger={props => <IconButton icon="tag" label="Labels" {...props} />}
   *   …
   * />
   * ```
   *
   * @example
   * ```
   * // Styling the open state from the rendered attribute:
   * // .my-trigger[aria-expanded='true'] { background: var(--color-overlay-pressed); }
   * ```
   */
  renderTrigger?: (props: MultiSelectorRenderTriggerProps) => ReactNode;

  /**
   * Imperative handle for opening and closing the panel. Prefer `handleRef`
   * over mirroring open state in the parent — the selector owns its
   * visibility, and imperative calls avoid the focus-management pitfalls of
   * syncing an external `isOpen` prop.
   */
  handleRef?: React.Ref<MultiSelectorHandle>;

  /**
   * Called whenever the panel opens or closes, however it happened — the
   * trigger, the keyboard, a light dismiss, Escape, or the imperative handle.
   */
  onOpenChange?: (isOpen: boolean) => void;

  /**
   * Test ID for testing frameworks, set on the trigger button (or, with
   * `renderTrigger`, the caller's control).
   */
  'data-testid'?: string;
}

// Whether any declared option — at any depth of sections, before any query
// filters it — carries an action. Presence only: the node is never read
// (spec:AST-058 FR2, DEC-5).
function hasDeclaredAction(options: MultiSelectorOptionType[]): boolean {
  for (const option of options) {
    if (isSection(option)) {
      if (
        option.options.some(
          opt => typeof opt !== 'string' && opt.action != null,
        )
      ) {
        return true;
      }
    } else if (
      typeof option !== 'string' &&
      isOptionData(option) &&
      option.action != null
    ) {
      return true;
    }
  }
  return false;
}

// Case-insensitive substring match for a single option. The one predicate used
// by both the flat filter (count + keyboard nav) and the grouped renderer, so
// what is shown while searching stays in lockstep with the announced count.
function normalizeLabel(label: string): string {
  return label.toLowerCase();
}

function optionMatchesQuery(
  option: MultiSelectorOptionData,
  query: string,
): boolean {
  if (!query) {
    return true;
  }
  return normalizeLabel(option.label ?? option.value).includes(
    normalizeLabel(query),
  );
}

// "Already exists" for the create row uses the filter's own normalization, so
// a label the filter shows as an exact match is never offered for creation,
// and a label the filter cannot surface for this query is never a dead end.
function hasLabel(items: MultiSelectorOptionData[], query: string): boolean {
  const wanted = normalizeLabel(query);
  return items.some(
    item => normalizeLabel(item.label ?? item.value) === wanted,
  );
}

// Case-insensitive substring filter over the selectable options. Shared by the
// `filteredItems` memo (rendering) and the search-change handler, which needs
// the count for the *next* query synchronously to announce it exactly once per
// keystroke rather than reacting to state in an effect.
function filterOptionsByQuery(
  items: MultiSelectorOptionData[],
  query: string,
): MultiSelectorOptionData[] {
  if (!query) {
    return items;
  }
  return items.filter(item => optionMatchesQuery(item, query));
}

/**
 * A multi-select dropdown component with checkboxes for choosing
 * multiple items from a list of options.
 *
 * @example
 * ```
 * <MultiSelector
 *   label="Columns"
 *   options={['Name', 'Email', 'Role', 'Status']}
 *   value={selectedColumns}
 *   onChange={setSelectedColumns}
 *   hasSelectAll
 * />
 * ```
 */
export function MultiSelector<T extends MultiSelectorOptionType>({
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
  hasClear = false,
  hasSelectAll = false,
  selectAllLabel: selectAllLabelFromProps,
  hasSearch = false,
  searchPlaceholder: searchPlaceholderFromProps,
  emptyText: emptyTextFromProps,
  emptySearchText: emptySearchTextFromProps,
  hasCreate = false,
  triggerDisplay = 'count',
  formatValue,
  maxBadges = 3,
  renderOption,
  indicatorPosition = 'start',
  presentation = 'popover',
  isDefaultOpen = false,
  renderTrigger,
  handleRef,
  onOpenChange,
  htmlName,
  width,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  id,
  onClick,
  onFocus,
  onKeyDown: onKeyDownProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: MultiSelectorProps<T>) {
  const inputGroup = useInputGroup();
  const inputGroupState = use(InputGroupInternalContext);
  const isDisabled = isDisabledProp || inputGroupState.isDisabled;
  const {rest, container} = useFieldInputStyling('MultiSelector', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  useDevWarning(
    'MultiSelector',
    RENDER_TRIGGER_PARTS_MESSAGE,
    renderTrigger != null &&
      (containerXstyle != null ||
        containerClassName != null ||
        containerStyle != null ||
        controlXstyle != null ||
        controlClassName != null ||
        controlStyle != null),
  );
  const t = useTranslator();
  const pressable = usePressFeedback();
  const isEffectivelyRequired = useResolvedRequired({isRequired, isOptional});
  const placeholder =
    placeholderFromProps ?? t('@astryx.multiSelector.selectPlaceholder');
  const selectAllLabel =
    selectAllLabelFromProps ?? t('@astryx.multiSelector.selectAll');
  const searchPlaceholder =
    searchPlaceholderFromProps ?? t('@astryx.multiSelector.searchPlaceholder');
  const emptyText = emptyTextFromProps ?? t('@astryx.multiSelector.empty');
  const emptySearchText =
    emptySearchTextFromProps ?? t('@astryx.multiSelector.emptySearchResults');
  const size = useSize(sizeProp, 'md');
  const effectiveStatusVariant =
    variant !== 'input' && statusVariant === 'attached'
      ? 'detached'
      : statusVariant;
  const isEffectivelyReadOnly = isReadOnly && !isDisabled;

  const generatedTriggerId = useId();
  // A caller's `id` lands on the trigger, so the label and listbox wiring
  // must use that same value.
  const triggerId = id ?? generatedTriggerId;
  const listboxId = useId();
  const descriptionId = useId();
  const statusMessageId = useId();
  const inputLabelId = useId();
  const readOnlyDescriptionId = useId();
  const searchId = useId();
  // Read by the live region above so it speaks what this element renders.
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement>(null);
  const triggerButtonRef = useMergedRefs<HTMLElement>(triggerRef, ref);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  // A typed query shows the search row's clear (✕) button, which becomes
  // the next tab stop after the search input.
  const hasQuery = searchQuery.length > 0;

  // Snapshot of which values were selected when the dropdown opened.
  // Stored as state (not a ref) so sortedItems recomputes exactly once on open,
  // then stays frozen until the menu closes.
  const [selectedAtOpen, setSelectedAtOpen] = useState<Set<string> | null>(
    null,
  );

  const [, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || optimisticValue !== value;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), triggerRef);

  // Disabled-reason tooltip. Disabled controls swallow pointer events, so the
  // tooltip listeners attach to the trigger container (which already exists)
  // and the trigger button stays perceivable via aria-disabled instead of the
  // disabled attribute. Activation is blocked by the isDisabled guards in
  // useMultiCombobox (onTriggerClick / onKeyDown).
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

  // Flatten options for keyboard navigation
  const selectableItems = useMemo(
    () => getSelectableOptions(options),
    [options],
  );

  // Grid mode (spec:AST-058 FR2, DEC-5): decided from the declared options,
  // and latched — once a grid, a grid for the life of the instance, so a
  // query that filters the actioned option out, or options that arrive after
  // a loading state, never flip the role under a screen reader.
  const hasActions = useMemo(() => hasDeclaredAction(options), [options]);
  const [isGrid, setIsGrid] = useState(hasActions);
  if (hasActions && !isGrid) {
    setIsGrid(true);
  }

  // The one half-configuration a single switch cannot rule out: creation
  // needs a query to create from. Say so rather than offer nothing in silence.
  useEffect(() => {
    if (hasCreate && !hasSearch && process.env.NODE_ENV !== 'production') {
      devWarn(
        'MultiSelector',
        '`hasCreate` needs `hasSearch`: the create row is minted from the ' +
          'typed query, so without a search input nothing is offered.',
      );
    }
  }, [hasCreate, hasSearch]);

  // Announce selection-count changes politely (comboboxes-7 announce path).
  // Toggling options / select-all previously produced no audible feedback.
  const announce = useAnnounce();

  const announceSelection = useCallback(
    (nextValue: string[]) => {
      const total = selectableItems.length;
      const selectableSet = new Set(selectableItems.map(item => item.value));
      const selectedCount = nextValue.filter(v => selectableSet.has(v)).length;
      if (selectedCount === 0) {
        announce(t('@astryx.multiSelector.selectionCleared'));
      } else if (total > 0 && selectedCount === total) {
        announce(t('@astryx.multiSelector.allSelected'));
      } else {
        announce(
          t('@astryx.multiSelector.selectionCount', {
            count: selectedCount,
            total,
          }),
        );
      }
    },
    [announce, selectableItems, t],
  );

  // Filter items by search query
  const filteredItems = useMemo(
    () => filterOptionsByQuery(selectableItems, searchQuery),
    [selectableItems, searchQuery],
  );

  // Single source of truth for item order. Both the hook (keyboard navigation)
  // and renderOptions (DOM rendering) consume this list — no independent sorting.
  // Selected-at-open items are placed first within each group/section, and the
  // same walk applies while searching so group structure survives filtering
  // (only matching items are kept; the query is empty in non-search mode).
  // The query the create row would mint, or null when there is none to offer:
  // no `hasCreate`, no search, options still loading (a label that is a moment
  // from arriving must not be offered as new), nothing typed, or an option
  // already carries that label — `Tokenizer.hasCreate`'s rule.
  const canCreate = hasCreate && hasSearch && !isLoading;
  const getCreateQuery = useCallback(
    (query: string): string | null => {
      if (!canCreate) {
        return null;
      }
      const trimmed = query.trim();
      if (trimmed === '') {
        return null;
      }
      return hasLabel(selectableItems, trimmed) ? null : trimmed;
    },
    [canCreate, selectableItems],
  );
  const createQuery = useMemo(
    () => getCreateQuery(searchQuery),
    [getCreateQuery, searchQuery],
  );

  const sortedItems = useMemo(() => {
    const selectedSet = selectedAtOpen ?? new Set<string>();
    const result: MultiSelectorOptionData[] = [];
    let pendingFlat: MultiSelectorOptionData[] = [];

    const orderSelectedFirst = (items: MultiSelectorOptionData[]) => {
      const selected = items.filter(item => selectedSet.has(item.value));
      const unselected = items.filter(item => !selectedSet.has(item.value));
      return [...selected, ...unselected];
    };

    const flushFlat = () => {
      if (pendingFlat.length === 0) {
        return;
      }
      result.push(...orderSelectedFirst(pendingFlat));
      pendingFlat = [];
    };

    for (const option of options) {
      if (isDivider(option)) {
        flushFlat();
      } else if (isSection(option)) {
        flushFlat();
        const sectionOptions = option.options
          .map(opt => normalizeOption(opt))
          .filter(opt => optionMatchesQuery(opt, searchQuery));
        result.push(...orderSelectedFirst(sectionOptions));
      } else if (isOptionData(option)) {
        const normalized = normalizeOption(option);
        if (optionMatchesQuery(normalized, searchQuery)) {
          pendingFlat.push(normalized);
        }
      }
    }
    flushFlat();

    if (hasSelectAll) {
      result.unshift({value: SELECT_ALL_VALUE, label: selectAllLabel});
    }
    if (createQuery != null) {
      // First row, before select-all: the row the typed text asked for.
      result.unshift({
        value: `${CREATE_VALUE_PREFIX}${createQuery}`,
        label: t('@astryx.multiSelector.createOption', {query: createQuery}),
      });
    }
    return result;
  }, [
    searchQuery,
    options,
    selectedAtOpen,
    hasSelectAll,
    selectAllLabel,
    createQuery,
    t,
  ]);

  // Layer for dropdown positioning
  const hasExternalTrigger = renderTrigger != null;

  // The open handlers defer their focus move by a frame, so a panel closed
  // inside that frame would otherwise be focused after it has gone — the
  // person loses focus to a surface that is no longer there. The pending
  // frame is cancelled on hide.
  const openFocusFrameRef = useRef<number | null>(null);
  const cancelOpenFocus = useCallback(() => {
    if (openFocusFrameRef.current != null) {
      cancelAnimationFrame(openFocusFrameRef.current);
      openFocusFrameRef.current = null;
    }
  }, []);

  const handleLayerHide = useCallback(() => {
    cancelOpenFocus();
    setSearchQuery('');
    setSelectedAtOpen(null);
    // Clear any lingering result count when the popover closes so stale status
    // text does not linger in the a11y tree.
    announce('');
    onOpenChange?.(false);
  }, [announce, onOpenChange, cancelOpenFocus]);

  const handleLayerShow = useCallback(() => {
    // Snapshot selection only after the surface actually opens; a same-gesture
    // rejection must not prepare state for an opening that never happened.
    setSelectedAtOpen(new Set(optimisticValue));
    if (hasSearch) {
      openFocusFrameRef.current = requestAnimationFrame(() => {
        openFocusFrameRef.current = null;
        searchRef.current?.focus();
      });
    } else if (hasExternalTrigger) {
      // The caller's anchor may not take focus (a glyph in a link row), so
      // the listbox owns the keyboard while the panel is open.
      openFocusFrameRef.current = requestAnimationFrame(() => {
        openFocusFrameRef.current = null;
        listboxRef.current?.focus();
      });
    }
    onOpenChange?.(true);
  }, [hasSearch, hasExternalTrigger, optimisticValue, onOpenChange]);

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
      surfaceTarget: 'multi-selector-popup',
    },
  });
  const {popover} = surface;
  const hideSurface = surface.hide;
  const isSurfaceOpen = surface.isOpen;

  // AR2: the caller's control must carry its own name. Checked against the
  // rendered DOM in development, never by reading the node.
  useEffect(() => {
    if (!isGrid || !isSurfaceOpen) {
      return;
    }
    const panel = listboxRef.current;
    if (panel == null) {
      return;
    }
    for (const cell of Array.from(
      panel.querySelectorAll<HTMLElement>('[data-multi-selector-action-cell]'),
    )) {
      const control = cell.querySelector<HTMLElement>(
        'button, a, input, [role="button"], [tabindex]',
      );
      if (control == null) {
        continue;
      }
      const named =
        (control.getAttribute('aria-label') ?? '').trim() !== '' ||
        control.hasAttribute('aria-labelledby') ||
        (control.textContent ?? '').trim() !== '' ||
        (control.getAttribute('title') ?? '').trim() !== '';
      if (!named) {
        warnOnce(
          'multi-selector:unnamed-action',
          'MultiSelector',
          'An option `action` renders a control with no accessible name. Give ' +
            'it a label: a screen reader reaches it through the action cell ' +
            'and has nothing to read.',
        );
        break;
      }
    }
  });
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

  const canOpen = !isDisabled && !isEffectivelyReadOnly;
  useImperativeHandle(
    handleRef,
    () => ({
      open: () => {
        if (canOpen && !surface.isOpen) {
          surface.show();
        }
      },
      close: () => surface.hide(),
      toggle: () => {
        if (surface.isOpen) {
          surface.hide();
        } else if (canOpen) {
          surface.show();
        }
      },
      isOpen: () => surface.isOpen,
    }),
    [canOpen, surface],
  );

  // Announce the filtered result count from the query-change handler (matching
  // BaseTypeahead) rather than a reactive effect: computing the count for the
  // next query here fires the announcement exactly once per keystroke and does
  // not re-speak on unrelated re-renders. Reuses the announce instance shared
  // with the selection-count announcements above.
  const handleSearchChange = useCallback(
    (nextQuery: string) => {
      setSearchQuery(nextQuery);
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
        const nextCreateQuery = getCreateQuery(nextQuery);
        if (nextCreateQuery != null) {
          // The create row is the one result on screen, so the panel is not
          // empty and the rendered-message route below stays silent; say the
          // row.
          announce(
            t('@astryx.multiSelector.createOption', {query: nextCreateQuery}),
          );
          return;
        }
        // The empty panel is announced from the rendered message below, not
        // from here. Two speakers for one transition would say it twice, and
        // this one cannot cover an empty result that arrives after the
        // keystroke — an async load landing with nothing that matches.
        return;
      }
      announce(t('@astryx.multiSelector.resultCount', {count}));
    },
    [announce, isLoading, selectableItems, getCreateQuery, t],
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
  //
  // `realItemCount` mirrors renderOptions exactly: the select-all sentinel
  // and the create row ride in `sortedItems`, in that order from the top,
  // but neither is an option anybody can match. A create row is a result of
  // its own, so a panel showing one is not empty.
  const hasCreateRow = createQuery != null;
  const leadingCount = (hasCreateRow ? 1 : 0) + (hasSelectAll ? 1 : 0);
  const realItemCount = sortedItems.length - leadingCount;
  const isPanelEmpty =
    surface.isOpen && !isLoading && realItemCount === 0 && !hasCreateRow;
  useAnnounceRenderedText(emptyStateRef, isPanelEmpty, searchQuery);

  // Handle toggle
  // Clear all selected values. Shared by the clear button and the keyboard
  // Delete/Backspace path so clearing is reachable without a mouse.
  const clearValues = useCallback(() => {
    onChange([]);
    announceSelection([]);
    if (changeAction) {
      startTransition(async () => {
        setOptimisticValue([]);
        await changeAction([]);
      });
    }
  }, [
    onChange,
    changeAction,
    startTransition,
    setOptimisticValue,
    announceSelection,
  ]);

  // Whether there is at least one selected value (clearing is meaningful).
  const hasValue = optimisticValue.length > 0;

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't open dropdown
      clearValues();
      // A keyboard activation (detail 0) leaves focus on the clear button,
      // which unmounts once the value is empty and would drop focus to <body>;
      // hand it to the trigger. A pointer press never focuses the button, so
      // there is no focus to repair, and moving it would pull focus out of an
      // open list's search input.
      if (e.detail === 0) {
        triggerRef.current?.focus();
      }
    },
    [clearValues],
  );

  const handleToggle = useCallback(
    (itemValue: string) => {
      const newValue = optimisticValue.includes(itemValue)
        ? optimisticValue.filter(v => v !== itemValue)
        : [...optimisticValue, itemValue];

      onChange(newValue);
      announceSelection(newValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [
      optimisticValue,
      onChange,
      changeAction,
      startTransition,
      setOptimisticValue,
      announceSelection,
    ],
  );

  // Select-all logic
  const enabledItems = useMemo(
    () => filteredItems.filter(item => !item.disabled),
    [filteredItems],
  );

  const allEnabledSelected = useMemo(
    () =>
      enabledItems.length > 0 &&
      enabledItems.every(item => optimisticValue.includes(item.value)),
    [enabledItems, optimisticValue],
  );

  const someSelected = useMemo(
    () => enabledItems.some(item => optimisticValue.includes(item.value)),
    [enabledItems, optimisticValue],
  );

  const selectAllState: boolean | 'indeterminate' = allEnabledSelected
    ? true
    : someSelected
      ? 'indeterminate'
      : false;

  const handleSelectAll = useCallback(() => {
    let newValue: string[];
    if (allEnabledSelected) {
      // Deselect all enabled items, keep disabled items that are selected
      const enabledValues = new Set(enabledItems.map(item => item.value));
      newValue = optimisticValue.filter(v => !enabledValues.has(v));
    } else {
      // Select all enabled items
      const currentSet = new Set(optimisticValue);
      newValue = [...optimisticValue];
      for (const item of enabledItems) {
        if (!currentSet.has(item.value)) {
          newValue.push(item.value);
        }
      }
    }

    onChange(newValue);
    announceSelection(newValue);
    if (changeAction) {
      startTransition(async () => {
        setOptimisticValue(newValue);
        await changeAction(newValue);
      });
    }
  }, [
    allEnabledSelected,
    enabledItems,
    optimisticValue,
    onChange,
    changeAction,
    startTransition,
    setOptimisticValue,
    announceSelection,
  ]);

  // Picking the create row: the typed text joins the value and the caller is
  // told it is a creation on the channel it already listens to, so adding the
  // option and accepting the value are one update. The search is cleared so
  // the option the caller adds is visible.
  const commitCreate = useCallback(
    (query: string) => {
      const newValue = optimisticValue.includes(query)
        ? optimisticValue
        : [...optimisticValue, query];
      onChange(newValue, {type: 'create', query});
      setSearchQuery('');
      announce(t('@astryx.multiSelector.optionCreated', {label: query}));
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(newValue);
          await changeAction(newValue);
        });
      }
    },
    [
      optimisticValue,
      onChange,
      changeAction,
      startTransition,
      setOptimisticValue,
      announce,
      t,
    ],
  );

  // Route toggle: select-all sentinel → handleSelectAll, the create row →
  // commitCreate, everything else → handleToggle
  const handleNavigableToggle = useCallback(
    (itemValue: string) => {
      if (itemValue === SELECT_ALL_VALUE) {
        handleSelectAll();
      } else if (isCreateValue(itemValue)) {
        commitCreate(itemValue.slice(CREATE_VALUE_PREFIX.length));
      } else {
        handleToggle(itemValue);
      }
    },
    [handleSelectAll, handleToggle, commitCreate],
  );

  // Multi-select combobox behavior — index-based, matching useCombobox pattern.
  // sortedItems is the single source of truth for item order.
  const getActionCellIdForActivate = useCallback(
    (index: number) => `${listboxId}-item-${index}-action`,
    [listboxId],
  );
  const {
    highlightedIndex,
    highlightedCell,
    getItemId,
    getActionCellId,
    activeDescendantId,
    onTriggerClick,
    onKeyDown: onComboboxKeyDown,
    onItemMouseEnter: onComboboxItemMouseEnter,
  } = useMultiCombobox({
    selectableItems: sortedItems,
    isDisabled: isDisabled || isEffectivelyReadOnly,
    isOpen: surface.isOpen,
    hasSearch,
    onOpen: useCallback(() => surface.show(), [surface]),
    onClose: surface.hide,
    onToggle: handleNavigableToggle,
    onClear: hasClear ? clearValues : undefined,
    hasValue,
    listboxId,
    isGrid,
    rowHasAction: useCallback(
      (index: number) => sortedItems[index]?.action != null,
      [sortedItems],
    ),
    onActivateAction: useCallback(
      (index: number) => {
        // Fire the caller's control as a press would: the first focusable
        // thing in the action cell. Reading the rendered DOM, not the node.
        const cell = document.getElementById(getActionCellIdForActivate(index));
        const control = cell?.querySelector<HTMLElement>(
          'button, a, input, [role="button"], [tabindex]',
        );
        control?.click();
      },
      [getActionCellIdForActivate],
    ),
  });

  // A hover moves the highlight too, but the focus ring follows the shared
  // interaction modality (architecture:interaction-modality INV1): it is read
  // whenever a key or the pointer moves the highlight, so an action cell
  // highlighted after pointer input keeps the hover treatment and no ring.
  useInteractionModalityTracking();
  const [isKeyboardHighlight, setIsKeyboardHighlight] = useState(
    () => getInteractionModality() === 'keyboard',
  );
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      onComboboxKeyDown(event);
      setIsKeyboardHighlight(getInteractionModality() === 'keyboard');
    },
    [onComboboxKeyDown],
  );
  const onItemMouseEnter = useCallback(
    (...args: Parameters<typeof onComboboxItemMouseEnter>) => {
      onComboboxItemMouseEnter(...args);
      setIsKeyboardHighlight(getInteractionModality() === 'keyboard');
    },
    [onComboboxItemMouseEnter],
  );

  // The trigger button owns its click so a consumer `onClick`, which lands on
  // the button, composes after the built-in toggle. A press elsewhere in the
  // control box (padding, start icon, chevron) still opens the panel.
  const handleTriggerButtonClick = useCallback(() => {
    onTriggerClick();
  }, [onTriggerClick]);
  const handleControlBoxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (triggerRef.current?.contains(event.target as Node)) {
        return;
      }
      // Route the press through the trigger so it behaves exactly like a
      // press on the trigger itself, caller `onClick` included.
      triggerRef.current?.click();
    },
    [],
  );

  // Highlight scrolling (and its hover/keyboard split) lives in useMultiCombobox.

  // Build trigger display content
  const selectedItems = useMemo(() => {
    return optimisticValue.map(v => {
      const item = selectableItems.find(i => i.value === v);
      return {value: v, label: item?.label ?? v};
    });
  }, [optimisticValue, selectableItems]);

  const selectedLabels = useMemo(
    () => selectedItems.map(item => item.label),
    [selectedItems],
  );

  const renderTriggerContent = useCallback(() => {
    if (optimisticValue.length === 0) {
      return <span {...stylex.props(styles.triggerText)}>{placeholder}</span>;
    }

    switch (triggerDisplay) {
      case 'count':
        return (
          <span {...stylex.props(styles.triggerText)}>
            {formatValue?.(selectedItems) ??
              `${optimisticValue.length} selected`}
          </span>
        );

      case 'labels': {
        const displayed = selectedLabels.slice(0, 3);
        const remaining = selectedLabels.length - displayed.length;
        const text =
          remaining > 0
            ? `${displayed.join(', ')}, +${remaining}`
            : displayed.join(', ');
        return (
          <span {...stylex.props(styles.triggerText)}>
            {formatValue?.(selectedItems) ?? text}
          </span>
        );
      }

      case 'badges': {
        const displayed = selectedLabels.slice(0, maxBadges);
        const remaining = selectedLabels.length - displayed.length;
        return (
          <span {...stylex.props(styles.triggerBadges)}>
            {displayed.map(label => (
              <Badge key={label} label={label} variant="neutral" />
            ))}
            {remaining > 0 && (
              <span {...stylex.props(styles.triggerOverflow)}>
                +{remaining}
              </span>
            )}
          </span>
        );
      }
    }
  }, [
    optimisticValue,
    triggerDisplay,
    selectedItems,
    selectedLabels,
    placeholder,
    formatValue,
    maxBadges,
  ]);

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
        label={t('@astryx.multiSelector.searchOptions')}
        // Same accessible name the TextInput's built-in clear produced
        // ("Clear Search options"), so the affordance keeps its name while its
        // chrome changes.
        clearLabel={t('@astryx.textInput.clearLabel', {
          label: t('@astryx.multiSelector.searchOptions'),
        })}
        {...themeProps('multi-selector-search')}
        // When hasSearch is set, focus moves into this input on open, so it —
        // not the trigger — must be the combobox reporting the highlighted
        // option via aria-activedescendant (comboboxes-4).
        role="combobox"
        aria-expanded={surface.isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendantId}
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
          // syllable with Enter would instead toggle the highlighted option.
          // See utils/ime.ts.
          if (isImeKeyEvent(e.nativeEvent)) {
            return;
          }
          if (
            e.key === 'Enter' &&
            highlightedIndex < 0 &&
            createQuery != null
          ) {
            // Nothing highlighted and the typed text matches no option:
            // Enter mints it, as it does in Tokenizer.
            e.preventDefault();
            commitCreate(createQuery);
            return;
          }
          // Arrow keys navigate options; Enter toggles; Escape closes.
          // Space and Home/End are left to the input (type a space / move
          // the caret) per the APG editable combobox; PageUp/PageDown are
          // the sanctioned substitute for jumping to the first/last option.
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
          // In a grid with a row highlighted, Left/Right move between the
          // row's cells (APG combobox with grid popup); with no row
          // highlighted they keep moving the caret.
          if (
            isGrid &&
            highlightedIndex >= 0 &&
            (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
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
    highlightedIndex,
    activeDescendantId,
    isGrid,
    createQuery,
    commitCreate,
    t,
  ]);

  // Render an individual item (index-based)
  const renderItem = useCallback(
    (item: MultiSelectorOptionData, flatIndex: number) => {
      const isHighlighted = flatIndex === highlightedIndex;
      const isSelectAll = item.value === SELECT_ALL_VALUE;
      // The create row is a plain labelled option: no checkbox, never
      // selected, and the caller's `renderOption` does not see it.
      const isCreate = isCreateValue(item.value);
      const isSelected = isSelectAll
        ? allEnabledSelected
        : !isCreate && optimisticValue.includes(item.value);
      const checkboxValue = isSelectAll ? selectAllState : isSelected;
      // aria-selected="mixed" is invalid on role="option", and the tri-state
      // checkbox is inert/decorative, so the indeterminate state must be
      // conveyed through the option's accessible name (WCAG 4.1.2).
      const isPartiallySelected =
        isSelectAll && selectAllState === 'indeterminate';

      const checkbox = isCreate ? null : (
        <div
          inert
          {...stylex.props(
            styles.checkboxDecorative,
            indicatorPosition === 'end' && styles.checkboxDecorativeEnd,
          )}>
          <CheckboxInput
            label=""
            isLabelHidden
            value={checkboxValue}
            onChange={() => {}}
            isDisabled={item.disabled}
            size={size === 'lg' ? 'md' : size}
          />
        </div>
      );

      const content = (
        <>
          {indicatorPosition === 'start' && checkbox}
          {renderOption && !isSelectAll && !isCreate ? (
            renderOption(item)
          ) : (
            <span {...stylex.props(styles.itemLabel)}>
              {item.label ?? item.value}
            </span>
          )}
          {indicatorPosition === 'end' && checkbox}
        </>
      );
      const toggle = () => {
        if (!item.disabled) {
          handleNavigableToggle(item.value);
        }
      };

      return (
        <div
          key={item.value}
          id={getItemId(flatIndex)}
          role={isGrid ? 'row' : 'option'}
          aria-selected={isSelected}
          aria-label={
            isPartiallySelected
              ? t('@astryx.multiSelector.selectAllPartiallySelected', {
                  label: selectAllLabel,
                })
              : undefined
          }
          // In a grid the row is named by its option cell alone, so the
          // caller's control is never folded into the row's name
          // (spec:AST-058 AR2).
          aria-labelledby={
            isGrid && !isPartiallySelected
              ? `${getItemId(flatIndex)}-option`
              : undefined
          }
          aria-disabled={item.disabled}
          // In a grid the option cell is the click target, so a press on the
          // action cell never toggles (spec:AST-058 FR4).
          onClick={isGrid ? undefined : toggle}
          onMouseEnter={
            isGrid ? undefined : () => onItemMouseEnter(item, flatIndex)
          }
          {...mergeProps(
            // One target for every dropdown row, carrying the row's size and
            // runtime state so a theme can express "selected option at large"
            // or restyle just the Select All row (`.select-all`) without
            // reaching for structural selectors.
            themeProps('multi-selector-option', {
              size,
              'select-all': isSelectAll ? 'select-all' : null,
              selected: isSelected ? 'selected' : null,
              disabled: item.disabled ? 'disabled' : null,
            }),
            stylex.props(
              styles.item,
              isSelectAll ? selectAllSizeStyles[size] : itemSizeStyles[size],
              isSelectAll && styles.selectAllWrapper,
              isHighlighted && styles.itemHighlighted,
              item.disabled && styles.itemDisabled,
              isGrid && styles.gridRow,
            ),
          )}>
          {isGrid ? (
            <>
              <div
                role="gridcell"
                id={`${getItemId(flatIndex)}-option`}
                onClick={toggle}
                onMouseEnter={() => onItemMouseEnter(item, flatIndex, 'option')}
                {...stylex.props(styles.optionCell)}>
                {content}
              </div>
              <div
                role="gridcell"
                id={getActionCellId(flatIndex)}
                data-multi-selector-action-cell=""
                onMouseEnter={
                  item.action != null
                    ? () => onItemMouseEnter(item, flatIndex, 'action')
                    : undefined
                }
                {...stylex.props(
                  styles.actionCell,
                  isHighlighted &&
                    highlightedCell === 'action' &&
                    isKeyboardHighlight &&
                    styles.actionCellActive,
                )}>
                {isSelectAll || isCreate ? null : item.action}
              </div>
            </>
          ) : (
            content
          )}
        </div>
      );
    },
    [
      isGrid,
      highlightedCell,
      isKeyboardHighlight,
      getActionCellId,
      renderOption,
      indicatorPosition,
      highlightedIndex,
      optimisticValue,
      allEnabledSelected,
      selectAllState,
      selectAllLabel,
      getItemId,
      handleNavigableToggle,
      onItemMouseEnter,
      size,
      t,
    ],
  );

  // Render all options. Uses sortedItems as the single source of truth for
  // item order — no independent sorting here. Structural elements (dividers,
  // section headers) come from the original options prop.
  const renderOptions = useCallback(() => {
    const elements: ReactNode[] = [];
    let cursor = 0;

    // The create row is the first row: the row the typed text asked for.
    if (hasCreateRow) {
      elements.push(renderItem(sortedItems[cursor], cursor));
      cursor++;
    }

    // Show select-all only when there are real items to select. It reads as
    // the first row of the list, not a section of its own — no divider under
    // it (the checkbox column already lines it up with the options below).
    if (hasSelectAll) {
      if (realItemCount > 0) {
        elements.push(renderItem(sortedItems[cursor], cursor));
      }
      // Skip the select-all sentinel when there are no real items
      cursor++;
    }

    // Empty state — no real items to show. role="presentation" keeps the
    // message out of the listbox's accessibility tree (role="listbox" only
    // permits option/group children); the no-results outcome is announced
    // via the result-count live region instead.
    // While isLoading the options have not arrived yet, so asserting either
    // message would be a claim the component cannot make; the trigger's
    // spinner covers it.
    // A create row is a result of its own, so the empty state stays out.
    if (realItemCount === 0 && !isLoading && !hasCreateRow) {
      elements.push(
        <div
          key="empty"
          ref={emptyStateRef}
          role="presentation"
          {...mergeProps(
            themeProps('multi-selector-empty-state'),
            stylex.props(styles.emptyState),
          )}>
          {searchQuery ? emptySearchText : emptyText}
        </div>,
      );
      return elements;
    }

    // Consume items from sortedItems in order, interleaving structural elements
    // (dividers, section headers) from the options prop. While searching, only
    // matching items are present in sortedItems, so a section consumes just its
    // matches and is skipped entirely when none match — no header left standing
    // over nothing, and the cursor stays aligned with the combobox indices.
    const isSearching = Boolean(searchQuery);
    let pendingCount = 0;

    const flushPending = () => {
      for (let j = 0; j < pendingCount; j++) {
        elements.push(renderItem(sortedItems[cursor], cursor));
        cursor++;
      }
      pendingCount = 0;
    };

    for (let i = 0; i < options.length; i++) {
      const option = options[i];

      if (isDivider(option)) {
        flushPending();
        // A standalone divider between groups would orphan itself once its
        // neighbors are filtered out, so skip it while searching.
        if (!isSearching) {
          // role="listbox" only permits option/group children; the divider
          // carries no information the options don't, so it's hidden from
          // the accessibility tree entirely rather than exposing
          // role="separator" as a disallowed listbox child (axe
          // aria-required-children).
          elements.push(
            <Divider
              key={`divider-${i}`}
              aria-hidden="true"
              xstyle={styles.divider}
            />,
          );
        }
      } else if (isSection(option)) {
        flushPending();
        const matchCount = isSearching
          ? option.options.filter(opt =>
              optionMatchesQuery(normalizeOption(opt), searchQuery),
            ).length
          : option.options.length;
        if (matchCount === 0) {
          continue;
        }
        const sectionItems: ReactNode[] = [];
        for (let j = 0; j < matchCount; j++) {
          sectionItems.push(renderItem(sortedItems[cursor], cursor));
          cursor++;
        }
        // The heading lives INSIDE the group and is aria-hidden: the group
        // already carries the title as its accessible name, so exposing the
        // text again would announce it twice. This also keeps role="listbox"'s
        // children to option/group only — the old labeled Divider sat in the
        // listbox as a stray role="separator".
        elements.push(
          <div
            key={`section-${i}`}
            role={isGrid ? 'rowgroup' : 'group'}
            aria-label={option.title}>
            {option.title && (
              <div
                aria-hidden="true"
                {...mergeProps(
                  themeProps('multi-selector-section-heading'),
                  stylex.props(styles.sectionHeading),
                )}>
                {option.title}
              </div>
            )}
            {sectionItems}
          </div>,
        );
      } else if (isOptionData(option)) {
        if (
          !isSearching ||
          optionMatchesQuery(normalizeOption(option), searchQuery)
        ) {
          pendingCount++;
        }
      }
    }
    flushPending();

    return elements;
  }, [
    options,
    renderItem,
    sortedItems,
    realItemCount,
    searchQuery,
    hasSelectAll,
    isLoading,
    emptyText,
    emptySearchText,
    isGrid,
    hasCreateRow,
  ]);

  // The detached message box renders its own leading status icon, so the
  // on-field icon would duplicate it — keep the chevron indicator instead.
  const showStatusIcon =
    status != null && effectiveStatusVariant !== 'detached';
  const showStatusTooltip =
    status != null && effectiveStatusVariant === 'tooltip' && !!status.message;

  // With the caller's own trigger, `label` names the listbox directly: the
  // anchor may carry no text of its own (a glyph in a link row).
  const listboxLabelProps = hasExternalTrigger
    ? {'aria-label': label}
    : {'aria-labelledby': triggerId};
  // In a bottom sheet, or hung off a caller's anchor that may not take focus,
  // the listbox itself owns the keyboard.
  const listboxOwnsKeyboard =
    surface.activePresentation === 'bottom-sheet' || hasExternalTrigger;

  const panelContent = hasSearch ? (
    <div>
      {renderSearch()}
      <Divider />
      <div {...stylex.props(styles.dropdown)}>
        <div
          ref={listboxRef}
          id={listboxId}
          role={isGrid ? 'grid' : 'listbox'}
          aria-multiselectable="true"
          {...listboxLabelProps}
          {...stylex.props(styles.listbox)}>
          {renderOptions()}
        </div>
      </div>
    </div>
  ) : (
    <div {...stylex.props(styles.dropdown)}>
      <div
        ref={listboxRef}
        id={listboxId}
        role={isGrid ? 'grid' : 'listbox'}
        aria-multiselectable="true"
        // The bottom sheet is rendered in a modal layer, so Chromium cannot
        // reliably compute this listbox's name from the trigger outside that
        // layer. Name only this no-search sheet directly from the component's
        // existing label; searchable sheets and popovers retain their current
        // trigger relationship.
        {...(surface.activePresentation === 'bottom-sheet'
          ? {'aria-label': label}
          : listboxLabelProps)}
        aria-activedescendant={activeDescendantId}
        tabIndex={listboxOwnsKeyboard ? 0 : undefined}
        onKeyDown={listboxOwnsKeyboard ? onKeyDown : undefined}
        {...stylex.props(styles.listbox)}>
        {renderOptions()}
      </div>
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
      placement: 'below',
      alignment: 'start',
      offset: spacingVars['--spacing-1'],
      xstyle: styles.popover,
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
    id: triggerId,
    // A caller's description is kept alongside the field's own.
    'aria-describedby':
      [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
      undefined,
    'aria-labelledby': ariaLabelledBy,
    'aria-required': isEffectivelyRequired ? 'true' : undefined,
    'aria-invalid': status?.type === 'error' ? 'true' : undefined,
    'aria-busy': isBusy || undefined,
    // Newly forwarded handlers compose component first: the built-in toggle
    // and keyboard model always run. `onFocus` keeps its existing caller-first
    // order.
    onKeyDown: isDisabled
      ? onKeyDown
      : composeEventHandlers(onKeyDown, onKeyDownProp),
    onFocus: event => {
      onFocus?.(event);
      surface.onTriggerFocus(event);
    },
    onClick: isDisabled
      ? event => {
          event.preventDefault();
          event.stopPropagation();
        }
      : composeEventHandlers(handleTriggerButtonClick, onClick),
    tabIndex: 0,
    ...stylex.props(
      styles.trigger,
      isEffectivelyReadOnly && styles.triggerReadOnly,
    ),
  };

  if (renderTrigger != null) {
    // Anchor-only mode: the caller renders the opener and spreads these props
    // on it. No Field, no status, no clear button — the caller owns the
    // control; the selector owns the panel, its anchor, and focus return.
    const triggerProps: MultiSelectorRenderTriggerProps = {
      // Base props reach the caller's control, the primary semantic control
      // in this mode; the selector's own wiring below wins over them.
      ...rest,
      'aria-describedby': ariaDescribedByProp,
      ref: mergeRefs<HTMLElement>(el => {
        popover.triggerRef(el);
        triggerRef.current = el;
        // A control that takes no focus has nowhere for focus to return to
        // when the panel closes, and focus would land on the body — the
        // person loses their place in the page. Making it programmatically
        // focusable repairs the return without putting it in the tab order,
        // which is the caller's decision to make. It does not make the
        // control openable from the keyboard: only a real control does
        // that, which is what the warning below is for.
        if (el != null && !el.matches(FOCUSABLE_SELECTOR)) {
          el.tabIndex = -1;
        }
      }, ref),
      id: triggerId,
      onClick: isEffectivelyReadOnly
        ? onClick
        : composeEventHandlers(onTriggerClick, onClick),
      onKeyDown: isEffectivelyReadOnly
        ? onKeyDownProp
        : composeEventHandlers(onKeyDown, onKeyDownProp),
      onFocus: event => {
        onFocus?.(event);
        surface.onTriggerFocus(event);
      },
      // A read-only selector has no selection surface to open, so it must
      // not advertise one: `spec:AST-011` FR4. Telling a screen-reader user
      // "collapsed, has popup" on a control that cannot open leaves them
      // pressing Enter with nothing happening and no way to tell the value
      // is read-only rather than the control broken. The field path below
      // already respects this; the anchor-only path must not regress it.
      'aria-haspopup': isEffectivelyReadOnly
        ? undefined
        : surface.activePresentation === 'bottom-sheet'
          ? 'dialog'
          : isGrid
            ? 'grid'
            : 'listbox',
      'aria-expanded': isEffectivelyReadOnly ? false : surface.isOpen,
      'aria-controls': isEffectivelyReadOnly ? undefined : listboxId,
      'aria-busy': isBusy || undefined,
      // Withholding the disclosure attributes stops the control lying about
      // a panel, but leaves it silent about WHY it does not open. The field
      // path says so through its own chrome; the caller's control has none,
      // so the state is handed over for it to present.
      'aria-readonly': isEffectivelyReadOnly || undefined,
    };
    return (
      <>
        {renderTrigger(triggerProps)}
        {htmlName != null &&
          !isDisabled &&
          value.map(v => (
            <input key={v} type="hidden" name={htmlName} value={v} />
          ))}
        {selectionSurface}
      </>
    );
  }

  const multiSelectorContent = (
    <>
      <div
        ref={el => {
          popover.triggerRef(el);
          // Anchor + hover/focus listeners for the disabled-message tooltip.
          // Handlers are gated internally by isEnabled, and anchor names
          // compose, so attaching unconditionally is safe.
          disabledMessageTooltip.ref(el);
        }}
        onClick={handleControlBoxClick}
        {...pressable}
        {...(inputGroup ? inputGroupItemProps : undefined)}
        {...mergeProps(
          themeProps('multi-selector', {
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
            variant === 'secondary' && styles.triggerSecondary,
            variant === 'ghost' && styles.triggerGhost,
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
            optimisticValue.length === 0 && styles.triggerPlaceholder,
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
                : isGrid
                  ? 'grid'
                  : 'listbox'
          }
          aria-expanded={isEffectivelyReadOnly ? false : surface.isOpen}
          aria-controls={isEffectivelyReadOnly ? undefined : listboxId}
          aria-readonly={isEffectivelyReadOnly || undefined}
          aria-activedescendant={
            !isEffectivelyReadOnly && !hasSearch
              ? activeDescendantId
              : undefined
          }
          // A disabled trigger keeps its tab stop and says so through
          // aria-disabled (`spec:AST-085` FR1); the isDisabled guards in
          // useMultiCombobox block every way of opening it.
          aria-disabled={isDisabled ? 'true' : undefined}>
          <span {...stylex.props(styles.triggerContent)}>
            {renderTriggerContent()}
          </span>
        </button>
        {/* A disabled selector submits no value (`spec:AST-085` FR3). */}
        {htmlName != null &&
          !isDisabled &&
          value.map(v => (
            <input key={v} type="hidden" name={htmlName} value={v} />
          ))}
        {isBusy && <Spinner size="sm" aria-hidden="true" />}
        {hasClear &&
          value.length > 0 &&
          !isDisabled &&
          !isEffectivelyReadOnly && (
            <InternalInputClearButton
              {...keepOpenProps}
              label={t('@astryx.multiSelector.clearAll', {label})}
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
            {...themeProps('multi-selector-indicator-icon', {
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
    return multiSelectorContent;
  }

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={triggerId}
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
      {multiSelectorContent}
    </Field>
  );
}

MultiSelector.displayName = 'MultiSelector';
