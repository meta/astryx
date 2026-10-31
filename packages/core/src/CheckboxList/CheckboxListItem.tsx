// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxListItem.tsx
 * @input Uses React, CheckboxInput, ListItem, CheckboxListContext,
 *   CheckboxRowPressContext, the shared touch-pointer store and the row's
 *   own press paint (under a coarse primary pointer the row owns its
 *   checkbox's press)
 * @output Exports CheckboxListItem component, CheckboxListItemProps
 * @position Core implementation; consumed by index.ts, tested by CheckboxList.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/CheckboxList/CheckboxListItem.doc.mjs
 * - /packages/core/src/CheckboxList/CheckboxList.doc.mjs
 * - /packages/core/src/CheckboxList/CheckboxList.test.tsx
 * - /packages/core/src/CheckboxList/index.ts
 * - /apps/storybook/stories/CheckboxList.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/CheckboxList/ (showcase blocks)
 */

import {use, useId, useRef, type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {StyleXStyles} from '@stylexjs/stylex';
import {colorVars} from '../theme/tokens.stylex';
import type {BaseProps} from '../BaseProps';
import {CheckboxInput} from '../CheckboxInput/CheckboxInput';
import type {CheckboxInputProps} from '../CheckboxInput/CheckboxInput';
import {CheckboxRowPressContext} from '../CheckboxInput/CheckboxRowPressContext';
import {usePressFeedback} from '../hooks/usePressFeedback';
import {useIsTouchPointer} from '../utils/touchPointerStore';
import {ListItem} from '../List/ListItem';
import {ListContext} from '../List/ListContext';
import {CheckboxListContext} from './CheckboxListContext';
import {useTranslator} from '../i18n';
import {ItemDescriptionContext} from '../Item/ItemDescriptionContext';
import type {ItemAlign} from '../Item';

// =============================================================================
// Styles
// =============================================================================

const styles = stylex.create({
  selected: {
    backgroundColor: colorVars['--color-accent-muted'],
  },
  // The row's own press paint, for the layer over its checkbox's box: none
  // at rest, and the press paint (the row's shared overlay style declares it
  // at the press's strength) only inside this row's own press arms, under a
  // coarse pointer. Every row that owns its press declares it, so a box reads
  // its nearest row's value: a list placed in a row's content keeps its own
  // rows' paint (`architecture:component-style-authoring` INV4).
  rowPressPaint: {
    '--_checkbox-row-press-paint': {
      default: 'none',
      ':is([data-astryx-press="on"])': {
        default: 'none',
        '@media (pointer: coarse)': 'var(--_press-paint-image)',
      },
      ':is([data-astryx-press="fading"])': {
        default: 'none',
        '@media (pointer: coarse)': 'var(--_press-paint-image)',
      },
    },
  },
});

// =============================================================================
// Types
// =============================================================================

export interface CheckboxListItemProps extends BaseProps<HTMLLIElement> {
  /**
   * Vertical alignment of the start and end content against the label,
   * forwarded to Item. Use `first-line` to keep the checkbox level with the
   * first line of a wrapped label.
   * @default 'center'
   */
  align?: ItemAlign;
  /**
   * Primary text label for the item.
   *
   * Accepts a plain string (single-line truncation applied automatically)
   * or a ReactNode for rich content (no truncation constraints —
   * child components control their own text behavior). Links and buttons in
   * the label keep their own behavior; only non-interactive row clicks
   * delegate to the checkbox.
   *
   * A string names the checkbox directly. A ReactNode names it from its
   * visible text through `aria-labelledby`; if that text is absent, pass
   * `aria-label`. When visible text is present, an override must retain every
   * visible word so speech-input users can say what they see.
   */
  label: ReactNode;
  /**
   * Plain-text accessible name for the checkbox, replacing the one derived
   * from `label`.
   *
   * A string `label` names the checkbox directly, and a rich (ReactNode)
   * `label` names it from its visible text through `aria-labelledby`. Pass
   * `aria-label` when that text is absent. When visible text is present, the
   * override must retain every visible word so speech-input users can say what
   * they see. It replaces the derived name and applies to the checkbox control,
   * not the row.
   *
   * @example
   * ```
   * <CheckboxListItem
   *   label={<span>Pro plan <Badge label="Recommended" /></span>}
   *   aria-label="Pro plan Recommended option"
   *   value="pro"
   * />
   * ```
   */
  'aria-label'?: string;
  /**
   * Identity key for collection mode. Required when the parent CheckboxList
   * has a `value` array: the item throws without it there. An item inside
   * List, or inside a CheckboxList without `value`, may omit it.
   */
  value?: string;
  /**
   * Secondary content below the label. Accepts a plain string or a ReactNode.
   * Exposed as the checkbox's accessible description through
   * `aria-describedby`, so assistive technology can tell it is the explanation
   * for this choice rather than unrelated row text.
   */
  description?: ReactNode;
  /**
   * Content rendered after the label area.
   */
  endContent?: ReactNode;
  /**
   * Whether this individual item is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Whether this item is in a loading state. Renders a spinner inside the
   * checkbox and blocks interaction on this item only.
   *
   * In collection mode, this is also driven automatically: when the parent
   * `CheckboxList` has a `changeAction`, the toggled item shows its
   * spinner while that promise is pending.
   * @default false
   */
  isLoading?: boolean;
  /**
   * Direct checked state for standalone mode: an item inside List, or inside
   * a CheckboxList without `value` (for example, a select-all item). Ignored
   * when the parent CheckboxList has a `value` array, which then owns the
   * checked state.
   */
  isChecked?: boolean | 'indeterminate';
  /**
   * Direct check handler for standalone mode: an item inside List, or inside a
   * CheckboxList without `value`. Ignored when the parent CheckboxList has a
   * `value` array; that list's `onChange` receives the change instead.
   */
  onCheck?: (checked: boolean) => void;
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLLIElement>;
}

// =============================================================================
// Component
// =============================================================================

/**
 * The row's visible description is the checkbox's accessible description. Item
 * renders that element and owns its id, and publishes the id through
 * ItemDescriptionContext; this reads it from inside the slot Item renders. The
 * row cannot wrap the description in an id'd element instead — that turns a
 * plain string into a ReactNode and drops the single-line truncation ListItem
 * documents — and a public `descriptionId` prop would fail
 * `spec:AST-002/DEC-1`, since the caller decides nothing Item cannot derive.
 *
 * This component owns `aria-describedby`, so the prop is omitted rather than
 * accepted and overwritten: a caller passing one would otherwise lose the id
 * silently.
 */
function DescribedCheckboxInput(
  props: Omit<CheckboxInputProps, 'aria-describedby'>,
) {
  const describedBy = use(ItemDescriptionContext);
  return (
    <CheckboxInput {...props} aria-describedby={describedBy ?? undefined} />
  );
}

/**
 * A checkbox item for use within CheckboxList (collection mode, when the list
 * has a `value` array) or standalone (inside List, or inside a CheckboxList
 * without `value`).
 *
 * In collection mode, checked state is derived from the parent's value array.
 * In standalone mode, uses isChecked/onCheck props directly.
 *
 * Composes ListItem internally — gets density, dividers, hover/press,
 * focus, and container alignment for free.
 *
 * @example
 * ```
 * <CheckboxListItem label="Email" value="email" />
 * <CheckboxListItem
 *   label="Accept terms"
 *   isChecked={accepted}
 *   onCheck={setAccepted}
 * />
 * ```
 */
export function CheckboxListItem({
  label,
  'aria-label': ariaLabel,
  value,
  description,
  endContent,
  isDisabled: isItemDisabled = false,
  isLoading: isItemLoading = false,
  isChecked,
  onCheck,
  ref,
  xstyle,
  className,
  style,
  onClick: onClickProp,
  align,
  ...restProps
}: CheckboxListItemProps) {
  const t = useTranslator();
  const ctx = use(CheckboxListContext);

  if (ctx && ctx.value !== undefined && value === undefined) {
    throw new Error(
      'CheckboxListItem requires a `value` prop when used inside CheckboxList with a value array.',
    );
  }

  // Accessible name for the checkbox. A string `label` (or an explicit
  // `aria-label`) becomes the text of CheckboxInput's visually hidden
  // `<label>`, which only accepts a string. A rich label instead names the
  // checkbox from the visible label element through `aria-labelledby`, as
  // RadioListItem does; the hidden label then carries only the generic word,
  // which `aria-labelledby` outranks. Strings are left unwrapped on purpose:
  // Item single-line-truncates a raw string label but not a node.
  const isRichLabel = typeof label !== 'string';
  const labelID = useId();
  const namesFromVisibleLabel = isRichLabel && ariaLabel == null;

  const checkboxLabel =
    ariaLabel ??
    (isRichLabel ? t('@astryx.checkboxList.item.checkbox') : label);

  // Density from list context for checkbox sizing
  const listCtx = use(ListContext);
  const density = listCtx?.density ?? 'balanced';
  const checkboxSize = density === 'compact' ? 'sm' : 'md';

  // Disabled: parent-level OR item-level
  const effectiveDisabled = (ctx?.isDisabled ?? false) || isItemDisabled;
  const effectiveReadOnly = ctx?.isReadOnly ?? false;
  // Loading is per-item: explicit item prop OR (collection mode) an item
  // whose `changeAction` is currently pending in the parent.
  const isBusy =
    isItemLoading ||
    (value !== undefined && (ctx?.loadingValues?.includes(value) ?? false));

  // Resolve checked state:
  // 1. Collection mode (inside CheckboxList with value[])
  // 2. Standalone mode (isChecked prop)
  // 3. Neither → unchecked
  let resolvedChecked: boolean | 'indeterminate' = false;
  if (ctx && ctx.value !== undefined && value !== undefined) {
    resolvedChecked = ctx.value.includes(value);
  } else if (isChecked !== undefined) {
    resolvedChecked = isChecked;
  }

  // Whether this item is interactive (has a toggle handler)
  const isInteractive = !effectiveReadOnly && (ctx != null || onCheck != null);

  // The checkbox is the row's single keyboard control and action. The row is
  // an enlarged click/tap target that delegates surface clicks to it via
  // ListItem's `interactiveRef` (useClickableContainer), so each option is
  // exactly one tab stop. Delegate whenever the row should respond to clicks:
  // a toggleable item, or one carrying a consumer `onClick`.
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const hasRowInteraction = isInteractive || onClickProp != null;

  // Under a coarse primary pointer, a row that delegates its surface clicks
  // is the option's one press surface: Item marks it pressable and declares
  // its press paint, and its own checkbox carries no press marker
  // (CheckboxRowPressContext), so a finger on the label, the description or
  // the box itself presses the row, and the box paints the row's press, the
  // way a radio row's circle does. A fine primary pointer keeps main's
  // behavior (spec:AST-017 FR59): the box stays its own press owner, so a pen
  // on a fine-pointer page presses the box, never the row. Every row reads
  // one shared answer, so a long list adds no touch observer per row
  // (spec:AST-094 FR24); server and hydrating renders read the fine-pointer
  // answer (spec:AST-094 FR13).
  const isTouch = useIsTouchPointer();
  const rowOwnsPress = isTouch && hasRowInteraction && !effectiveDisabled;
  // The row's own press arms (the row's press paint) key on the attribute
  // the touch press controller writes on this row, so the row names itself
  // pressable here too: every file with a press arm stays verifiably
  // reachable by the controller (pressableCoverage.test.ts).
  const pressable = usePressFeedback();

  // A read-only checkbox carries aria-readonly, which the row's clickable
  // container treats as a non-interactive target, so a click on it would be
  // delegated straight back to the checkbox without end. Stop that click at
  // the checkbox; the consumer onClick still fires once per click.
  const handleCheckboxClick: typeof onClickProp =
    effectiveReadOnly && onClickProp != null
      ? event => {
          onClickProp(event);
          event.stopPropagation();
        }
      : onClickProp;

  const handleToggle = () => {
    if (effectiveDisabled || effectiveReadOnly || isBusy) {
      return;
    }

    if (ctx && ctx.value !== undefined && value !== undefined) {
      // Collection mode — pass the toggled value up so the list can show a
      // spinner on this item while a changeAction is pending.
      const currentlyChecked = ctx.value.includes(value);
      if (currentlyChecked) {
        ctx.onChange?.(
          ctx.value.filter(v => v !== value),
          value,
        );
      } else {
        ctx.onChange?.([...ctx.value, value], value);
      }
    } else {
      // Standalone mode
      const shouldCheck = resolvedChecked === true ? false : true;
      onCheck?.(shouldCheck);
    }
  };

  return (
    <ListItem
      {...restProps}
      {...(rowOwnsPress ? pressable : undefined)}
      ref={ref}
      label={namesFromVisibleLabel ? <span id={labelID}>{label}</span> : label}
      description={description}
      endContent={endContent}
      align={align}
      isDisabled={effectiveDisabled}
      // Delegate row clicks to the checkbox instead of wiring onClick (which
      // would add an invisible row button = a second tab stop). The checkbox
      // stays the option's sole focusable control (WCAG 4.1.2 / APG checkbox
      // pattern). A consumer onClick rides on the checkbox itself (below), so
      // it still fires for both direct and delegated (row-surface) clicks.
      interactiveRef={hasRowInteraction ? checkboxRef : undefined}
      aria-busy={isBusy || undefined}
      xstyle={
        [
          // The row's own press paint, which the layer over its box reads.
          rowOwnsPress && styles.rowPressPaint,
          resolvedChecked === true &&
            !effectiveDisabled &&
            !effectiveReadOnly &&
            styles.selected,
          xstyle,
        ] as StyleXStyles
      }
      className={className}
      style={style}
      startContent={
        // Only the row's own checkbox: a checkbox placed in the row's content
        // keeps its own press.
        <CheckboxRowPressContext value={rowOwnsPress}>
          <DescribedCheckboxInput
            ref={checkboxRef}
            label={checkboxLabel}
            aria-labelledby={namesFromVisibleLabel ? labelID : undefined}
            isLabelHidden
            value={resolvedChecked}
            onChange={() => handleToggle()}
            onClick={handleCheckboxClick}
            isDisabled={effectiveDisabled}
            isReadOnly={effectiveReadOnly}
            isLoading={isBusy}
            size={checkboxSize}
          />
        </CheckboxRowPressContext>
      }
    />
  );
}

CheckboxListItem.displayName = 'CheckboxListItem';
