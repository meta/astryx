// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sharedElementParts.ts
 * @input None
 * @output Exports SHARED_ELEMENT_PARTS: each theme target whose entries win
 *   over the component whose element it sits on (not `timestamp` or `timer`),
 *   mapped to that component's target
 * @position Read by the theme compiler, which emits a shared-element part's rules
 *   in a later astryx-theme sub-layer than the rest, so a theme's entry for
 *   the part wins over its entries for the component it sits on. Each entry
 *   is declared as `sitsOn` on the part's doc target, and a test keeps the
 *   two the same.
 */
export const SHARED_ELEMENT_PARTS: Readonly<Record<string, string>> = {
  'alert-dialog': 'dialog',
  'app-shell-sidenav': 'layout-panel',
  'banner-close': 'button',
  'banner-icon': 'icon',
  'calendar-nav': 'button',
  'chat-send-button': 'button',
  'checkbox-label': 'field-label',
  'checkbox-list': 'field',
  'clickable-card': 'card',
  'code-block-copy-button': 'button',
  'complex-selector-indicator-icon': 'icon',
  'complex-selector-popup': 'popover',
  'date-input-toggle-icon': 'icon',
  'date-range-input-toggle-icon': 'icon',
  'date-time-input-clock-icon': 'icon',
  'date-time-input-toggle-icon': 'icon',
  'dropdown-menu-divider': 'divider',
  'dropdown-menu-indicator-icon': 'icon',
  'dropdown-menu-item': 'item',
  'dropdown-menu-radio': 'radio-indicator',
  'dialog-header-close-icon': 'icon',
  'drawer-header-close-icon': 'icon',
  'field-status-icon': 'icon',
  'file-input-icon': 'icon',
  'input-clear-button': 'button',
  'input-clear-icon': 'icon',
  'input-status-icon': 'icon',
  'list-item': 'item',
  'markdown-blockquote': 'blockquote',
  'media-captions-button': 'toggle-button',
  'more-menu': 'dropdown-menu',
  'multi-selector-indicator-icon': 'icon',
  'multi-selector-popup': 'popover',
  'pagination-item': 'button',
  'radio-list-item': 'item',
  'selectable-card': 'card',
  'selector-check': 'icon',
  'selector-indicator-icon': 'icon',
  'selector-option': 'item',
  'selector-popup': 'popover',
  'switch-label': 'field-label',
  'timestamp-copy-button': 'button',
  'toast-close': 'button',
  'toggle-button': 'button',
  'transfer-list-item': 'list-item',
  'typeahead-popup': 'popover',
};

/** Whether a theme target's entries win over the component it sits on. */
export function isSharedElementPart(target: string): boolean {
  return Object.hasOwn(SHARED_ELEMENT_PARTS, target);
}
