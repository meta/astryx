// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file devWarning.ts
 * @input A component/hook name and a message
 * @output Standardized `Component: message` console warnings and errors
 * @position Shared dev-logging utility used across components and hooks
 *
 * Every message reads `Component: message`, so the source is clear in the
 * console. Prefer `useDevWarning` in components, because it does not repeat
 * a warning on each render. These helpers are for plain functions, module
 * initialization and effects.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/utils/index.ts
 * - /packages/core/src/hooks/useDevWarning.ts (the render-path counterpart)
 */

const isDev = process.env.NODE_ENV !== 'production';

/** Format a message as `Component: message`. */
export function formatDevMessage(component: string, message: string): string {
  return `${component}: ${message}`;
}

/**
 * Dev-only `console.warn` in the standardized `Component: message` format.
 * A no-op in production — warnings are builder guardrails, not shipped noise.
 * Extra args (e.g. an offending value) are forwarded to `console.warn`.
 *
 * @example
 * ```
 * devWarn('Popover', 'children must contain a <button>.');
 * ```
 */
export function devWarn(
  component: string,
  message: string,
  ...args: unknown[]
): void {
  if (!isDev) {
    return;
  }
  console.warn(formatDevMessage(component, message), ...args);
}

/**
 * `console.error` in the standardized `Component: message` format. Unlike
 * {@link devWarn}, this runs in production too: it reports real runtime
 * failures (e.g. a thrown callback) that should reach error telemetry.
 *
 * @example
 * ```
 * devError('Table', 'Plugin at index 0 threw in transform:', error);
 * ```
 */
export function devError(
  component: string,
  message: string,
  ...args: unknown[]
): void {
  console.error(formatDevMessage(component, message), ...args);
}

const warnedKeys = new Set<string>();

/**
 * Dev-only warning that fires at most once per `key` for the lifetime of the
 * app. Use for singleton warnings that aren't tied to a component instance —
 * a missing translation key, a per-theme perf hint, a one-time fallback.
 * For per-component-instance warnings, use the `useDevWarning` hook instead.
 *
 * @example
 * ```
 * warnOnce(`theme:${name}`, 'Theme', `"${name}" uses runtime injection.`);
 * ```
 */
export function warnOnce(
  key: string,
  component: string,
  message: string,
  ...args: unknown[]
): void {
  if (!isDev || warnedKeys.has(key)) {
    return;
  }
  warnedKeys.add(key);
  console.warn(formatDevMessage(component, message), ...args);
}

/**
 * Clear `warnOnce` dedup state. Test-only.
 * @internal
 */
export function __resetDevWarnings(): void {
  warnedKeys.clear();
}
