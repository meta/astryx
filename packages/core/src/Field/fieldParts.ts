// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file fieldParts.ts
 * @input Uses BaseProps, FormLayoutContext, InputGroupContext, useDevWarning
 * @output Exports FieldInputBaseProps, the container and control part style
 *   props, and useFieldInputStyling
 * @position Shared styling contract for every Field-composed input
 *   (family:input-fields FR10): base props reach the primary semantic control,
 *   there is no root `xstyle`/`className`/`style`, `container*` styles the Field
 *   box where one renders, and `control*` styles the visual control box.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Field/fieldInputFamily.test.tsx (family registry and type checks)
 * - /packages/core/src/Field/index.ts (type exports)
 */

import {type CSSProperties, use} from 'react';
import type {StyleXStyles} from '@stylexjs/stylex';
import type {BaseProps} from '../BaseProps';
import {FormLayoutContext} from '../FormLayout/FormLayoutContext';
import {useInputGroup} from '../InputGroup/InputGroupContext';
import {useDevWarning} from '../hooks/useDevWarning';

/** Root styling props a Field-composed input does not accept. */
export type FieldInputForbiddenStyleProp = 'xstyle' | 'className' | 'style';

/** Styling for the Field box (label, control, and status together). */
// A prop mixin for Field-composed inputs, not a component props type.
// eslint-disable-next-line @astryx/require-base-props, @astryx/require-ref-prop
export interface FieldContainerStyleProps {
  /**
   * StyleX styles for the field container (the Field box around the label,
   * control, and status). Has no effect where no Field box renders: inside
   * InputGroup (style the InputGroup instead) and in a `horizontal-labels`
   * FormLayout.
   */
  containerXstyle?: StyleXStyles;
  /** Class name for the field container. Same targeting as `containerXstyle`. */
  containerClassName?: string;
  /** Inline styles for the field container. Same targeting as `containerXstyle`. */
  containerStyle?: CSSProperties;
}

/** Styling for the visual control box (border, background, icons, end controls). */
// A prop mixin for Field-composed inputs, not a component props type.
// eslint-disable-next-line @astryx/require-base-props, @astryx/require-ref-prop
export interface FieldControlStyleProps {
  /**
   * StyleX styles for the visual control box: the element that paints the
   * field border and background and holds its icons and end controls. Never
   * the native input.
   */
  controlXstyle?: StyleXStyles;
  /** Class name for the visual control box. */
  controlClassName?: string;
  /** Inline styles for the visual control box. */
  controlStyle?: CSSProperties;
}

export interface FieldPartStyleProps
  extends FieldContainerStyleProps, FieldControlStyleProps {}

/**
 * BaseProps for a Field-composed input. Root `xstyle`, `className`, and `style`
 * are omitted, so passing one is a type error; style the field through
 * `container*` and the control box through `control*`.
 */
export type FieldInputBaseProps<T extends HTMLElement = HTMLElement> = Omit<
  BaseProps<T>,
  FieldInputForbiddenStyleProp
> &
  FieldPartStyleProps;

/** Styling props to pass to Field's own `xstyle`/`className`/`style`. */
export interface FieldContainerTarget {
  xstyle?: StyleXStyles;
  className?: string;
  style?: CSSProperties;
}

export interface FieldInputStyling<R> {
  /** The caller's remaining props, with any untyped root styling removed. */
  rest: R;
  /**
   * Whether a Field box renders: false inside InputGroup and in a
   * `horizontal-labels` FormLayout, where Field lays out its children in the
   * form's columns without a box of its own.
   */
  hasFieldBox: boolean;
  /** Spread onto `<Field>`; empty where no Field box renders. */
  container: FieldContainerTarget;
}

const ROOT_STYLING_MESSAGE =
  '`xstyle`, `className`, and `style` are not supported on Field-composed inputs and were ignored. ' +
  'Style the field with `containerXstyle`/`containerClassName`/`containerStyle` and the control box with ' +
  '`controlXstyle`/`controlClassName`/`controlStyle`. `astryx upgrade` rewrites existing usage.';

const CONTAINER_WITHOUT_FIELD_MESSAGE =
  '`containerXstyle`/`containerClassName`/`containerStyle` have no effect here because no Field box renders ' +
  '(inside InputGroup or a `horizontal-labels` FormLayout). Inside InputGroup, style the InputGroup.';

/**
 * Resolve FR10 styling for a Field-composed input.
 *
 * Strips root `xstyle`/`className`/`style` that an untyped caller passed (they
 * would otherwise spread onto the native control) and warns once in
 * development. Returns the `container*` props to forward to Field only when a
 * Field box renders, and warns once when they are passed where none does.
 * `control*` props are the caller's to apply to the control box directly.
 *
 * @example
 * ```
 * const {rest, container} = useFieldInputStyling('TextInput', restProps, {
 *   containerXstyle, containerClassName, containerStyle,
 * });
 * ```
 */
export function useFieldInputStyling<R extends object>(
  component: string,
  restProps: R,
  containerProps: FieldContainerStyleProps,
): FieldInputStyling<R> {
  const inputGroup = useInputGroup();
  const {direction} = use(FormLayoutContext);
  const hasFieldBox = inputGroup == null && direction !== 'horizontal-labels';

  const untyped = restProps as R & {
    xstyle?: unknown;
    className?: unknown;
    style?: unknown;
  };
  const hasRootStyling =
    untyped.xstyle != null ||
    untyped.className != null ||
    untyped.style != null;
  let rest = restProps;
  if (hasRootStyling) {
    const {
      xstyle: _xstyle,
      className: _className,
      style: _style,
      ...remaining
    } = untyped;
    rest = remaining as R;
  }
  useDevWarning(component, ROOT_STYLING_MESSAGE, hasRootStyling);

  const {containerXstyle, containerClassName, containerStyle} = containerProps;
  const hasContainerStyling =
    containerXstyle != null ||
    containerClassName != null ||
    containerStyle != null;
  useDevWarning(
    component,
    CONTAINER_WITHOUT_FIELD_MESSAGE,
    hasContainerStyling && !hasFieldBox,
  );

  return {
    rest,
    hasFieldBox,
    container: hasFieldBox
      ? {
          xstyle: containerXstyle,
          className: containerClassName,
          style: containerStyle,
        }
      : {},
  };
}
