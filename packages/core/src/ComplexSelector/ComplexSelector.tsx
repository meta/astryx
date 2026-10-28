// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ComplexSelector.tsx
 * @input Uses React, StyleX, Field, Icon slots, Layer positioning, and usePopover
 * @output Exports a rich-selector shell with exact token-sized input, secondary, and ghost triggers, plus an imperative open/close handle
 * @position Core implementation; consumed by index.ts
 *
 * SYNC: When modified, update:
 * - /packages/core/src/ComplexSelector/ComplexSelector.doc.mjs
 * - /packages/core/src/ComplexSelector/ComplexSelector.test.tsx
 * - /packages/core/src/ComplexSelector/index.ts
 * - /apps/storybook/stories/ComplexSelector.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/ComplexSelector/ (showcase blocks)
 */

import React, {
  useCallback,
  useId,
  useImperativeHandle,
  useInsertionEffect,
  useOptimistic,
  useRef,
  useTransition,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {
  useFieldInputStyling,
  type FieldInputBaseProps,
  type FieldPartStyleProps,
} from '../Field/fieldParts';
import {useDevWarning} from '../hooks/useDevWarning';
import {mergeRefs} from '../utils/mergeRefs';
import {useMergedRefs} from '../hooks/useMergedRefs';
import {useBusyAnnouncement} from '../hooks/useBusyAnnouncement';
import {Field, inputWrapperStyles, type FieldStatusVariant} from '../Field';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {Spinner} from '../Spinner';
import {useTranslator} from '../i18n';
import {layerAnimations} from '../Layer/layerAnimations.stylex';
import type {LayerAlignment, LayerPlacement} from '../Layer/useLayer';
import {usePopover} from '../Popover/usePopover';
import {useResolvedRequired} from '../hooks/useResolvedRequired';
import {
  colorVars,
  durationVars,
  easeVars,
  fontWeightVars,
  radiusVars,
  sizeVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {isRenderable, mergeProps} from '../utils';
import {composeEventHandlers} from '../utils/composeEventHandlers';
import {focusOutlineStyles} from '../utils/focusOutline.stylex';
import {interactionOverlayStyles} from '../utils/interactionOverlay.stylex';
import {usePressFeedback} from '../hooks/usePressFeedback';
import type {SizeValue} from '../utils/types';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
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
    lineHeight: typeScaleVars['--text-label-leading'],
    color: colorVars['--color-text-primary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
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
    outline: 'none',
    borderRadius: radiusVars['--radius-element'],
  },
  triggerText: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'start',
  },
  placeholder: {
    color: colorVars['--color-text-secondary'],
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
  triggerGhostDisabled: {
    backgroundImage: 'none',
    transform: {
      default: 'none',
      ':active': 'none',
      '[data-astryx-press="on"]': 'none',
    },
  },
  // Only what Icon does not already provide: `sm` gives the 16px box and
  // `color="secondary"` the color, but the glyph still must not shrink inside
  // the flex trigger.
  triggerIcon: {
    flexShrink: 0,
  },
  // Rotation lives on the chevron glyph itself (passed through `xstyle`), not
  // on the layout wrapper above, so the icon's
  // `complex-selector-indicator-icon` theme target and the open/closed
  // transform sit on one element — a theme can restyle the mark and its
  // rotation through a single selector. The wrapper keeps only layout.
  triggerIconRotation: {
    transitionProperty: 'transform',
    transitionDuration: durationVars['--duration-fast'],
    transitionTimingFunction: easeVars['--ease-standard'],
    transformOrigin: 'center',
  },
  triggerIconOpen: {
    transform: 'rotate(180deg)',
  },
  popover: {
    minWidth: 'anchor-size(width)',
  },
  content: {
    boxSizing: 'border-box',
    maxHeight: 'min(480px, calc(100vh - 32px))',
    overflow: 'auto',
    padding: spacingVars['--spacing-3'],
  },
  sm: {
    height: sizeVars['--size-element-sm'],
  },
  md: {
    height: sizeVars['--size-element-md'],
  },
  lg: {
    height: sizeVars['--size-element-lg'],
  },
  disabled: {
    cursor: 'default',
  },
});

export type ComplexSelectorVariant = 'input' | 'secondary' | 'ghost';

export type ComplexSelectorSize = 'sm' | 'md' | 'lg';

const RENDER_TRIGGER_PARTS_MESSAGE =
  '`container*` and `control*` styling props have no effect with `renderTrigger`: ' +
  'no Field box or control box renders. Style the control you render instead.';

/**
 * Props the `renderTrigger` render prop hands to the control the caller
 * renders.
 * Spread them onto that control: it becomes the popup's anchor, the element
 * focus returns to, and the control that announces the popup's state.
 */
export interface ComplexSelectorRenderTriggerProps extends Omit<
  FieldInputBaseProps,
  | keyof FieldPartStyleProps
  | 'id'
  | 'onClick'
  | 'onKeyDown'
  | 'role'
  | 'aria-label'
  | 'aria-haspopup'
  | 'aria-expanded'
  | 'aria-controls'
  | 'aria-busy'
  | 'aria-required'
  | 'aria-disabled'
> {
  /**
   * Attaches the control as the popup's anchor and focus-return target, and
   * forwards it to the selector's own `ref`.
   */
  ref: (element: HTMLElement | null) => void;
  /** The id the field would have given its own button. */
  id: string;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** ArrowDown opens the popup, as it does on the built-in button. */
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  'aria-haspopup': 'dialog';
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-busy': boolean | undefined;
  /**
   * The control is the selector's field: a combobox whose popup is a dialog,
   * as on the built-in trigger.
   */
  role: 'combobox';
  /**
   * The field's `label`, unless the selector was given `aria-label` or
   * `aria-labelledby`: a combobox takes no name from its content, so the
   * label names the control as it names the built-in trigger.
   */
  'aria-label': string | undefined;
  /** `'true'` when the field is required. */
  'aria-required': 'true' | undefined;
  /**
   * `'true'` when the selector is disabled. The control keeps its tab stop
   * and the popup does not open (`spec:AST-085`).
   */
  'aria-disabled': 'true' | undefined;
}

export interface ComplexSelectorRenderState {
  /** Whether the selector surface is open. */
  isOpen: boolean;
  /** Whether changeAction/isLoading is pending. */
  isBusy: boolean;
  /** ID of the trigger button. */
  triggerId: string;
  /** ID of the popup content container. */
  contentId: string;
}

/**
 * Imperative control surface for ComplexSelector, accessed via the `handleRef`
 * prop. Methods drive the same popover machinery as the built-in trigger, so
 * they respect focus restoration, light dismiss, and Escape. Prefer these
 * callbacks over mirroring open state in the parent — the selector owns its
 * visibility, and imperative calls avoid the focus-management pitfalls of
 * syncing an external `isOpen` prop. Pair with `onOpenChange` to observe every
 * open and close, including the ones the selector performs itself.
 */
export interface ComplexSelectorHandle {
  /** Open the selector surface. No-op when disabled or already open. */
  open(): void;
  /** Close the selector surface. Restores focus to the trigger. */
  close(): void;
  /** Toggle the selector surface open or closed. */
  toggle(): void;
  /** Whether the selector surface is currently open. Reads live state. */
  isOpen(): boolean;
}

export interface ComplexSelectorStatus {
  type: 'warning' | 'error' | 'success';
  message?: string;
}

export interface ComplexSelectorProps<Value> extends Omit<
  FieldInputBaseProps,
  'children' | 'onChange'
> {
  /** Label text for accessibility and the field label. */
  label: string;
  /**
   * Ref to the trigger: the button that opens the popup and carries the
   * accessible name — or, with `renderTrigger`, the caller's control.
   */
  ref?: React.Ref<HTMLElement>;
  /**
   * Click handler on the trigger. It runs before the popup opens; call
   * `preventDefault()` to keep the popup closed. A press elsewhere in the
   * control box goes through the trigger, so it reaches this handler too.
   * With `renderTrigger` it lands on the caller's control and runs after the
   * built-in toggle, which it cannot cancel.
   */
  onClick?: React.MouseEventHandler<HTMLElement>;
  /**
   * Key handler on the trigger. It runs after the built-in handling and
   * receives every key, including the ArrowDown that opens the popup. With
   * `renderTrigger` it lands on the caller's control, runs after the built-in
   * handling, and is skipped for keys that handling cancels.
   */
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  /** Current controlled value. */
  value: Value;
  /** Called when custom content commits a new value. */
  onChange?: (value: Value) => void;
  /** Optional async action after onChange; drives optimistic UI. */
  changeAction?: (value: Value) => void | Promise<void>;
  /** Custom selector surface content rendered inside a dialog popover. */
  children: (
    value: Value,
    onChange: (value: Value) => void,
    close: () => void,
    state: ComplexSelectorRenderState,
  ) => ReactNode;
  /** Label/content shown in the closed trigger. */
  triggerLabel?: ReactNode;
  /** Placeholder shown when triggerLabel is omitted. */
  placeholder?: ReactNode;
  /** Whether to visually hide the field label. */
  isLabelHidden?: boolean;
  /** Helper text displayed below the label. */
  description?: string;
  /** Marks the field optional. */
  isOptional?: boolean;
  /** Marks the field required. */
  isRequired?: boolean;
  /** Blocks opening and value commits, including from an already-open popup. */
  isDisabled?: boolean;
  /** Shows loading state on the trigger. */
  isLoading?: boolean;
  /** Validation status. */
  status?: ComplexSelectorStatus;
  /**
   * How the status message is placed relative to the input.
   * - 'attached': message overlaps directly below the input (bordered treatment; detached when variant is secondary or ghost)
   * - 'detached': message floats below as a separate element with spacing
   * - 'tooltip': no message box; the status icon becomes a focusable info-tip button that reveals the message on hover, keyboard focus, or tap
   * @default 'attached' for input selectors; 'detached' for secondary and ghost selectors
   */
  statusVariant?: FieldStatusVariant;
  /** Tooltip text displayed next to the label. */
  labelTooltip?: string;
  /** Trigger and field size. */
  size?: ComplexSelectorSize;
  /**
   * Visual trigger style. Secondary matches secondary buttons; ghost matches
   * ghost buttons.
   */
  variant?: ComplexSelectorVariant;
  /** Icon displayed at the start of the trigger. */
  startIcon?: ReactNode | IconType;
  /** Width of the field. */
  width?: SizeValue;
  /** Popup placement. */
  placement?: LayerPlacement;
  /** Popup alignment along the placement axis. */
  alignment?: LayerAlignment;
  /**
   * Imperative handle for programmatic open/close control. Exposes open,
   * close, toggle, and the isOpen query. Use this instead of mirroring open
   * state in the parent — the selector owns its visibility.
   */
  handleRef?: React.Ref<ComplexSelectorHandle>;
  /**
   * Render the control the popup hangs off — a glyph in a list row, a chip,
   * an icon button — instead of the selector's own field and button. Spread
   * the given props onto it; the popup is then anchored to that control and
   * still labelled by `label`. The field chrome (`Field`, status, spinner,
   * chevron) is not rendered; the caller owns the opener. Pair with
   * `handleRef` to open the popup from a keystroke elsewhere.
   *
   * Hover and pressed paint stay yours. The open state reaches your control
   * as `aria-expanded` on the given props, so style it from the rendered
   * attribute. A pressed look keyed to `:active` is not a substitute:
   * `:active` does not behave the same under a coarse pointer, which is why
   * menu rows drop coarse-pointer `:active` paint entirely.
   *
   * @example
   * ```
   * <ComplexSelector
   *   label="Assignee"
   *   renderTrigger={props => <IconButton icon="user" label="Assign" {...props} />}
   * />
   * ```
   *
   * @example
   * ```
   * // Styling the open state from the rendered attribute:
   * // .my-trigger[aria-expanded='true'] { background: var(--color-overlay-pressed); }
   * ```
   */
  renderTrigger?: (props: ComplexSelectorRenderTriggerProps) => ReactNode;
  /**
   * Called whenever the selector surface opens or closes, however it happened
   * — the trigger, the keyboard, a light dismiss, Escape, content that calls
   * `close()`, or the imperative handle. Pair it with `handleRef` to drive the
   * surface from outside without mirroring its state.
   */
  onOpenChange?: (isOpen: boolean) => void;
  /** StyleX styles for the popup content container. */
  contentXstyle?: StyleXStyles;
  /** Test ID for the trigger button. */
  'data-testid'?: string;
}

/**
 * A selector shell for rich, custom selection surfaces.
 *
 * ComplexSelector owns the field, trigger, popover, focus restore, and async
 * change action flow. Consumers provide the dialog content as a render function,
 * using the supplied `value`, `onChange`, and `close` helpers to compose the
 * right accessible structure for the custom selector.
 *
 * @example
 * ```
 * <ComplexSelector
 *   label="Fruit"
 *   value={value}
 *   onChange={setValue}
 *   triggerLabel={`${value.fruit} ${value.ripeness}`}>
 *   {(value, onChange, close) => (
 *     <FruitGrid
 *       value={value}
 *       onChange={nextValue => {
 *         onChange(nextValue);
 *         close();
 *       }}
 *     />
 *   )}
 * </ComplexSelector>
 * ```
 */
export function ComplexSelector<Value>({
  label,
  value,
  onChange,
  changeAction,
  children,
  triggerLabel,
  placeholder: placeholderFromProps,
  isLabelHidden = false,
  description,
  isOptional = false,
  isRequired = false,
  isDisabled = false,
  isLoading = false,
  status,
  statusVariant = 'attached',
  labelTooltip,
  size = 'md',
  variant = 'input',
  startIcon,
  width,
  placement = 'below',
  alignment = 'start',
  handleRef,
  renderTrigger,
  onOpenChange,
  contentXstyle,
  containerXstyle,
  containerClassName,
  containerStyle,
  controlXstyle,
  controlClassName,
  controlStyle,
  ref,
  id,
  onClick: onClickProp,
  onKeyDown: onKeyDownProp,
  'aria-describedby': ariaDescribedByProp,
  ...restProps
}: ComplexSelectorProps<Value>) {
  const {rest, container} = useFieldInputStyling('ComplexSelector', restProps, {
    containerXstyle,
    containerClassName,
    containerStyle,
  });
  useDevWarning(
    'ComplexSelector',
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
  const placeholder = placeholderFromProps ?? t('@astryx.selector.placeholder');
  const effectiveStatusVariant =
    variant !== 'input' && statusVariant === 'attached'
      ? 'detached'
      : statusVariant;

  const generatedTriggerId = useId();
  // A caller's `id` lands on the trigger, so the label wiring must use it.
  const triggerId = id ?? generatedTriggerId;
  const labelId = useId();
  const contentId = useId();
  const descriptionId = useId();
  const statusMessageId = useId();
  const ariaDescribedBy =
    [
      description ? descriptionId : null,
      status?.message ? statusMessageId : null,
    ]
      .filter((id): id is string => id != null)
      .join(' ') || undefined;

  const triggerRef = useRef<HTMLElement>(null);
  const triggerButtonRef = useMergedRefs<HTMLElement>(triggerRef, ref);

  const [isPending, startTransition] = useTransition();
  const [optimisticValue, setOptimisticValue] = useOptimistic(value);
  const isBusy = isLoading || isPending;
  // The busy Spinner is decorative; this control announces its busy start
  // (spec:AST-086 FR8).
  useBusyAnnouncement(isBusy, t('@astryx.spinner.loading'), triggerRef);

  const handlePopoverShow = useCallback(() => {
    onOpenChange?.(true);
  }, [onOpenChange]);

  const handlePopoverHide = useCallback(() => {
    // Focus is restored first so a consumer that moves focus elsewhere from
    // the callback wins, instead of being overwritten a line later.
    triggerRef.current?.focus();
    onOpenChange?.(false);
  }, [onOpenChange]);

  const popover = usePopover({
    dialogLabel: label,
    hasCloseButton: false,
    hasAutoFocus: true,
    surfaceTarget: 'complex-selector-popup',
    onShow: handlePopoverShow,
    onHide: handlePopoverHide,
  });

  const isOpen = popover.isOpen;

  const handleTriggerClick = useCallback(() => {
    if (isDisabled) {
      return;
    }
    if (popover.isOpen) {
      popover.hide();
    } else {
      popover.show();
    }
  }, [isDisabled, popover]);

  const close = useCallback(() => {
    popover.hide();
  }, [popover]);

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowDown' && !isOpen && !isDisabled) {
        event.preventDefault();
        popover.show();
      }
    },
    [isDisabled, isOpen, popover],
  );

  // A caller `onClick` runs first and can cancel opening with
  // `preventDefault()`, as it always could. It now lands on the trigger, so
  // the trigger composes it; a press elsewhere in the control box (padding,
  // start icon, chevron) opens the popup directly.
  const handleTriggerButtonClick = composeEventHandlers(
    onClickProp,
    handleTriggerClick,
  );
  // A caller `onKeyDown` sees every key, including the ArrowDown the trigger
  // has already used to open the popup.
  const handleTriggerButtonKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
  ) => {
    handleTriggerKeyDown(event);
    // A disabled trigger keeps its tab stop but invokes no callback
    // (`spec:AST-085` FR2).
    if (!isDisabled) {
      onKeyDownProp?.(event);
    }
  };
  // A press on a disabled control reaches no handler, the component's or an
  // ancestor's, as with a natively disabled button (`spec:AST-085` FR2).
  const swallowDisabledPress = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleControlBoxClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDisabled) {
        event.stopPropagation();
        return;
      }
      if (triggerRef.current?.contains(event.target as Node)) {
        return;
      }
      // Route the press through the trigger so it behaves exactly like a
      // press on the trigger itself, caller `onClick` included.
      triggerRef.current?.click();
    },
    [isDisabled],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      open: () => {
        if (!isDisabled) {
          popover.show();
        }
      },
      close: () => popover.hide(),
      toggle: () => {
        if (isDisabled) {
          return;
        }
        if (popover.isOpen) {
          popover.hide();
        } else {
          popover.show();
        }
      },
      isOpen: () => popover.isOpen,
    }),
    [isDisabled, popover],
  );

  // The helper reads the selector's availability when it runs, not the
  // render it came from: content may keep a helper from an earlier render
  // (after an await, say) across a change either way. The insertion effect
  // runs before any layout effect of the content, so a commit from the
  // content's own layout effect in the render that changes it sees the new
  // availability too.
  const isDisabledRef = useRef(isDisabled);
  useInsertionEffect(() => {
    isDisabledRef.current = isDisabled;
  }, [isDisabled]);

  const commitValue = useCallback(
    (nextValue: Value) => {
      // Caller-owned popup controls may remain mounted after disablement.
      // Guard the supplied commit boundary, not just the trigger.
      if (isDisabledRef.current) {
        return;
      }
      onChange?.(nextValue);
      if (changeAction) {
        startTransition(async () => {
          setOptimisticValue(nextValue);
          await changeAction(nextValue);
        });
      }
    },
    [changeAction, onChange, setOptimisticValue, startTransition],
  );

  const triggerContent = triggerLabel ?? placeholder;

  const startIconSlot = renderIconSlot(startIcon, {
    size: 'sm',
    color: 'secondary',
  });

  const content = (
    <div id={contentId} {...stylex.props(styles.content, contentXstyle)}>
      {children(optimisticValue, commitValue, close, {
        isOpen,
        isBusy,
        triggerId,
        contentId,
      })}
    </div>
  );

  const popup = popover.render(content, {
    placement,
    alignment,
    offset: spacingVars['--spacing-1'],
    xstyle: [styles.popover, layerAnimations[placement]],
  });

  if (renderTrigger != null) {
    // Anchor-only mode: the caller renders the opener and spreads these props
    // on it. No Field, no status, no chevron — the caller owns the control;
    // the selector owns the popup, its anchor, and focus return.
    const triggerProps: ComplexSelectorRenderTriggerProps = {
      // Base props reach the caller's control, the primary semantic control
      // in this mode; the selector's own wiring below wins over them.
      ...rest,
      'aria-describedby': ariaDescribedByProp,
      ref: mergeRefs<HTMLElement>(el => {
        popover.triggerRef(el);
        triggerRef.current = el;
      }, ref),
      id: triggerId,
      // This path never forwarded caller handlers before, so the newly
      // forwarded ones compose component first and cannot cancel opening.
      // A disabled control keeps its tab stop but invokes no callback
      // (`spec:AST-085` FR2), as on the built-in trigger.
      onClick: isDisabled
        ? swallowDisabledPress
        : composeEventHandlers(handleTriggerClick, onClickProp),
      onKeyDown: isDisabled
        ? handleTriggerKeyDown
        : composeEventHandlers(handleTriggerKeyDown, onKeyDownProp),
      // The caller's control is the field, so it carries the field's role
      // and state as the built-in trigger does.
      role: 'combobox',
      // A combobox takes no name from its content, so the field's label
      // names the control, as it names the built-in trigger and the popup.
      // A name passed to the selector wins.
      'aria-label':
        rest['aria-label'] ??
        (rest['aria-labelledby'] != null ? undefined : label),
      'aria-haspopup': 'dialog',
      'aria-expanded': isOpen,
      'aria-controls': contentId,
      'aria-busy': isBusy || undefined,
      'aria-required': isEffectivelyRequired ? 'true' : undefined,
      'aria-disabled': isDisabled ? 'true' : undefined,
    };
    return (
      <>
        {renderTrigger(triggerProps)}
        {popup}
      </>
    );
  }

  const selectorContent = (
    <>
      <div
        ref={popover.triggerRef}
        {...pressable}
        onClick={handleControlBoxClick}
        {...mergeProps(
          themeProps('complex-selector', {
            variant,
            size,
            status: status?.type ?? null,
          }),
          stylex.props(
            inputWrapperStyles.base,
            styles.triggerContainer,
            styles[size],
            // The ring belongs to the wrapper (the focusable `<button>` sits
            // inside it), but it must still be a KEYBOARD ring: `:focus-within`
            // matched a mouse click on the trigger and drew the outline for
            // pointer users too. `focusWithin` here is `:has(:focus-visible)`.
            focusOutlineStyles.focusWithin,
            variant === 'secondary' && styles.triggerSecondary,
            variant === 'ghost' && styles.triggerGhost,
            variant !== 'input' && interactionOverlayStyles.backgroundImage,
            isDisabled && inputWrapperStyles.disabled,
            variant !== 'input' && isDisabled && styles.triggerGhostDisabled,
            isDisabled && styles.disabled,
            triggerLabel == null && styles.placeholder,
            controlXstyle,
          ),
          controlClassName,
          controlStyle,
        )}>
        {isRenderable(startIconSlot) && startIconSlot}
        <button
          {...rest}
          ref={triggerButtonRef}
          id={triggerId}
          type="button"
          // The trigger is the field's control: a combobox whose popup is a
          // dialog, so required and disabled state are valid on it.
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={contentId}
          // A caller's description is kept alongside the field's own.
          aria-describedby={
            [ariaDescribedByProp, ariaDescribedBy].filter(Boolean).join(' ') ||
            undefined
          }
          // The field's label names the trigger unless the selector was
          // given a name: a caller's `aria-label` or `aria-labelledby`
          // replaces it (family:input-fields FR10), as on `renderTrigger`.
          aria-labelledby={
            rest['aria-labelledby'] ??
            (rest['aria-label'] != null ? undefined : labelId)
          }
          aria-required={isEffectivelyRequired ? 'true' : undefined}
          aria-invalid={status?.type === 'error' ? 'true' : undefined}
          aria-busy={isBusy || undefined}
          // A disabled trigger keeps its tab stop and says so through
          // aria-disabled (`spec:AST-085` FR1). Its press runs neither the
          // caller's handler nor the toggle (FR2).
          aria-disabled={isDisabled ? 'true' : undefined}
          onClick={isDisabled ? swallowDisabledPress : handleTriggerButtonClick}
          onKeyDown={handleTriggerButtonKeyDown}
          {...stylex.props(styles.trigger)}>
          <span {...stylex.props(styles.triggerText)}>{triggerContent}</span>
        </button>
        {isBusy && <Spinner size="sm" aria-hidden="true" />}
        <Icon
          icon="chevronDown"
          size="sm"
          color="secondary"
          // No wrapper: Icon's own span already provides the 16px box (`sm`)
          // and the secondary icon color the wrapper used to set, so the glyph
          // IS the trigger's icon element — one node carrying the box, the
          // color, the rotation, and the theme target.
          xstyle={[
            styles.triggerIcon,
            styles.triggerIconRotation,
            isOpen && styles.triggerIconOpen,
          ]}
          {...themeProps('complex-selector-indicator-icon', {
            state: isOpen ? 'expanded' : 'collapsed',
          })}
        />
      </div>

      {popup}
    </>
  );

  return (
    <Field
      label={label}
      isLabelHidden={isLabelHidden}
      description={description}
      inputID={triggerId}
      descriptionID={description ? descriptionId : undefined}
      labelID={labelId}
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

ComplexSelector.displayName = 'ComplexSelector';
