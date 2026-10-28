// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FieldLabel.tsx
 * @input Uses React, Icon, IconType, useTranslator, FormLayoutContext
 * @output Exports FieldLabel component, FieldLabelProps
 * @position Core label implementation; used by Field, CheckboxInput, Switch
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Field/Field.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Field/index.ts (exports if types change)
 * - /packages/core/src/FormLayout/FormLayoutContext.ts (defaultOptionality drives the indicator)
 * - /packages/cli/assets/templates/blocks/components/Field/ (showcase blocks)
 * - /packages/core/locales/en.json (@astryx.field.required / @astryx.field.optional)
 */

import {use, useMemo, useRef, type ReactNode, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils';

import {
  colorVars,
  fontWeightVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {Icon, renderIconSlot, type IconType} from '../Icon';
import {Tooltip} from '../Tooltip';
import {useTranslator} from '../i18n';
import {themeProps} from '../utils/themeProps';
import {useInputContainer} from '../hooks/useInputContainer';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';

const styles = stylex.create({
  // The label and its description read as a single block, with no space
  // between them. They need a wrapper of their own to get that: as bare
  // siblings they pick up the column gap of whichever caller holds them
  // (Field, CheckboxInput, Switch), which is the spacing meant to separate
  // the label group from the control below it.
  labelGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  // A hidden label group must not take a slot in the caller's layout, or an
  // empty box would draw the caller's gap around nothing. Dropping the
  // wrapper box leaves the sr-only children out of flow directly under the
  // caller, so the group occupies no space at all.
  labelGroupHidden: {
    display: 'contents',
  },
  label: {
    display: 'flex',
    alignItems: 'center',
    gap: spacingVars['--spacing-1'],
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-label-size'],
    lineHeight: typeScaleVars['--text-label-leading'],
    fontWeight: fontWeightVars['--font-weight-medium'],
    color: colorVars['--color-text-secondary'],
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
  labelDisabled: {
    color: colorVars['--color-text-disabled'],
    cursor: 'default',
  },
  srOnly: {
    borderStyle: 'none',
    clip: 'rect(0, 0, 0, 0)',
    height: 1,
    insetInlineStart: 0,
    margin: -1,
    overflow: 'hidden',
    padding: 0,
    pointerEvents: 'none',
    position: 'absolute',
    top: 0,
    userSelect: 'none',
    whiteSpace: 'nowrap',
    width: 1,
  },
  optionalRequired: {
    fontWeight: fontWeightVars['--font-weight-normal'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    color: colorVars['--color-text-secondary'],
  },
  description: {
    fontFamily: typographyVars['--font-family-body'],
    fontSize: typeScaleVars['--text-supporting-size'],
    lineHeight: typeScaleVars['--text-supporting-leading'],
    fontWeight: fontWeightVars['--font-weight-normal'],
    color: colorVars['--color-text-secondary'],
  },
  // When the description forwards clicks to a click-activatable control
  // (checkbox/switch), it reads as part of the same hit target as the label.
  descriptionClickable: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

export interface FieldLabelProps extends BaseProps<HTMLLabelElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLLabelElement>;
  /**
   * Label text (always rendered for accessibility).
   */
  label: string;
  /**
   * ID of the input element this label points AT (rendered as `htmlFor` on the
   * label). This is *not* the id of the label element itself — see
   * `labelID` for that.
   */
  inputID: string;
  /**
   * The `id` applied TO the label element itself (not the element it points
   * at — that's `inputID`). A grouping control (e.g. `role="radiogroup"`) can
   * reference this via `aria-labelledby` to take the label as its accessible
   * name.
   */
  labelID?: string;
  /**
   * When true, the field wraps a *group* of controls (e.g. a radiogroup)
   * rather than a single input. In that case the label is rendered as a
   * `<span>` instead of a `<label>` — a `<label>` semantically names one form
   * control and can't be associated with a group, so it must not be a literal
   * label element. The group takes the label as its name via
   * `labelID` + `aria-labelledby`.
   * @default false
   */
  isGroupLabel?: boolean;
  /**
   * Whether to visually hide the label and description (still accessible
   * to screen readers). When hidden, the entire label group is rendered
   * with sr-only styles and takes up no layout space.
   * @default false
   */
  isLabelHidden?: boolean;
  /**
   * Whether the associated input is disabled.
   * @default false
   */
  isDisabled?: boolean;
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
   * Icon to display before the label text.
   */
  labelIcon?: ReactNode | IconType;
  /**
   * Tooltip text to display in an info icon at the end of the label.
   */
  labelTooltip?: string;
  /**
   * Description displayed below the label. Hidden along with the label
   * when isLabelHidden is true.
   */
  description?: ReactNode;
  /**
   * ID for the description element (for aria-describedby on the input).
   */
  descriptionID?: string;
}

/**
 * Label + description group for form fields. Handles sr-only hiding,
 * disabled styling, optional/required indicators, icons, and tooltips.
 *
 * When `isLabelHidden` is true the entire group uses sr-only positioning
 * so it takes up zero layout space — no wrapper div left in flow.
 *
 * @example
 * ```
 * <FieldLabel label="Email" inputID={inputId} description="We won't share it" />
 * <FieldLabel label="Search" inputID={inputId} isLabelHidden />
 * ```
 */
export function FieldLabel({
  label,
  inputID,
  labelID,
  isGroupLabel = false,
  isLabelHidden = false,
  isDisabled = false,
  isOptional = false,
  isRequired = false,
  labelIcon,
  labelTooltip,
  description,
  descriptionID,
  className,
  style,
  xstyle,
  ref,
  ...rest
}: FieldLabelProps) {
  const t = useTranslator();
  const {defaultOptionality} = use(FormLayoutContext);

  // A form-level `defaultOptionality` means "only the exception is marked": a
  // field that merely restates the form's default shows no indicator, and only
  // a deviation from it does. This is the *visible indicator* only; the
  // matching `aria-required` is resolved on each control (see
  // useResolvedRequired) so the unmarked majority is still announced.
  //
  //   defaultOptionality  isRequired            isOptional
  //   'optional'          → required indicator  → (matches default, hidden)
  //   'required'          → (matches, hidden)   → optional indicator
  //   unset               → required indicator  → optional indicator
  const showRequired = isRequired && defaultOptionality !== 'required';
  const showOptional = isOptional && defaultOptionality !== 'optional';
  const statusText = showOptional
    ? t('@astryx.field.optional')
    : showRequired
      ? t('@astryx.field.required')
      : null;

  // A group label (e.g. for a radiogroup) must not be a literal `<label>`
  // element: a `<label>` semantically names a single form control and can't be
  // associated with a group. Render it as a `<span>` instead, keeping all the
  // label styling and slots. The group references it via `aria-labelledby`.
  const LabelElement = isGroupLabel ? 'span' : 'label';

  // Clicking the description forwards to the associated control, so the whole
  // label area (label text + description) is one hit target — mirroring native
  // `<label>` click behavior, which the description can't get from `htmlFor`
  // because it stays a sibling `<span>` (nesting it in the `<label>` would fold
  // it into the control's accessible name and double-announce it alongside
  // `aria-describedby`). A group label names a group, not one control, so it
  // has nothing to forward to.
  const forwardsDescriptionClick = !isGroupLabel && inputID != null;

  // Reuse `useInputContainer` — the same hook input wrappers use to forward
  // clicks on non-interactive chrome to their control. It skips nested
  // interactive content (a link/button inside a ReactNode description) and
  // guards against forwarding during text selection, so the description needs
  // no bespoke click logic. The "input" is resolved from `inputID` lazily via
  // a ref-shaped object, since FieldLabel points at the control by id rather
  // than holding a ref to it.
  const descriptionRef = useRef<HTMLSpanElement>(null);
  const controlRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return inputID == null
          ? null
          : (descriptionRef.current?.ownerDocument.getElementById(inputID) ??
              null);
      },
      set current(_value) {},
    }),
    [inputID],
  );
  const descriptionClickProps = useInputContainer({
    containerRef: descriptionRef,
    inputRef: controlRef,
    disabled: !forwardsDescriptionClick,
  });

  const labelContent = (
    <>
      {labelIcon && renderIconSlot(labelIcon, {size: 'sm', color: 'inherit'})}
      {label}
      {statusText && (
        <span {...stylex.props(styles.optionalRequired)}>
          <span aria-hidden="true"> ∙ </span>
          {statusText}
        </span>
      )}
      {labelTooltip && (
        <Tooltip content={labelTooltip} placement="above">
          <Icon icon="info" size="sm" color="inherit" />
        </Tooltip>
      )}
    </>
  );

  const labelElement = (
    <LabelElement
      ref={ref}
      id={labelID}
      // `htmlFor` only applies to a real `<label>` associating with a single
      // control; a group label (span) has no `htmlFor`.
      htmlFor={isGroupLabel ? undefined : inputID}
      {...rest}
      {...mergeProps(
        // A control that knows what kind of label this is passes its own
        // target down (CheckboxInput's `checkbox-label`, Switch's
        // `switch-label`); it arrives as `className` and composes onto this
        // one. The label itself does not describe its own placement — it
        // cannot know it, and any encoding it guessed would be wrong for a
        // caller that arranges labels differently (Field's
        // `horizontal-labels`).
        themeProps('field-label'),
        stylex.props(
          styles.label,
          isDisabled && styles.labelDisabled,
          isLabelHidden && styles.srOnly,
          xstyle,
        ),
        className,
        style,
      )}>
      {labelContent}
    </LabelElement>
  );

  // Without a description, preserve the original public DOM: the label itself
  // remains the caller's flex/grid item and its layout overrides apply there.
  if (!description) {
    return labelElement;
  }

  return (
    <div
      {...stylex.props(
        styles.labelGroup,
        isLabelHidden && styles.labelGroupHidden,
      )}>
      {labelElement}
      <span
        ref={forwardsDescriptionClick ? descriptionRef : undefined}
        id={descriptionID}
        {...(forwardsDescriptionClick ? descriptionClickProps : undefined)}
        {...stylex.props(
          styles.description,
          forwardsDescriptionClick && styles.descriptionClickable,
          isLabelHidden && styles.srOnly,
        )}>
        {description}
      </span>
    </div>
  );
}

FieldLabel.displayName = 'FieldLabel';
