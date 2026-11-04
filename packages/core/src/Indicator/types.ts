// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input None (pure type definitions)
 * @output The indicator contract: families, states, props, names, registry
 * @position Type foundation for stateful control visuals
 *
 * An **indicator** is a decorative visual that expresses a piece of component
 * state: the box a checkbox draws, the circle a radio draws, the mark on a
 * chosen list option. The owning component keeps the input, role, accessible
 * name, focus, and keyboard behavior; the indicator turns state into a picture.
 *
 * Componentizing them buys three things a theme could not otherwise have:
 *
 *   1. **Theme it** — an indicator renders stable `astryx-*` class targets, so
 *      `defineTheme({components})` restyles it like any other component, in one
 *      place rather than per host component.
 *   2. **Swizzle it** — `astryx swizzle <Name>` copies the source to own.
 *   3. **Replace it** — `defineTheme({indicators})` swaps in another component
 *      by name, and every component that renders that indicator follows. A
 *      product that wants radio visuals for single selection replaces `check`.
 *
 * Indicators come in **families**, and a family fixes the state space. That is
 * what lets one mechanism serve semantics as different as "is this option
 * chosen" and "are several of these chosen" without either pretending to be
 * the other, and without a shared enum that would typecheck `indeterminate` on
 * a radio.
 *
 * Each family's vocabulary is the one the accessibility layer already uses, so
 * a component passing state down says the same word its ARIA attribute says.
 * Sharing one enum across families was measured and rejected (#4831): it
 * produced call sites reading `aria-expanded={isOpen}` beside
 * `state={isOpen ? 'on' : 'off'}`.
 */

import type {ComponentType, ReactNode, Ref} from 'react';
import type {BaseProps} from '../BaseProps';

/**
 * The indicator families, each mapped to the states it can express.
 *
 * Single and multi selection are separate families because their state spaces
 * genuinely differ: `aria-checked` is `true|false` for a radio and
 * `true|false|mixed` for a checkbox. Keeping them apart is what makes a
 * replacement type-checkable — a checkbox visual cannot stand in where only
 * two states are ever passed, and a radio cannot be asked to draw a partial
 * state it has no picture for.
 *
 * Adding a family is additive: declare it here, then declare indicators of
 * that family in {@link IndicatorMap}. Packages outside core can contribute
 * families through module augmentation.
 */
export interface IndicatorFamilyMap {
  /** Is this one thing chosen? Radios, and the mark on a selected option. */
  singleSelection: 'unchecked' | 'checked';
  /** Which of these are chosen? Checkboxes, including the partial state. */
  multiSelection: 'unchecked' | 'checked' | 'indeterminate';
}

export type IndicatorFamily = keyof IndicatorFamilyMap & string;

/** The states an indicator of family `F` can be asked to draw. */
export type IndicatorState<F extends IndicatorFamily = IndicatorFamily> =
  IndicatorFamilyMap[F];

/** Indicator size scale — matches the control sizes of the owning inputs. */
export type IndicatorSize = 'sm' | 'md';

/**
 * Which edge of its row an indicator sits on.
 *
 * Logical, not physical: `start` is the left edge in LTR and the right edge in
 * RTL. Owned by the host component, not by the indicator — an indicator draws a
 * picture and has no say in where the row puts it — which is why this is a prop
 * on the components that lay out rows rather than part of
 * {@link IndicatorProps}.
 */
export type IndicatorPosition = 'start' | 'end';

/**
 * Props every indicator accepts.
 *
 * Indicators are **decorative**: they render `aria-hidden` visuals and own no
 * role, focus, keyboard handling, or state. The component that renders one
 * (CheckboxInput, RadioListItem, a listbox option) keeps all of that. An
 * indicator's only job is to turn `state` into a picture.
 *
 * The a11y props are omitted from this interface rather than left to
 * convention: un-hiding an indicator has it announced next to the control that
 * owns the accessible name — the same thing said twice (#4918). A replacement
 * that genuinely needs announcing is not an indicator; name the owning control.
 *
 * `tabIndex` is omitted for the same reason, one step on: the element is
 * unconditionally `aria-hidden`, so a tab stop on it is a focusable node inside
 * a hidden subtree. Measured with axe in real Chromium: 0 `aria-hidden-focus`
 * violations becomes 1 the moment it is forwarded.
 *
 * The omission is only half enforceable, and it is worth knowing which half.
 * TypeScript exempts JSX attribute names that are not valid JS identifiers from
 * excess-property checking, so a LITERAL `role=` is a compile error while
 * `aria-hidden` and `aria-label` are not — and a spread (`{...props}`, the
 * ordinary host idiom) bypasses the check for every member, `role` included.
 * Measured, not assumed. So the components emit their own `aria-hidden` AFTER
 * `{...rest}`; that ordering, not the type, prevents a caller from un-hiding the
 * root. A spread can still forward `tabIndex`, so callers must keep focus props
 * on the owning control; the supported typed indicator API rejects them. Nothing
 * else is stripped — a forwarded `aria-label` remains inert inside the hidden
 * subtree.
 *
 * Interaction state is deliberately *not* a prop. Hover and focus reach an
 * indicator through the CSS ancestor marker ({@link indicatorScope}) applied
 * by its owner, so a row hover tints the control without anyone threading a
 * boolean through React — and an owner that should not tint its indicator
 * simply does not apply the marker.
 */
export interface IndicatorProps<
  F extends IndicatorFamily = IndicatorFamily,
> extends Omit<
  BaseProps<HTMLSpanElement>,
  'aria-hidden' | 'role' | 'aria-label' | 'aria-labelledby' | 'tabIndex'
> {
  /** Ref forwarded to the indicator's root element. */
  ref?: Ref<HTMLSpanElement>;
  /** Which state to draw. The state space is fixed by the family. */
  state: IndicatorState<F>;
  /**
   * Control size.
   * @default 'md'
   */
  size?: IndicatorSize;
  /**
   * Whether the owning control is disabled. Purely visual — the owner still
   * owns the actual disabled semantics.
   * @default false
   */
  isDisabled?: boolean;
  /**
   * Content rendered inside the indicator chrome *instead of* the state mark.
   * CheckboxInput uses this to show a loading Spinner inside the box while a
   * change action is pending.
   */
  children?: ReactNode;
}

/** An indicator is any component accepting {@link IndicatorProps} of its family. */
export type IndicatorComponent<F extends IndicatorFamily = IndicatorFamily> =
  ComponentType<IndicatorProps<F>>;

/**
 * The named indicators a theme can replace, each mapped to its family.
 *
 * The name is what a theme addresses, and what every component renders
 * through — so replacing `check` reaches every single-selection mark at once,
 * which is the point.
 *
 * Packages outside core can contribute their own through module augmentation.
 * Core ships no default for a name it does not know, so the package that adds
 * the name owns its default — `getIndicator`/`useIndicator` return
 * `| undefined` for it, and the call site supplies the fallback:
 *
 * ```ts
 * declare module '@astryxdesign/core/Indicator' {
 *   interface IndicatorMap {
 *     'brand-star': 'singleSelection';
 *   }
 * }
 *
 * const Star = useIndicator('brand-star') ?? BrandStar;
 * ```
 */
export interface IndicatorMap {
  /** The mark on a chosen option — a checkmark by default. */
  check: 'singleSelection';
  /** The filled circle of a radio control. */
  radio: 'singleSelection';
  /** The box of a checkbox control, including its partial state. */
  checkbox: 'multiSelection';
}

export type IndicatorName = keyof IndicatorMap & string;

/** The indicator names belonging to family `F`. */
export type IndicatorNameOfFamily<F extends IndicatorFamily> = {
  [N in IndicatorName]: IndicatorMap[N] extends F ? N : never;
}[IndicatorName];

/**
 * Theme-provided indicator overrides, keyed by indicator name.
 *
 * Family-checked: each entry must accept the state space of that indicator's
 * family, so a replacement cannot be written against the wrong states. A
 * `check` replacement that only handles `collapsed`/`expanded`, or a `radio`
 * replacement expecting `indeterminate`, is a type error rather than a
 * runtime surprise.
 */
export type IndicatorRegistry = {
  [N in IndicatorName]?: IndicatorComponent<IndicatorMap[N]>;
};
