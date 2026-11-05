// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports Icon component/types, icon registry, and global registration
 * @output Exports Icon, icon registry helpers, registerIcons, getIconRegistry, getIcon,
 *   the IconEntry/IconRequest types for theme and registered entries, the
 *   augmentable IconVariantMap with its IconVariant names, and the augmentable
 *   ComponentIconSlotMap with the types of a theme's `componentIcons`
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 *
 * SYNC: When modified, update this header and /packages/core/src/Icon/Icon.doc.mjs
 */

import type {IconName} from './globalIconRegistry';
import type {IconSize} from './IconSize.stylex';

/**
 * Icon variant names an application uses. Astryx defines none: a theme lists
 * the names it supports in `defineTheme({iconVariants})`, and an application
 * augments this map with the names it requests.
 *
 * A theme icon entry receives a requested variant only when the active theme
 * lists it; any other request renders the entry's normal artwork.
 *
 * @example
 * ```
 * declare module '@astryxdesign/core/Icon' {
 *   interface IconVariantMap {
 *     outline: true;
 *     filled: true;
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation point
export interface IconVariantMap {}

/** A variant name from the augmentable {@link IconVariantMap}. */
export type IconVariant = keyof IconVariantMap & string;

/**
 * The themeable icons that components own, by slot. A slot names why an icon
 * is in one component (`<component-kebab>-<semantic-role>`), not its artwork.
 * A theme maps a slot to a shared icon name through
 * `defineTheme({componentIcons})`.
 *
 * The value is `true` for a stateless slot, or the readonly state the component
 * passes to a theme's slot function. A package adds its own component's slots
 * by augmenting this interface.
 *
 * @example
 * ```
 * declare module '@astryxdesign/core/Icon' {
 *   interface ComponentIconSlotMap {
 *     'example-panel-dismiss': true;
 *     'example-nav-item-leading': {selected: boolean};
 *   }
 * }
 * ```
 */
export interface ComponentIconSlotMap {
  /** ChatSendButton's send glyph. A `sendIcon` the caller passes wins. */
  'chat-send-button-send': true;
  /** CodeBlock's copy button. `copied` is true while the copied feedback shows. */
  'code-block-copy': {readonly copied: boolean};
  /** A Timestamp hover card row's copy button. `copied` is true while the copied feedback shows. */
  'timestamp-copy': {readonly copied: boolean};
  /** A sortable Table column's sort indicator, by the column's sort direction. */
  'table-sort-indicator': {
    readonly direction: 'ascending' | 'descending' | 'none';
  };
  /** A Table row's expansion toggle (`useTableRowExpansion`), by whether the row is expanded. */
  'table-row-expand': {readonly expanded: boolean};
}

/** A slot name from the augmentable {@link ComponentIconSlotMap}. */
export type ComponentIconSlotName = keyof ComponentIconSlotMap & string;

/**
 * A partial request for a slot's icon. A missing field keeps what the
 * component would otherwise render: its own icon name, variant, and size.
 * `icon: null` hides the icon. `size` changes only the icon, never the
 * control around it.
 */
export type ComponentIconRequest<Variant extends string = IconVariant> =
  Readonly<{
    icon?: IconName | null;
    variant?: Variant;
    size?: IconSize;
  }>;

/**
 * A theme's value for a slot: a shared icon name, `null` to hide the icon, a
 * partial request, or, for a stateful slot, a pure synchronous function of the
 * slot's state that returns a partial request. A function that returns `null`
 * hides the icon; one that returns `undefined` changes nothing.
 */
export type ComponentIconValue<State, Variant extends string = IconVariant> =
  | IconName
  | null
  | ComponentIconRequest<Variant>
  | ((
      state: Readonly<State>,
    ) => ComponentIconRequest<Variant> | null | undefined);

/** A theme's `componentIcons`: a value for any slot, keyed by slot name. */
export type ComponentIconMap<Variant extends string = IconVariant> = {
  [Slot in ComponentIconSlotName]?: ComponentIconSlotMap[Slot] extends true
    ? IconName | null | ComponentIconRequest<Variant>
    : ComponentIconValue<ComponentIconSlotMap[Slot], Variant>;
};

/**
 * The static view of a theme's `componentIcons` that public reads return:
 * names, `null`, and static requests. Slots a theme resolves with a function
 * are left out.
 */
export type ComponentIconStaticMap = Partial<
  Record<ComponentIconSlotName, IconName | null | ComponentIconRequest<string>>
>;

export {Icon, renderIconSlot} from './Icon';
export {useIcon} from './useIcon';
export type {IconProps, IconColor, IconSize, IconType} from './Icon';

// Global registry (RSC-compatible, no 'use client')
export {
  registerIcons,
  getIconRegistry,
  getIcon,
  getExtendedIcon,
  resetIcons,
} from './globalIconRegistry';
export type {
  IconName,
  ExtendedIconName,
  NamespacedIconName,
  IconRegistry,
  IconRegistrySource,
  IconEntry,
  IconRequest,
} from './globalIconRegistry';
