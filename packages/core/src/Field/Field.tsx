// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file Field.tsx
 * @input Uses React, StyleX, BaseProps, FieldLabel/FieldStatus, FormLayoutContext, Text, VisuallyHidden, theme/status utilities
 * @output Exports Field component, FieldProps
 * @position Core implementation; consumed by index.ts, tested by Field.test.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Field/Field.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Field/Field.test.tsx (tests for new/changed behavior)
 * - /packages/core/src/Field/index.ts (exports if types change)
 * - /apps/storybook/stories/Field.stories.tsx (storybook stories)
 * - /packages/cli/assets/templates/blocks/components/Field/ (showcase blocks)
 */

import {type ReactNode, use} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import type {SizeValue} from '../utils/types';
import {FieldLabel} from './FieldLabel';
import {FieldStatus} from '../FieldStatus/FieldStatus';
import type {FieldStatusVariant} from '../FieldStatus/FieldStatus';
import {useFieldStatusAnnouncement} from '../FieldStatus/useFieldStatusAnnouncement';
import {spacingVars, borderVars, sizeVars} from '../theme/tokens.stylex';
import type {IconType} from '../Icon';
import {mergeProps} from '../utils';
import {useDevWarning} from '../hooks/useDevWarning';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';
import {Text} from '../Text/Text';
import {VisuallyHidden} from '../VisuallyHidden';
import {themeProps} from '../utils/themeProps';

const styles = stylex.create({
  container: {
    display: 'flex',
    flexDirection: 'column',
    // The Field root owns the local stacking boundary (AST-027): the input
    // wrapper's z-index (1, above the attached status box) and the attached
    // status layer (-1) order parts inside this surface only. Without this,
    // detached/tooltip fields — whose input wrapper renders outside the
    // attached-status wrapper — compete with page-level stacking (#5689).
    isolation: 'isolate',
    // The Field root is the flex/grid item a row actually sizes. With the
    // automatic minimum it held a filter bar at its controls' intrinsic
    // widths (a native input's ~20ch, a Selector's full value), so the row
    // overflowed on phones; the reset lets the row shrink the whole field.
    minWidth: 0,
  },
  containerGap: {
    gap: spacingVars['--spacing-1'],
  },
  horizontalLabels: {
    display: 'contents',
  },
  horizontalLabelAlign: {
    // Align label text with input text by matching the input wrapper's
    // top border + top padding. Works for both single-line inputs and
    // textareas (labels stay top-aligned, not vertically centered).
    paddingTop: `calc(${borderVars['--border-width']} + ${spacingVars['--spacing-1']})`,
  },
  inputStatusWrapper: {
    display: 'flex',
    flexDirection: 'column',
    isolation: 'isolate',
    // Extend an attached FieldStatus behind the lower half of the control.
    // Half-height is the maximum effective corner radius CSS can render, even
    // when a theme uses a pill value such as --radius-full (9999px).
    '--_field-status-overlap': {
      default: `calc(${sizeVars['--size-element-md']} / 2)`,
      ':has(> [data-size="sm"])': `calc(${sizeVars['--size-element-sm']} / 2)`,
      ':has(> [data-size="lg"])': `calc(${sizeVars['--size-element-lg']} / 2)`,
    },
  },
  attachedStatusLayer: {
    // Keep the overlapping background below both Astryx inputs and custom
    // controls. The isolated wrapper contains this negative stacking layer.
    position: 'relative',
    zIndex: -1,
  },
});

// Dynamic style for the consumer-controlled field width. Numbers are treated
// as pixels by StyleX; strings (e.g. '100%') are used as-is.
const dynamicStyles = stylex.create({
  width: (width: SizeValue | null) => ({width}),
});

export type {SizeValue} from '../utils/types';

export type FieldStatusType = 'warning' | 'error' | 'success';

export interface FieldStatusInput {
  /**
   * The type of status to display.
   */
  type: FieldStatusType;
  /**
   * Optional message to display below the input.
   */
  message?: string;
  /**
   * ID for the status message element (use for aria-describedby on the input).
   */
  messageID?: string;
}

export interface FieldProps extends Omit<
  BaseProps<HTMLDivElement>,
  'children'
> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Label text for the field (always rendered for accessibility).
   */
  label: string;
  /**
   * Whether to visually hide the label and description (still accessible to screen readers).
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Description text displayed between the label and input.
   * Hidden when isLabelHidden is true.
   */
  description?: string;
  /**
   * ID of the input element this label points AT (used as the label's
   * `htmlFor`). This is the id of the *control*, not of the label element —
   * see `labelID` for the latter.
   */
  inputID: string;
  /**
   * The `id` applied TO the label element itself (distinct from `inputID`,
   * which is the control the label points at). A grouping control
   * (radiogroup, checkbox group) references this via `aria-labelledby` to take
   * the label as its accessible name. Pair with `isGroupLabel`.
   */
  labelID?: string;
  /**
   * When the field wraps a group of controls rather than a single input, set
   * this so the label renders as a non-`<label>` element (a `<span>`): a
   * `<label>` semantically names one control and can't be associated with a
   * group. Pair with `labelID` + `aria-labelledby` on the group.
   * @default false
   */
  isGroupLabel?: boolean;
  /**
   * ID for the description element (use for aria-describedby on the input).
   */
  descriptionID?: string;
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
   * Whether the associated input is disabled.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Icon to display before the label text.
   */
  labelIcon?: ReactNode | IconType;
  /**
   * Status indicator for the field.
   * When set with a message, displays a colored message box below the input.
   */
  status?: FieldStatusInput;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * How the status message is rendered relative to the input.
   * - 'attached': Status sits directly below the input (default, for bordered inputs)
   * - 'detached': Status is a separate element below the field (for checkboxes, switches, sliders)
   * - 'tooltip': No message box; the input surfaces status through a tooltip on its on-field icon
   * @default 'attached'
   */
  statusVariant?: FieldStatusVariant;
  /**
   * Width of the field. Numbers are treated as pixels, strings are used as-is
   * (e.g. `'100%'`). Sizes the whole field — label, control, and status — so
   * the control and its surrounding chrome stay aligned. Prefer this over
   * setting `width` via `xstyle`/`className`/`style`, which only size the inner
   * control box and leave the label and status at their natural width.
   */
  width?: SizeValue;
  /**
   * The input or control to render inside the field.
   */
  children: ReactNode;
}

/**
 * A form field wrapper that provides label and description.
 *
 * @example
 * ```
 * const id = useId();
 * const descID = useId();
 * <Field label="Email" description="We'll never share your email" inputID={id} descriptionID={descID}>
 *   <input id={id} aria-describedby={descID} />
 * </Field>
 * ```
 */
export function Field({
  label,
  isLabelHidden = false,
  description,
  inputID,
  labelID,
  isGroupLabel = false,
  descriptionID,
  isOptional = false,
  isRequired = false,
  isDisabled = false,
  labelIcon,
  status,
  labelTooltip,
  statusVariant = 'attached',
  width,
  xstyle,
  children,
  className,
  style,
  ref,
  ...props
}: FieldProps) {
  const {direction} = use(FormLayoutContext);
  const isHorizontalLabels = direction === 'horizontal-labels';

  const resolvedDescriptionID =
    descriptionID ?? (description ? `${inputID}-desc` : undefined);
  const resolvedMessageID =
    status?.messageID ?? (status?.message ? `${inputID}-status` : undefined);

  useDevWarning(
    'Field',
    'isOptional and isRequired are mutually exclusive. isOptional takes precedence.',
    isOptional && isRequired,
  );

  const labelNode = (
    <FieldLabel
      label={label}
      inputID={inputID}
      labelID={labelID}
      isGroupLabel={isGroupLabel}
      isLabelHidden={isLabelHidden}
      isDisabled={isDisabled}
      isOptional={isOptional}
      isRequired={isRequired}
      labelIcon={labelIcon}
      labelTooltip={labelTooltip}
      description={isHorizontalLabels ? undefined : description}
      descriptionID={isHorizontalLabels ? undefined : resolvedDescriptionID}
    />
  );

  // The 'tooltip' variant surfaces status through the input's on-field icon
  // tooltip, so Field renders no message box for it. Without a FieldStatus
  // nothing would speak the message, so Field announces it on the same
  // channel and timing FieldStatus uses: placement changes where the message
  // is shown, not whether a screen-reader user hears it.
  useFieldStatusAnnouncement(
    statusVariant === 'tooltip' ? status?.message : undefined,
    status?.type,
  );
  const statusNode =
    status?.message && statusVariant !== 'tooltip' ? (
      <FieldStatus
        type={status.type}
        message={status.message}
        id={resolvedMessageID}
        variant={statusVariant}
        xstyle={
          statusVariant === 'attached' ? styles.attachedStatusLayer : undefined
        }
      />
    ) : null;

  // ─── Horizontal-labels mode ───────────────────────────────────────────
  // Use display:contents so the parent grid's `auto 1fr` columns place
  // the label in column 1 and the input group in column 2. Description
  // and status are grouped with the input in column 2.
  // The label wrapper gets top padding to align label text with input text.
  if (isHorizontalLabels) {
    return (
      <div
        ref={ref}
        {...props}
        {...mergeProps(
          themeProps('field', {layout: 'horizontal-labels'}),
          stylex.props(styles.horizontalLabels, xstyle),
          className,
          style,
        )}>
        <div {...stylex.props(styles.horizontalLabelAlign)}>{labelNode}</div>
        <div {...stylex.props(styles.inputStatusWrapper)}>
          {description &&
            (isLabelHidden ? (
              <VisuallyHidden id={resolvedDescriptionID}>
                {description}
              </VisuallyHidden>
            ) : (
              <Text
                type="supporting"
                display="block"
                id={resolvedDescriptionID}>
                {description}
              </Text>
            ))}
          {children}
          {statusNode}
        </div>
      </div>
    );
  }

  // ─── Default mode (vertical / horizontal) ─────────────────────────────
  return (
    <div
      ref={ref}
      {...mergeProps(
        themeProps('field'),
        stylex.props(
          styles.container,
          !isLabelHidden && styles.containerGap,
          width != null && dynamicStyles.width(width),
          xstyle,
        ),
        className,
        style,
      )}
      {...props}>
      {labelNode}
      {statusVariant === 'attached' ? (
        <div {...stylex.props(styles.inputStatusWrapper)}>
          {children}
          {statusNode}
        </div>
      ) : (
        <>
          {children}
          {statusNode}
        </>
      )}
    </div>
  );
}

Field.displayName = 'Field';
