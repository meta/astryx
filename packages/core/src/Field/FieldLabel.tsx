// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file FieldLabel.tsx
 * @input Uses React, Icon, IconType, InfoTip, useComponentTranslator, useResolvedOptionality
 * @output Exports FieldLabel component, FieldLabelProps
 * @position Core label implementation; used by Field, CheckboxInput, Switch
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Field/Field.doc.mjs (props table, features, implementation notes)
 * - /packages/core/src/Field/index.ts (exports if types change)
 * - /packages/core/src/FormLayout/FormLayoutContext.ts (defaultOptionality drives the indicator)
 * - /packages/cli/assets/templates/blocks/components/Field/ (showcase blocks)
 * - /packages/core/locales/en.json (@astryx.field.required / @astryx.field.optional / @astryx.field.labelTooltip)
 */

import {useMemo, useRef, type ReactNode, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {mergeProps} from '../utils/mergeProps';

import {
  colorVars,
  fontWeightVars,
  spacingVars,
  typographyVars,
  typeScaleVars,
} from '../theme/tokens.stylex';
import {renderIconSlot} from '../Icon/Icon';
import type {IconType} from '../Icon';
import {InfoTip} from '../InfoTip/InfoTip';
import {themeProps} from '../utils/themeProps';
import {withTextDirection} from '../utils/textDirection';
import {useInputContainer} from '../hooks/useInputContainer';
import {useResolvedOptionality} from '../hooks/useResolvedRequired';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../i18n/useComponentTranslator';
import english from '../i18n/generated-english/Field/FieldLabel.generated';

registerEnglishFallback(english);

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
  // A button inside a label also activates the label's control, so the info
  // button sits outside it, in one row with the label.
  labelRow: {
    display: 'inline-flex',
    alignItems: 'center',
    // In a block label cell, keep the row's top on the cell's top, not on a
    // text baseline.
    verticalAlign: 'top',
    gap: spacingVars['--spacing-1'],
  },
  // With a hidden label the row takes no slot in the caller's layout.
  labelRowHidden: {
    display: 'contents',
  },
  // A hidden label's info button takes no layout slot. While it has keyboard
  // focus, it moves into flow above the control. There nothing covers or clips
  // it. It stays positioned, because InfoTip's touch band needs a positioned
  // host.
  infoTipHidden: {
    position: {default: 'absolute', ':focus-visible': 'relative'},
    alignSelf: 'flex-start',
    clip: {default: 'rect(0, 0, 0, 0)', ':focus-visible': 'auto'},
    overflow: {default: 'hidden', ':focus-visible': 'visible'},
    whiteSpace: 'nowrap',
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
   * Help text for an info button after the label, named "About {label}".
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
  const t = useComponentTranslator();
  // The visible indicator only; each control resolves its own `aria-required`
  // so the unmarked majority is still announced.
  const {showsRequiredMarker: showRequired, showsOptionalMarker: showOptional} =
    useResolvedOptionality({isRequired, isOptional});
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
  // Plain text with no right-to-left letter keeps its written order on a
  // right-to-left page. The direction goes on an inner span, so the label's
  // alignment and its marker still follow the page.
  const labelText = withTextDirection(label);
  const descriptionText = withTextDirection(description);
  const labelContent = (
    <>
      {labelIcon && renderIconSlot(labelIcon, {size: 'sm', color: 'inherit'})}
      {labelText}
      {statusText && (
        <span {...stylex.props(styles.optionalRequired)}>
          <span aria-hidden="true"> ∙ </span>
          {statusText}
        </span>
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

  const labelWithHelp = labelTooltip ? (
    <span
      {...stylex.props(
        styles.labelRow,
        isLabelHidden && styles.labelRowHidden,
      )}>
      {labelElement}
      <InfoTip
        content={labelTooltip}
        label={t('@astryx.field.labelTooltip', {label})}
        xstyle={isLabelHidden ? styles.infoTipHidden : undefined}
      />
    </span>
  ) : (
    labelElement
  );

  // Without a description, preserve the original public DOM: the label itself
  // remains the caller's flex/grid item and its layout overrides apply there.
  if (!description) {
    return labelWithHelp;
  }

  return (
    <div
      {...stylex.props(
        styles.labelGroup,
        isLabelHidden && styles.labelGroupHidden,
      )}>
      {labelWithHelp}
      <span
        ref={forwardsDescriptionClick ? descriptionRef : undefined}
        id={descriptionID}
        {...(forwardsDescriptionClick ? descriptionClickProps : undefined)}
        {...stylex.props(
          styles.description,
          forwardsDescriptionClick && styles.descriptionClickable,
          isLabelHidden && styles.srOnly,
        )}>
        {descriptionText}
      </span>
    </div>
  );
}

FieldLabel.displayName = 'FieldLabel';
