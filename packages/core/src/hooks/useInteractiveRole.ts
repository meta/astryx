// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useInteractiveRole.ts
 * @input useInteractiveTrigger
 * @output useInteractiveRole hook and InteractiveRole type
 * @position Hook utility for polymorphic components such as Token, Thumbnail,
 *   Item and ClickableCard. Add new context-based triggers here, so the
 *   components that use this hook need no change.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts (export)
 */

import {useInteractiveRoleContext} from '../InteractiveRoleContext/InteractiveRoleContext';

/**
 * The resolved interactive role for a polymorphic component.
 *
 * - `'link'` — render as `<a>` (via LinkComponent)
 * - `'button'` — render as `<button>`
 * - `'inert'` — render as `<span>` or `<div>` (non-interactive)
 */
export type InteractiveRole = 'link' | 'button' | 'inert';

export interface UseInteractiveRoleOptions {
  /**
   * URL for link navigation. When provided, the component renders as a link.
   * Takes highest priority — a link always navigates.
   */
  href?: string;

  /**
   * Click handler. When provided, the component renders as a button.
   * Takes priority over context-based triggers.
   */
  onClick?: ((...args: never[]) => unknown) | null;

  /**
   * Whether the component is disabled. When true, an `href` is ignored for
   * role resolution (a disabled link is an a11y anti-pattern), so the role is
   * decided by the remaining inputs: `onClick` → `'button'`, an interactive
   * context → its role, otherwise `'inert'`. In particular a disabled `href`
   * with no `onClick` and no context override resolves to `'inert'`, not a
   * link or a button.
   * @default false
   */
  isDisabled?: boolean;
}

/**
 * Determines the interactive role for a polymorphic component.
 *
 * Centralizes the element-type decision so that adding new context-based
 * triggers (popover, dropdown, etc.) only requires updating this hook —
 * all consuming components inherit the new behavior automatically.
 *
 * @example
 * ```ts
 * function Token({ href, onClick, ... }) {
 *   const role = useInteractiveRole({ href, onClick });
 *
 *   switch (role) {
 *     case 'link': return <LinkComponent href={href} ...>{content}</LinkComponent>;
 *     case 'button': return <button ...>{content}</button>;
 *     case 'inert': return <span ...>{content}</span>;
 *   }
 * }
 * ```
 */
export function useInteractiveRole({
  href,
  onClick,
  isDisabled = false,
}: UseInteractiveRoleOptions): InteractiveRole {
  const contextRole = useInteractiveRoleContext();

  // A disabled href is skipped, so the checks below decide the role.
  if (href != null && !isDisabled) {
    return 'link';
  }

  if (onClick != null) {
    return 'button';
  }

  // 3. Context-provided role override (e.g., Popover provides 'button')
  if (contextRole != null) {
    return contextRole;
  }

  return 'inert';
}
