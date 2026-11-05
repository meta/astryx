// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publicStyleXNamespaces.test.ts
 * @input Every `.stylex` subpath that @astryxdesign/core exports
 * @output Every public style namespace has a CSS value type for each property,
 *   and each one fits the use it supports: a component's `xstyle`, or
 *   `stylex.props` for a namespace that sets only custom properties or a value
 *   outside StyleX's CSS types. The type check is the proof: `pnpm typecheck`
 *   compiles this file. The runtime test keeps the checked list equal to the
 *   exported subpaths and their style namespaces.
 * @position Type test over the public StyleX exports of packages/core
 */

import fs from 'node:fs';
import path from 'node:path';
import type * as stylex from '@stylexjs/stylex';
import {describe, expect, expectTypeOf, it} from 'vitest';
import * as dateInputTokens from '@astryxdesign/core/DateInput/tokens.stylex';
import * as iconSize from '@astryxdesign/core/Icon/IconSize.stylex';
import * as indicatorMarkers from '@astryxdesign/core/Indicator/indicator.markers.stylex';
import * as layerAnimations from '@astryxdesign/core/Layer/layerAnimations.stylex';
import * as layerTextReset from '@astryxdesign/core/Layer/layerTextReset.stylex';
import * as layerViewportInset from '@astryxdesign/core/Layer/layerViewportInset.stylex';
import * as container from '@astryxdesign/core/Layout/container.stylex';
import * as edgeCompensation from '@astryxdesign/core/Layout/edgeCompensation.stylex';
import * as padding from '@astryxdesign/core/Layout/padding.stylex';
import * as navItemStyles from '@astryxdesign/core/NavItem/navItemStyles.stylex';
import * as selectorPresentation from '@astryxdesign/core/Selector/selectorPresentation.stylex';
import * as stack from '@astryxdesign/core/Stack/stack.stylex';
import * as stackItem from '@astryxdesign/core/Stack/stackItem.stylex';
import * as text from '@astryxdesign/core/Text/text.stylex';
import * as indicatorPress from '@astryxdesign/core/internal/indicatorPress.stylex';
import * as dataTokens from '@astryxdesign/core/theme/dataTokens.stylex';
import * as tokens from '@astryxdesign/core/theme/tokens.stylex';
import * as focusOutline from '@astryxdesign/core/utils/focusOutline.stylex';
import * as interactionOverlay from '@astryxdesign/core/utils/interactionOverlay.stylex';

/** The style namespaces that a component's `xstyle` accepts. */
type XstyleNamespaces = {
  iconBoxSizeStyles: typeof iconSize.iconBoxSizeStyles;
  iconSizeStyles: typeof iconSize.iconSizeStyles;
  layerAnimations: typeof layerAnimations.layerAnimations;
  layerTextReset: typeof layerTextReset.layerTextReset;
  edgeCompSlot: typeof edgeCompensation.edgeCompSlot;
  paddingBlockEndStyles: typeof padding.paddingBlockEndStyles;
  paddingBlockStartStyles: typeof padding.paddingBlockStartStyles;
  paddingBlockStyles: typeof padding.paddingBlockStyles;
  paddingInlineEndStyles: typeof padding.paddingInlineEndStyles;
  paddingInlineStartStyles: typeof padding.paddingInlineStartStyles;
  paddingInlineStyles: typeof padding.paddingInlineStyles;
  paddingStyles: typeof padding.paddingStyles;
  navItemStyles: typeof navItemStyles.navItemStyles;
  selectorPresentationStyles: typeof selectorPresentation.selectorPresentationStyles;
  capsizeStyles: typeof text.capsizeStyles;
  colorStyles: typeof text.colorStyles;
  decorationStyles: typeof text.decorationStyles;
  defaultWeightByTypeStyles: typeof text.defaultWeightByTypeStyles;
  justifyStyles: typeof text.justifyStyles;
  sizeByLevelStyles: typeof text.sizeByLevelStyles;
  sizeByTypeStyles: typeof text.sizeByTypeStyles;
  sizeStyles: typeof text.sizeStyles;
  tabularNumbersStyle: typeof text.tabularNumbersStyle;
  textWrapStyles: typeof text.textWrapStyles;
  truncationStyles: typeof text.truncationStyles;
  truncationTooltipStyles: typeof text.truncationTooltipStyles;
  weightStyles: typeof text.weightStyles;
  wordBreakStyles: typeof text.wordBreakStyles;
  focusOutlineStyles: typeof focusOutline.focusOutlineStyles;
  interactionOverlayStyles: typeof interactionOverlay.interactionOverlayStyles;
};

/**
 * The style namespaces that go through `stylex.props`, not `xstyle`. A style
 * that sets only custom properties shares no property with the `xstyle` type,
 * and `displayStyles` sets `overflowWrap` to a `var()`, which StyleX's
 * `overflowWrap` type does not list.
 */
type PropsOnlyNamespaces = {
  containerPaddingBlockEndVarStyles: typeof padding.containerPaddingBlockEndVarStyles;
  containerPaddingBlockStartVarStyles: typeof padding.containerPaddingBlockStartVarStyles;
  containerPaddingInlineEndVarStyles: typeof padding.containerPaddingInlineEndVarStyles;
  containerPaddingInlineStartVarStyles: typeof padding.containerPaddingInlineStartVarStyles;
  containerPaddingInlineVarStyles: typeof padding.containerPaddingInlineVarStyles;
  layoutPaddingOuterXVarStyles: typeof padding.layoutPaddingOuterXVarStyles;
  layoutPaddingOuterYVarStyles: typeof padding.layoutPaddingOuterYVarStyles;
  overlayPaddingReset: typeof padding.overlayPaddingReset;
  sectionPaddingPropagationStyles: typeof padding.sectionPaddingPropagationStyles;
  displayStyles: typeof text.displayStyles;
  focusOutlineStylesPublishedVars: Pick<
    typeof focusOutline.focusOutlineStyles,
    'publishFocusVisibleVars'
  >;
};

type AllNamespaces = XstyleNamespaces & PropsOnlyNamespaces;

/** A dynamic style is checked by the style its function returns. */
type StyleOf<Value> = Value extends (...args: never[]) => infer Result
  ? Result extends readonly [infer Style, ...unknown[]]
    ? Style
    : Result
  : Value;

/**
 * The properties of a style whose value type is `unknown`. StyleX infers
 * `unknown` for a property whose conditions are all attribute selectors.
 */
type UnknownValueProperties<Style> = {
  [Property in keyof Style]: Style[Property] extends {_value: infer Value}
    ? unknown extends Value
      ? Property
      : never
    : never;
}[keyof Style];

type KeysWithUnknownValues<Namespace> = {
  [Key in keyof Namespace]: UnknownValueProperties<StyleOf<Namespace[Key]>>;
}[keyof Namespace];

/** The keys of a namespace whose style does not fit `Target`. */
type KeysNotFitting<Namespace, Target> = {
  [Key in keyof Namespace]: StyleOf<Namespace[Key]> extends Target
    ? never
    : Key;
}[keyof Namespace];

/** One argument of `stylex.props`, as its declaration types it. */
type StylexPropsArgument = stylex.StyleXArray<
  | null
  | undefined
  | boolean
  | stylex.CompiledStyles
  | Readonly<[stylex.CompiledStyles, stylex.InlineStyles]>
>;

type NoKeys<Namespaces> = {[Name in keyof Namespaces]: never};

/**
 * The exported `.stylex` subpaths, each with the exports that `stylex.create`
 * made. A subpath with no style namespace exports only variables, constants,
 * a marker or style builders.
 */
const styleNamespacesBySubpath = {
  './DateInput/tokens.stylex': [],
  './Icon/IconSize.stylex': ['iconBoxSizeStyles', 'iconSizeStyles'],
  './Indicator/indicator.markers.stylex': [],
  './Layer/layerAnimations.stylex': ['layerAnimations'],
  './Layer/layerTextReset.stylex': ['layerTextReset'],
  './Layer/layerViewportInset.stylex': [],
  './Layout/container.stylex': [],
  './Layout/edgeCompensation.stylex': ['edgeCompSlot'],
  './Layout/padding.stylex': [
    'containerPaddingBlockEndVarStyles',
    'containerPaddingBlockStartVarStyles',
    'containerPaddingInlineEndVarStyles',
    'containerPaddingInlineStartVarStyles',
    'containerPaddingInlineVarStyles',
    'layoutPaddingOuterXVarStyles',
    'layoutPaddingOuterYVarStyles',
    'overlayPaddingReset',
    'paddingBlockEndStyles',
    'paddingBlockStartStyles',
    'paddingBlockStyles',
    'paddingInlineEndStyles',
    'paddingInlineStartStyles',
    'paddingInlineStyles',
    'paddingStyles',
    'sectionPaddingPropagationStyles',
  ],
  './NavItem/navItemStyles.stylex': ['navItemStyles'],
  './Selector/selectorPresentation.stylex': ['selectorPresentationStyles'],
  './Stack/stack.stylex': [],
  './Stack/stackItem.stylex': [],
  './Text/text.stylex': [
    'capsizeStyles',
    'colorStyles',
    'decorationStyles',
    'defaultWeightByTypeStyles',
    'displayStyles',
    'justifyStyles',
    'sizeByLevelStyles',
    'sizeByTypeStyles',
    'sizeStyles',
    'tabularNumbersStyle',
    'textWrapStyles',
    'truncationStyles',
    'truncationTooltipStyles',
    'weightStyles',
    'wordBreakStyles',
  ],
  './internal/indicatorPress.stylex': [],
  './theme/dataTokens.stylex': [],
  './theme/tokens.stylex': [],
  './utils/focusOutline.stylex': ['focusOutlineStyles'],
  './utils/interactionOverlay.stylex': ['interactionOverlayStyles'],
} as const;

const modulesBySubpath: Readonly<
  Record<keyof typeof styleNamespacesBySubpath, object>
> = {
  './DateInput/tokens.stylex': dateInputTokens,
  './Icon/IconSize.stylex': iconSize,
  './Indicator/indicator.markers.stylex': indicatorMarkers,
  './Layer/layerAnimations.stylex': layerAnimations,
  './Layer/layerTextReset.stylex': layerTextReset,
  './Layer/layerViewportInset.stylex': layerViewportInset,
  './Layout/container.stylex': container,
  './Layout/edgeCompensation.stylex': edgeCompensation,
  './Layout/padding.stylex': padding,
  './NavItem/navItemStyles.stylex': navItemStyles,
  './Selector/selectorPresentation.stylex': selectorPresentation,
  './Stack/stack.stylex': stack,
  './Stack/stackItem.stylex': stackItem,
  './Text/text.stylex': text,
  './internal/indicatorPress.stylex': indicatorPress,
  './theme/dataTokens.stylex': dataTokens,
  './theme/tokens.stylex': tokens,
  './utils/focusOutline.stylex': focusOutline,
  './utils/interactionOverlay.stylex': interactionOverlay,
};

function isCompiledStyle(value: unknown): boolean {
  return value != null && typeof value === 'object' && '$$css' in value;
}

/**
 * Whether a module export is a namespace that `stylex.create` made. Each value
 * is a compiled style, or a dynamic style: a function that returns a compiled
 * style and its inline styles. A builder object such as `focusOutlineProps`
 * holds functions that return props, so it does not match.
 */
function isStyleNamespace(value: unknown): boolean {
  if (value == null || typeof value !== 'object') {
    return false;
  }
  const styles: unknown[] = Object.values(value);
  return (
    styles.length > 0 &&
    styles.every(style => {
      if (typeof style !== 'function') {
        return isCompiledStyle(style);
      }
      const result: unknown = style('0');
      return Array.isArray(result) && isCompiledStyle(result[0]);
    })
  );
}

describe('public StyleX namespaces', () => {
  it('cover every exported .stylex subpath and style namespace', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as {exports: Record<string, unknown>};
    const stylexSubpaths = Object.keys(packageJson.exports)
      .filter(subpath => subpath.endsWith('.stylex'))
      .sort();
    expect(Object.keys(styleNamespacesBySubpath).sort()).toEqual(
      stylexSubpaths,
    );

    for (const [subpath, module] of Object.entries(modulesBySubpath)) {
      const namespaces = Object.entries(module)
        .filter(([, value]) => isStyleNamespace(value))
        .map(([name]) => name)
        .sort();
      expect({subpath, namespaces}).toEqual({
        subpath,
        namespaces: [
          ...styleNamespacesBySubpath[
            subpath as keyof typeof styleNamespacesBySubpath
          ],
        ].sort(),
      });
    }

    type CheckedNames = Exclude<
      keyof AllNamespaces,
      'focusOutlineStylesPublishedVars'
    >;
    type ListedNames =
      (typeof styleNamespacesBySubpath)[keyof typeof styleNamespacesBySubpath][number];
    expectTypeOf<CheckedNames>().toEqualTypeOf<ListedNames>();
  });

  it('give every property a CSS value type', () => {
    expectTypeOf<{
      [Name in keyof AllNamespaces]: KeysWithUnknownValues<AllNamespaces[Name]>;
    }>().toEqualTypeOf<NoKeys<AllNamespaces>>();
  });

  it('fit the xstyle prop of a component', () => {
    expectTypeOf<{
      [Name in keyof XstyleNamespaces]: KeysNotFitting<
        Omit<
          XstyleNamespaces[Name],
          Name extends 'focusOutlineStyles' ? 'publishFocusVisibleVars' : never
        >,
        stylex.StyleXStyles
      >;
    }>().toEqualTypeOf<NoKeys<XstyleNamespaces>>();
  });

  it('fit stylex.props', () => {
    expectTypeOf<{
      [Name in keyof AllNamespaces]: KeysNotFitting<
        AllNamespaces[Name],
        StylexPropsArgument
      >;
    }>().toEqualTypeOf<NoKeys<AllNamespaces>>();
  });

  it('build styles that fit their use', () => {
    expectTypeOf<
      ReturnType<typeof container.container> extends StylexPropsArgument
        ? true
        : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      ReturnType<typeof stack.stack> extends stylex.StyleXStyles ? true : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      ReturnType<typeof stackItem.stackItem> extends stylex.StyleXStyles
        ? true
        : false
    >().toEqualTypeOf<true>();
  });
});
