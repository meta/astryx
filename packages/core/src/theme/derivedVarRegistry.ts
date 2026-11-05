// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Derived variable registry — maps CSS properties to internal vars.
 *
 * Used by generateThemeRules to expand standard CSS properties (borderRadius,
 * padding) into internal CSS custom properties that components read.
 *
 * This is a compiled registry — the source of truth lives in each component's
 * doc file (theming.derived). The consistency test in derivedVarRegistry.test.ts
 * verifies this file stays in sync with the docs.
 *
 * When adding a new component with derived vars:
 * 1. Add the `derived` field to the component's doc.mjs file
 * 2. Add the corresponding entry here
 * 3. The consistency test will catch any drift
 *
 * @position Core theme infrastructure — read by generateThemeRules at runtime
 */

export interface DerivedVarEntry {
  /** The standard CSS property name (camelCase) that theme authors write. */
  property: string;
  /** Internal CSS custom property names to set. Omit when using `expand`. */
  vars?: string[];
  /** Named expansion strategy. 'container' expands padding to container tokens. */
  expand?: 'container';
  /**
   * Emit only the internal `vars`, dropping the source property from the rule.
   * Use when the class-carrying element must NOT receive the standard property
   * itself — the value is consumed by a child through the var instead. Without
   * this, the property is emitted alongside the var (correct when the same
   * element both reads the var and applies the property, e.g. Chat/DropdownMenu).
   */
  replaces?: boolean;
}

/**
 * Component → derived var mappings.
 *
 * Keys are lowercase component names (matching defineTheme component keys).
 * Values are ordered arrays — earlier entries emit first when multiple
 * entries share the same property.
 */
export const derivedVarRegistry: Record<string, DerivedVarEntry[]> = {
  avatar: [{property: 'borderRadius', vars: ['--_avatar-radius']}],
  banner: [{property: 'borderRadius', vars: ['--_banner-radius']}],
  'bottom-sheet': [{property: 'padding', expand: 'container'}],
  button: [{property: 'borderRadius', vars: ['--_button-radius']}],
  card: [
    {property: 'borderRadius', vars: ['--_card-radius']},
    {property: 'padding', expand: 'container'},
  ],
  chat: [
    {property: 'borderRadius', vars: ['--_chat-composer-radius']},
    {property: 'padding', vars: ['--_chat-composer-padding']},
  ],
  dialog: [
    {property: 'borderRadius', vars: ['--_dialog-radius']},
    {property: 'padding', expand: 'container'},
  ],
  drawer: [{property: 'padding', expand: 'container'}],
  'context-menu': [
    {property: 'borderRadius', vars: ['--_dropdown-menu-radius']},
    {property: 'padding', vars: ['--_dropdown-menu-padding']},
  ],
  'dropdown-menu': [
    {property: 'borderRadius', vars: ['--_dropdown-menu-radius']},
    {property: 'padding', vars: ['--_dropdown-menu-padding']},
  ],
  field: [{property: 'borderRadius', vars: ['--_field-radius']}],
  'hover-card': [{property: 'borderRadius', vars: ['--_hovercard-radius']}],
  icon: [
    {property: 'width', vars: ['--_icon-width'], replaces: true},
    {property: 'height', vars: ['--_icon-height'], replaces: true},
  ],
  item: [{property: 'paddingInline', vars: ['--_item-inset-inline']}],
  'number-input': [
    {property: 'padding', expand: 'container'},
    {property: 'borderRadius', vars: ['--_field-radius']},
  ],
  popover: [{property: 'borderRadius', vars: ['--_popover-radius']}],
  'progress-bar-mark': [
    {property: 'width', vars: ['--_progressbar-mark-width'], replaces: true},
    {property: 'height', vars: ['--_progressbar-mark-height'], replaces: true},
  ],
  section: [{property: 'padding', expand: 'container'}],
  'segmented-control': [
    {property: 'borderRadius', vars: ['--_segmented-control-radius']},
    {property: 'padding', vars: ['--_segmented-control-padding']},
  ],
  'text-area': [
    {
      property: 'paddingInline',
      vars: ['--_textarea-inline-padding'],
      replaces: true,
    },
  ],
};

export function getDerivedVars(
  component: string,
  property: string,
): DerivedVarEntry[] {
  const entries = derivedVarRegistry[component];
  if (!entries) {
    return [];
  }
  return entries.filter(e => e.property === property);
}
