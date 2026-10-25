// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioListItem.tsx
 * @input Uses React use, useId, useRef, RadioListContext, Item
 * @output Exports RadioListItem component, RadioListItemProps
 * @position Core implementation; consumed by index.ts, tested by RadioList.test.tsx
 *
 * Composes Item for the shared start content + label + description + end content layout.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/RadioList/RadioList.doc.mjs
 * - /packages/core/src/RadioList/RadioList.test.tsx
 * - /packages/core/src/RadioList/index.ts
 * - /apps/storybook/stories/RadioList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/RadioList/ (showcase blocks)
 */

import React, {use, useId, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {RadioListContext} from './RadioList';
import {colorVars, radiusVars} from '../theme/tokens.stylex';
import {mergeProps, isRenderable, rtlStyles} from '../utils';
import {indicatorScope} from '../Indicator/indicator.markers.stylex';
import {useIndicatorFocusRing} from '../hooks/useIndicatorFocusRing';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useIndicator} from '../Indicator';
import {Item, type ItemAlign} from '../Item';
import {themeProps} from '../utils/themeProps';

// The touch press's paint, declared by the shared overlay styles on the
// element the controller writes to (`pressedAlpha`) at the press's strength,
// 1 while on and 1 → 0 over the release, and inherited resolved by the layer
// that paints it. See interactionOverlay.stylex.ts.
const pressedOverlayImage = 'var(--_press-paint-image)';

// The mouse press's paint, declared on the row and inherited by the layer
// over the circle. Internal: not a theme hook.
const ROW_PRESS = '--_radio-row-press';

const styles = stylex.create({
  radioWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    isolation: 'isolate',
  },
  // The row remains the large press target, but nested links and buttons keep
  // their independent action and do not make the radio appear pressed: the
  // row declares the mouse press's paint (`rowStyles.press`) and this layer
  // reads it. This owner-drawn layer also survives a theme replacing the
  // indicator component.
  // Two pointers, two press models (see interactionOverlay.stylex.ts): a
  // mouse keeps `:active`; under a coarse pointer that arm is dropped and the
  // touch press controller writes `data-astryx-press` on the row, which this layer
  // reads off the same scope marker as the hover tint. The controller paints
  // the innermost pressable, so a nested link or button takes the press
  // itself and the row never carries the attribute for it.
  indicatorPressOverlay: {
    '::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: radiusVars['--radius-full'],
      pointerEvents: 'none',
      backgroundColor: `var(${ROW_PRESS}, transparent)`,
      // The touch press, as an image layer over the colour: an image change is
      // discrete, so no transition can delay the onset, and the strength the
      // row's `pressedAlpha` arms own (1 while on, 1 → 0 over the release) is
      // what moves. Coarse pointers only, like the drop above.
      backgroundImage: {
        default: null,
        [stylex.when.ancestor('[data-astryx-press="on"]', indicatorScope)]: {
          default: null,
          '@media (pointer: coarse)': pressedOverlayImage,
        },
        [stylex.when.ancestor('[data-astryx-press="fading"]', indicatorScope)]:
          {
            default: null,
            '@media (pointer: coarse)': pressedOverlayImage,
          },
      },
    },
  },
  input: {
    position: 'absolute',
    top: '50%',
    margin: 0,
    padding: 0,
    opacity: 0,
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
    zIndex: 1,
  },
  inputCoarse: {
    '@media (pointer: coarse)': {
      minInlineSize: 24,
      minBlockSize: 24,
    },
  },
  inputDisabled: {
    cursor: 'default',
  },
  // Holds only the indicator, so the focus ring has one unambiguous target.
  indicatorSlot: {
    display: 'contents',
  },
});

const wrapperSizeStyles = stylex.create({
  sm: {
    width: 20,
    height: 20,
  },
  md: {
    width: 24,
    height: 24,
  },
});

const rowStyles = stylex.create({
  // The row's default appearance is a bare surface: no density padding, no
  // radius, and no full-row background — only the indicator tints on hover
  // (via `indicatorScope`). Item paints padding/radius/hover as an interactive
  // row, so this neutralizes them at the component level. A theme's
  // `radio-list-item` overrides still win: they land in `@layer astryx-theme`,
  // above the component's base StyleX layer, so themes opt back into row
  // padding/radius/hover/selected styling. `minWidth: 0` preserves label
  // truncation now that the Item is the row's flex child.
  root: {
    paddingBlock: 0,
    paddingInline: 0,
    borderRadius: 0,
    minWidth: 0,
    // Suppress Item's interactive hover/press background so the resting and
    // hovered row look identical by default (a theme can restyle either).
    backgroundColor: 'transparent',
    // ...and the touch press's overlay image, for the same reason: under a
    // finger only the radio circle paints, as under a mouse. The press's
    // strength still lands on the row, which is where the layer over the
    // circle reads it.
    backgroundImage: 'none',
  },
  // The mouse press (a finger's lives on `data-astryx-press`): the row is
  // pressed, but not through a nested link or button, which keep their own
  // action. The `:has()` is on the row itself and reaches no descendant
  // selector, so a change inside the row re-checks the row alone; the circle's
  // layer reads the paint through inheritance rather than a relation that
  // would restyle everything under the row.
  press: {
    [ROW_PRESS]: {
      default: null,
      ':active:not(:has(a:active,button:active,[role="button"]:active,[role="link"]:active))':
        {
          default: colorVars['--color-overlay-pressed'],
          '@media (pointer: coarse)': 'transparent',
        },
    },
  },
});

export interface RadioListItemProps extends BaseProps<HTMLDivElement> {
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Vertical alignment of the start and end content against the label,
   * forwarded to Item. Use `first-line` to keep the radio level with the
   * first line of a wrapped label.
   * @default 'center'
   */
  align?: ItemAlign;
  /**
   * Primary label for the radio item.
   *
   * Accepts a plain string or a ReactNode for rich content. Links and buttons
   * in the label keep their own behavior; only non-interactive row clicks
   * delegate to the radio. The radio points at the rendered label for its
   * accessible name, so a rich label still names it from its own text. Pass
   * `aria-label` when that text is absent. When visible text is present, the
   * override must retain every visible word so speech-input users can say what
   * they see.
   */
  label: ReactNode;
  /**
   * Plain-text accessible name for the radio, applied to the control rather
   * than the row. It replaces the name the label would otherwise supply. Use
   * it when a rich label has no visible text; otherwise the value must retain
   * every visible word.
   *
   * @example
   * ```
   * <RadioListItem
   *   label={<span>Pro plan <Badge label="Recommended" /></span>}
   *   aria-label="Pro plan Recommended option"
   *   value="pro"
   * />
   * ```
   */
  'aria-label'?: string;
  /**
   * Value of this radio item.
   */
  value: string;
  /**
   * Secondary content displayed below the label. Accepts a plain string or a
   * ReactNode. Links and buttons anywhere in the row keep their own click
   * behaviour — the row only delegates clicks from its non-interactive
   * surface to the radio.
   */
  description?: ReactNode;
  /**
   * Whether this individual radio item is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Content to render before the radio circle.
   */
  startContent?: ReactNode;
  /**
   * Content to render after the label.
   */
  endContent?: ReactNode;
}

/**
 * An individual radio item within an RadioList.
 *
 * @example
 * ```
 * <RadioListItem label="Email" value="email" />
 * <RadioListItem
 *   label="SMS"
 *   value="sms"
 *   description="Standard messaging rates apply"
 * />
 * ```
 */
export function RadioListItem({
  ref,
  label,
  'aria-label': ariaLabel,
  value,
  description,
  isDisabled: isItemDisabled = false,
  startContent,
  endContent,
  align,
  xstyle,
  className,
  style,
  onClick,
  ...rest
}: RadioListItemProps) {
  // Item marks itself as a pressable surface (the row delegates to the radio,
  // so it is interactive); naming the row here as well keeps the overlay's
  // pressed arm, which reads the row's scope marker, verifiably reachable by
  // the touch press controller (pressableCoverage.test.ts).
  const pressable = usePressFeedback();
  const context = use(RadioListContext);
  if (!context) {
    throw new Error('RadioListItem must be used within an RadioList');
  }

  const id = useId();
  const labelID = useId();
  const descriptionID = useId();
  const isDisabled = context.isDisabled || isItemDisabled;
  // When the whole group is disabled with a disabledMessage, radios stay
  // focusable via aria-disabled (instead of native `disabled`) so the group's
  // reason tooltip is keyboard-discoverable. Per-item disabling is unaffected
  // and always uses the native disabled attribute.
  const keepsFocusableForMessage =
    context.hasDisabledMessage && !isItemDisabled;
  const isChecked = context.value === value;
  // One predicate for both the rendered element and the aria-describedby that
  // points at it. A ReactNode description can be `false` or `''`, which render
  // nothing — a `!= null` check would leave the link dangling.
  const hasDescription = isRenderable(description);
  const size = context.size;
  // The radio visual is an indicator: a theme can restyle it through the
  // `radio-indicator` / `radio-indicator-dot` targets or replace the component
  // outright.
  const RadioControl = useIndicator('radio');
  // See CheckboxInput: the ring goes on the indicator's own element, because
  // the native input is visually hidden and only the indicator knows its shape.
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const {focusProps} = useIndicatorFocusRing(indicatorRef, isDisabled);

  // The radio is the row's single keyboard control and action. The row is an
  // enlarged click/tap target that delegates surface clicks — the description
  // and the empty hover area, not just the control and its label — to the
  // input via Item's `interactiveRef` (useClickableContainer). This matches
  // CheckboxListItem so the whole row is clickable, and keeps one tab stop per
  // option (WCAG 4.1.2). The radio carries its accessible name via `aria-label`
  // since the visible label is now a plain (non-`<label>`) text node — a real
  // `<label htmlFor>` would double-fire under delegation.
  const radioRef = useRef<HTMLInputElement>(null);

  const radioCircle = (
    <div
      {...stylex.props(
        styles.radioWrapper,
        wrapperSizeStyles[size],
        !isDisabled && styles.indicatorPressOverlay,
      )}
      {...focusProps}>
      <input
        ref={radioRef}
        id={id}
        type="radio"
        name={context.name}
        value={value}
        checked={isChecked}
        disabled={isDisabled && !keepsFocusableForMessage}
        aria-disabled={keepsFocusableForMessage ? 'true' : undefined}
        // A focusable-disabled radio is not natively disabled, so detach it
        // from the form instead: it keeps its name (grouping) but is excluded
        // from submission, matching a natively disabled control.
        form={keepsFocusableForMessage ? '' : undefined}
        required={context.isRequired}
        onChange={() => {
          if (isDisabled) {
            return;
          }
          context.onChange(value);
        }}
        // A consumer onClick rides on the radio input itself, so it fires for
        // both direct control clicks and row-surface clicks the row delegates
        // to the input — the same routing CheckboxListItem uses.
        onClick={onClick}
        // The radio names itself from the visible label element, which works
        // for a rich label as well as a plain string. `aria-label` replaces
        // that name rather than adding to it, so the two are mutually
        // exclusive — aria-labelledby would otherwise win over it.
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel == null ? labelID : undefined}
        aria-describedby={hasDescription ? descriptionID : undefined}
        {...stylex.props(
          styles.input,
          rtlStyles.centerInline('-50%'),
          styles.inputCoarse,
          wrapperSizeStyles[size],
          isDisabled && styles.inputDisabled,
        )}
      />
      <span ref={indicatorRef} {...stylex.props(styles.indicatorSlot)}>
        <RadioControl
          state={isChecked ? 'checked' : 'unchecked'}
          size={size}
          isDisabled={isDisabled}
        />
      </span>
    </div>
  );

  const mediaContent = isRenderable(startContent) ? (
    <>
      {radioCircle}
      {startContent}
    </>
  ) : (
    radioCircle
  );

  return (
    <Item
      ref={ref}
      {...(isDisabled ? undefined : pressable)}
      startContent={mediaContent}
      // Delegate row-surface clicks (label text, description, and the empty
      // hover area) to the radio input. The input stays the option's sole
      // focusable control, so the row adds no second tab stop.
      interactiveRef={radioRef}
      isDisabled={isDisabled}
      label={<span id={labelID}>{label}</span>}
      description={
        hasDescription ? (
          <span id={descriptionID}>{description}</span>
        ) : undefined
      }
      endContent={endContent}
      align={align}
      xstyle={
        [
          // Hover reaches the radio visual through this ancestor marker rather
          // than props, so hovering the row tints the control. The marker rides
          // the painting row element (Item), the same element that carries the
          // theme target, so a theme's hover styling stays in step with the tint.
          !isDisabled && indicatorScope,
          // Restore the bare default look: zero Item's padding/radius and its
          // interactive hover/press background. Applied after Item's own base
          // styles so it wins within the base layer; a `radio-list-item` theme
          // still overrides it from the higher `astryx-theme` layer.
          rowStyles.root,
          !isDisabled && rowStyles.press,
          xstyle,
        ] as StyleXStyles
      }
      {...mergeProps(
        // One target for every row, carrying its size and runtime state so a
        // theme can express "selected option at large" or restyle disabled
        // rows without reaching for structural selectors. It lands on the
        // element Item paints — the row surface — so a theme styling
        // `radio-list-item`'s background/padding/borderRadius (and its
        // `:hover`) actually takes effect from the `astryx-theme` layer, even
        // though the component zeroes those by default. Converges with how
        // ListItem lands `list-item` on the same element as `astryx-item`.
        themeProps('radio-list-item', {
          size,
          selected: isChecked ? 'selected' : null,
          disabled: isDisabled ? 'disabled' : null,
        }),
        {className, style},
      )}
      {...rest}
    />
  );
}

RadioListItem.displayName = 'RadioListItem';
