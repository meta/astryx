// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contract/names.ts
 * @input None
 * @output Name lists the AST-082 FR8 rules check against
 * @position Data for contract/rules.ts and contract/fromComponentDoc.ts
 */

export const SWIFT_KEYWORDS: ReadonlySet<string> = new Set(
  (
    'associatedtype class deinit enum extension fileprivate func import init inout ' +
    'internal let open operator private precedencegroup protocol public rethrows ' +
    'static struct subscript typealias var break case catch continue default defer ' +
    'do else fallthrough for guard if in repeat return throw switch where while Any ' +
    'as await false is nil self Self super throws true try'
  ).split(' '),
);

export const KOTLIN_KEYWORDS: ReadonlySet<string> = new Set(
  (
    'as break class continue do else false for fun if in interface is null object ' +
    'package return super this throw true try typealias typeof val var when while'
  ).split(' '),
);

/**
 * Names each platform toolkit already uses with its own meaning. A core prop
 * must not take one of them unless Astryx reclaims it (RECLAIMED).
 */
export const TOOLKIT_NAMES: Readonly<Record<string, ReadonlySet<string>>> = {
  web: new Set([
    'children',
    'className',
    'style',
    'title',
    'hidden',
    'role',
    'tabIndex',
    'dir',
    'slot',
    'is',
    'key',
    'ref',
    'onChange',
    'color',
    'content',
  ]),
  reactNative: new Set([
    'style',
    'testID',
    'nativeID',
    'onPress',
    'onLongPress',
    'onLayout',
    'accessibilityLabel',
    'accessibilityHint',
    'accessibilityRole',
    'accessibilityState',
    'accessible',
    'hitSlop',
    'pointerEvents',
    'disabled',
    'editable',
    'numberOfLines',
    'onChangeText',
    'selectable',
  ]),
  swiftUI: new Set([
    'body',
    'disabled',
    'hidden',
    'opacity',
    'frame',
    'tint',
    'font',
    'background',
    'overlay',
    'accessibilityLabel',
    'accessibilityHint',
    'accessibilityIdentifier',
  ]),
  compose: new Set([
    'modifier',
    'enabled',
    'onClick',
    'colors',
    'testTag',
    'contentDescription',
  ]),
};

/**
 * Web names Astryx deliberately takes over for a component-owned concept
 * (AST-082 FR8). The platform's own meaning is removed from that component's
 * base props.
 */
export const RECLAIMED: ReadonlySet<string> = new Set([
  'onChange',
  'title',
  'color',
  'content',
]);
