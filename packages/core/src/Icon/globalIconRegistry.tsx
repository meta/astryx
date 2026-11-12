// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file globalIconRegistry.tsx
 * @input Theme icon entries (a DefinedTheme or a registered theme name), the
 *   process-wide registry, and built-in defaults
 * @output Exports registerIcons, getIconRegistry, getIcon, getExtendedIcon,
 *   resetIcons, resolveIcon and resolveComponentIcon (internal), IconName,
 *   IconRegistry, IconEntry, IconRequest
 * @position Global and theme-scoped icon registry and component icon slot
 *   resolution; works in server and client environments
 *
 * This module has NO 'use client' directive — it's importable from RSC.
 * Components resolve semantic icons through getIcon() or the client useIcon() hook.
 *
 * An entry is a React node or a pure synchronous function of an
 * {@link IconRequest}. Resolution picks one source — theme entry, then
 * process-wide registration, then built-in default; a nullish static entry
 * falls through — and a selected function's result is final. `Icon` passes
 * its resolved size and a variant the entry can receive (listed by the active
 * theme and, for a theme entry, by the theme that defined it), otherwise
 * `undefined`; the public reads below pass `{size: 'md'}`.
 *
 * `resolveComponentIcon` is the only caller of a theme's `componentIcons`
 * slot functions. It turns a slot, its state, and the component's own
 * fallback into the request the component renders through `Icon`.
 */

import type {ReactNode} from 'react';
import {defaultIcons} from './defaultIcons';
import type {IconSize} from './IconSize.stylex';
import type {
  ComponentIconRequest,
  ComponentIconSlotMap,
  ComponentIconSlotName,
  IconVariant,
} from './index';
import type {DefinedTheme} from '../theme/defineTheme';
import {getRegisteredTheme} from '../theme/themeRegistry';
import {warnOnce} from '../utils/devWarning';
import {sharedForReact} from '../utils/sharedForReact';

// =============================================================================
// Types
// =============================================================================

/**
 * Semantic icon names used internally by Astryx components.
 *
 * These represent the functional purpose of each icon, not a specific
 * visual representation. Themes provide the actual icon components.
 */
// SYNC: packages/cli/assets/docs/icons.doc.mjs — update USAGE_HINTS when adding names
export type IconName =
  | 'close'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronsLeft'
  | 'chevronsRight'
  | 'check'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'calendar'
  | 'clock'
  | 'externalLink'
  | 'menu'
  | 'moreHorizontal'
  | 'search'
  | 'upload'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowsUpDown'
  | 'funnel'
  | 'eyeSlash'
  | 'viewColumns'
  | 'copy'
  | 'checkDouble'
  | 'wrench'
  | 'stop'
  | 'microphone';

/**
 * A namespaced extension key, `'<namespace>:<name>'`.
 *
 * This is the tier for a glyph that belongs to one component or library rather
 * than to the system: `'richtext:bold'`, `'numberInput:stepperDown'`. A theme
 * overrides it by key through `registerIcons` or `defineTheme({icons})`,
 * exactly as it overrides a built-in name, and the core {@link IconName} union
 * stays reserved for glyphs the whole system shares.
 *
 * Accepted anywhere a built-in name is, including `<Icon icon>` — which is
 * what lets a namespaced glyph keep `size`, `color` and `xstyle`.
 */
export type NamespacedIconName = `${string}:${string}`;

/**
 * A semantic icon name — either one of the built-in {@link IconName}s or an
 * arbitrary string key contributed by a library/app.
 *
 * The `(string & {})` intersection keeps the built-in names available for
 * autocomplete while still allowing any string, so downstream libraries can
 * register and resolve their own keys (e.g. `'richtext:bold'`) without having
 * to widen the core `IconName` union.
 */
export type ExtendedIconName = IconName | (string & {});

/**
 * A complete icon registry: every semantic name mapped to a React node.
 */
export type IconRegistry = Record<IconName, ReactNode>;

/**
 * What `Icon` asks a function icon entry for: the final Icon size, resolved
 * explicit `size` → owning component's default → `'md'`, and a variant name
 * or `undefined`.
 *
 * Inside `defineTheme`, `Variant` is the theme's listed `iconVariants`; a
 * process-wide registration receives {@link IconVariant}.
 */
export type IconRequest<Variant extends string = IconVariant> = Readonly<{
  size: IconSize;
  variant?: Variant;
}>;

/**
 * A theme or process-wide icon entry: a React node, or a pure synchronous
 * function of the {@link IconRequest} that returns one.
 *
 * A function computes its result from the request only — no hooks, DOM or
 * SVG measurement, browser globals, network access, mutable module state, or
 * side effects. Once selected, its result is final: returning `null` or
 * `undefined` renders no glyph instead of falling through to another source.
 *
 * @example
 * ```
 * defineTheme({
 *   name: 'brand',
 *   icons: {
 *     info: ({size}) => <InfoIcon weight={size === 'sm' ? 'bold' : 'regular'} />,
 *   },
 * });
 * ```
 */
export type IconEntry<Variant extends string = IconVariant> =
  ReactNode | ((request: IconRequest<Variant>) => ReactNode);

/**
 * How resolution holds any entry: an entry typed for some variant names
 * accepts a request with none of them.
 */
type StoredIconEntry = IconEntry<never>;

export type IconRegistrySource = DefinedTheme | string | null | undefined;

/** The request every public, one-argument read uses. */
const PUBLIC_READ_REQUEST: IconRequest<never> = {size: 'md'};

// =============================================================================
// Global Registry
// =============================================================================

// Every copy of Core on one React shares this registry. Entries are React
// elements, so a second React keeps its own.
const registry = sharedForReact('icon/global-icon-registry/state', 1, () => ({
  entries: {} as Record<string, StoredIconEntry>,
}));

/**
 * A key is namespaced when it carries a `<namespace>:` prefix — the runtime
 * form of {@link NamespacedIconName}, which is how the typed
 * {@link getIconRegistry} snapshot tells a built-in name from a component- or
 * library-owned one.
 */
function isNamespacedKey(name: string): boolean {
  return name.includes(':');
}

function getTheme(source: IconRegistrySource): DefinedTheme | null {
  return typeof source === 'string'
    ? getRegisteredTheme(source)
    : (source ?? null);
}

/**
 * The theme's icon entries, functions included. A theme from `defineTheme`
 * keeps them in `__icons` when any entry is a function (its public `icons`
 * is the node view); otherwise `icons` already holds them.
 */
function getThemeIconEntries(
  theme: DefinedTheme | null,
): Readonly<Record<string, StoredIconEntry>> | null {
  if (theme == null) {
    return null;
  }
  return theme.__icons ?? theme.icons ?? null;
}

/**
 * The selected entry, with every variant list a requested variant must be in
 * for the entry to receive it. No lists: the entry receives no variant.
 */
interface IconSelection {
  entry: StoredIconEntry;
  variantLists: ReadonlyArray<ReadonlyArray<string> | undefined>;
}

/**
 * Pick the one source that answers `name`: the theme entry, then the
 * process-wide registration, then the built-in default, then `fallback`. A
 * nullish static entry falls through; a function is returned as-is, because
 * its result is final.
 *
 * A theme entry may receive a variant listed by the active theme and by the
 * theme that defined the entry (an inherited entry keeps its defining
 * theme's list). A process-wide registration may receive a variant the
 * active theme lists.
 */
function selectIconEntry(
  name: string,
  source: IconRegistrySource,
  fallback?: ReactNode,
): IconSelection {
  const theme = getTheme(source);
  const activeVariants = theme?.iconVariants;
  const themeEntry = getThemeIconEntries(theme)?.[name];
  if (theme != null && themeEntry != null) {
    const definingVariants =
      theme.__iconEntryVariants != null &&
      Object.hasOwn(theme.__iconEntryVariants, name)
        ? theme.__iconEntryVariants[name]
        : activeVariants;
    return {
      entry: themeEntry,
      variantLists: [activeVariants, definingVariants],
    };
  }
  const globalEntry = registry.entries[name];
  if (globalEntry != null) {
    return {entry: globalEntry, variantLists: [activeVariants]};
  }
  return {entry: defaultIcons[name as IconName] ?? fallback, variantLists: []};
}

/**
 * Read a selected entry for a request: call a function, return a node as-is.
 * The function receives the requested variant only when every list of the
 * selection contains it; otherwise it receives `undefined`.
 */
function readIconEntry(
  {entry, variantLists}: IconSelection,
  {size, variant}: IconRequest<string>,
): ReactNode {
  if (typeof entry !== 'function') {
    return entry;
  }
  const receivable =
    variant !== undefined &&
    variantLists.length > 0 &&
    variantLists.every(list => list?.includes(variant) === true);
  // A receivable variant is one the entry's theme lists, which is the type
  // the entry was written against.
  return entry((receivable ? {size, variant} : {size}) as IconRequest<never>);
}

/**
 * Resolve a key for an Icon request. `Icon` is the caller: it passes the size
 * it resolved and the variant it was asked for. Public reads use
 * {@link getIcon} instead.
 * @internal
 */
export function resolveIcon(
  name: ExtendedIconName,
  source: IconRegistrySource,
  request: IconRequest<string>,
): ReactNode {
  return readIconEntry(selectIconEntry(name, source), request);
}

/**
 * Register icons at the module level. Works in both server and client
 * environments. Call once at app initialization (e.g. root layout).
 *
 * Icons registered here are available to all components — including
 * server-rendered ones that can't access React Context.
 *
 * @example
 * ```
 * import { registerIcons } from '@astryxdesign/core';
 * import { brandIcons } from './brand-icons';
 * registerIcons(brandIcons);
 * ```
 *
 * Libraries may also register their own extension keys (any string), so a
 * theme can override them the same way it overrides built-in icons. A library
 * that ships its own icons registers them by key, then resolves with
 * `getIcon('richtext:bold')`.
 * @example
 * ```
 * registerIcons({ 'richtext:bold': <MyBoldIcon /> });
 * ```
 *
 * An entry may also be a pure synchronous function of `{size, variant}`
 * ({@link IconEntry}); `Icon` passes it the size it renders at.
 * @example
 * ```
 * registerIcons({ info: ({size}) => <InfoIcon weight={size === 'sm' ? 'bold' : 'regular'} /> });
 * ```
 */
export function registerIcons(
  icons: Partial<Record<ExtendedIconName, IconEntry>>,
): void {
  warnOnce(
    'icon-registry:global-register-icons',
    'Icon',
    '`registerIcons()` applies icon overrides globally. Prefer `defineTheme({ icons })` for theme-scoped icon overrides.',
  );
  registry.entries = {...registry.entries, ...icons};
}

/**
 * Get a snapshot of the full icon registry, with registered icons overriding
 * built-in defaults.
 *
 * Works in both server and client environments. Useful for tooling that needs
 * to derive valid semantic icon-name options from the same registry Icon
 * resolves against.
 *
 * Every value is a React node: a function entry is read at `{size: 'md'}`,
 * exactly as {@link getIcon} reads it.
 */
export function getIconRegistry(
  source?: IconRegistrySource,
): Readonly<Record<IconName, ReactNode>> {
  const registry: Record<string, ReactNode> = {};

  // Only surface built-in IconName keys here — namespaced keys, whether
  // contributed by a library or shipped as a component's own default, are
  // resolved via getIcon/getExtendedIcon and intentionally kept out of the
  // typed IconRegistry snapshot.
  const names = new Set(Object.keys(defaultIcons));
  for (const name of Object.keys(getThemeIconEntries(getTheme(source)) ?? {})) {
    names.add(name);
  }
  for (const name of names) {
    if (isNamespacedKey(name)) {
      continue;
    }
    registry[name] = readIconEntry(
      selectIconEntry(name, source),
      PUBLIC_READ_REQUEST,
    );
  }

  return registry as Record<IconName, ReactNode>;
}

/**
 * Get an icon by name from the global registry, falling back to defaults.
 *
 * Works in both server and client environments.
 * Falls back to built-in default icons when no override is registered.
 *
 * Accepts extension keys (any string) in addition to the built-in
 * {@link IconName}s — useful for library-contributed icons. For a
 * caller-supplied fallback when a key isn't registered, use
 * {@link getExtendedIcon}.
 *
 * Returns a React node: a function entry is read at `{size: 'md'}`. Render
 * `<Icon icon={name} />` to request another size.
 */
export function getIcon(
  name: ExtendedIconName,
  source?: IconRegistrySource,
): ReactNode {
  return readIconEntry(selectIconEntry(name, source), PUBLIC_READ_REQUEST);
}

/**
 * Resolve an extension icon by an arbitrary string key, falling back to a
 * caller-supplied default when nothing is registered.
 *
 * This is the seam libraries use to make their own icons themeable: ship the
 * inline SVG as `fallback`, resolve through this function, and a theme can
 * override the key via {@link registerIcons} without the library having to
 * widen the core {@link IconName} union.
 *
 * The `fallback` is the library default, overridable by a theme registering the
 * same key (for example `'richtext:bold'`). A function entry is read at
 * `{size: 'md'}`, and its result is final: a nullish result does not fall
 * back.
 * @example
 * ```
 * getExtendedIcon('richtext:bold', <BoldGlyph />)
 * ```
 */
export function getExtendedIcon(
  name: ExtendedIconName,
  fallback?: ReactNode,
  source?: IconRegistrySource,
): ReactNode {
  return readIconEntry(
    selectIconEntry(name, source, fallback),
    PUBLIC_READ_REQUEST,
  );
}

// =============================================================================
// Component icon slots
// =============================================================================

/**
 * A theme's stored value for a slot, function included. A function was typed
 * for its slot's state; resolution passes it the state of that slot only.
 */
export type StoredComponentIconValue =
  | IconName
  | null
  | ComponentIconRequest<string>
  | ((state: never) => ComponentIconRequest<string> | null | undefined);

/** The state a slot's component passes: `undefined` for a stateless slot. */
export type ComponentIconSlotState<Slot extends ComponentIconSlotName> =
  ComponentIconSlotMap[Slot] extends true
    ? undefined
    : Readonly<ComponentIconSlotMap[Slot]>;

/**
 * What a component renders for a slot when the theme maps nothing: its own
 * icon name (or `null` for none), and optionally its own variant and size.
 */
export type ComponentIconFallback =
  | IconName
  | null
  | Readonly<{icon: IconName | null; variant?: IconVariant; size?: IconSize}>;

/** A slot resolved to what the component renders through `Icon`. */
export type ResolvedComponentIcon = Readonly<{
  icon: IconName | null;
  variant?: string;
  size?: IconSize;
}>;

const ICON_SIZES: ReadonlySet<unknown> = new Set(['xsm', 'sm', 'md', 'lg']);

function isIconName(value: unknown): value is IconName {
  return (
    typeof value === 'string' &&
    !isNamespacedKey(value) &&
    Object.hasOwn(defaultIcons, value)
  );
}

/**
 * The theme's slot values, functions included. A theme from `defineTheme`
 * keeps them in `__componentIcons` when any value is a function (its public
 * `componentIcons` is the static view); otherwise `componentIcons` holds them.
 */
function getThemeComponentIcons(
  theme: DefinedTheme | null,
): Readonly<Record<string, StoredComponentIconValue | undefined>> | null {
  if (theme == null) {
    return null;
  }
  return theme.__componentIcons ?? theme.componentIcons ?? null;
}

function warnMalformedRequest(slot: string, problem: string): void {
  warnOnce(
    `component-icons:${slot}:${problem}`,
    'Icon',
    `componentIcons["${slot}"] ${problem}. The component keeps its own value for that field.`,
  );
}

/**
 * Apply a theme's request to the component's fallback, field by field. A
 * missing field keeps the fallback. An unknown icon, a variant the active
 * theme does not list, or an unsupported size is ignored with one
 * development-only warning.
 */
function applyComponentIconRequest(
  slot: string,
  fallback: ResolvedComponentIcon,
  request: unknown,
  theme: DefinedTheme | null,
): ResolvedComponentIcon {
  if (request === undefined) {
    return fallback;
  }
  if (request === null) {
    return {...fallback, icon: null};
  }
  if (typeof request !== 'object' || Array.isArray(request)) {
    warnMalformedRequest(
      slot,
      `returned ${JSON.stringify(request)}, which is not a request`,
    );
    return fallback;
  }
  const {icon, variant, size} = request as Record<string, unknown>;
  let resolved = fallback;
  if (icon === null || isIconName(icon)) {
    resolved = {...resolved, icon};
  } else if (icon !== undefined) {
    warnMalformedRequest(
      slot,
      `requests the unknown icon ${JSON.stringify(icon)}`,
    );
  }
  if (typeof variant === 'string' && theme?.iconVariants?.includes(variant)) {
    resolved = {...resolved, variant};
  } else if (variant !== undefined) {
    warnMalformedRequest(
      slot,
      `requests the variant ${JSON.stringify(variant)}, which the theme does not list`,
    );
  }
  if (ICON_SIZES.has(size)) {
    resolved = {...resolved, size: size as IconSize};
  } else if (size !== undefined) {
    warnMalformedRequest(
      slot,
      `requests the unsupported size ${JSON.stringify(size)}`,
    );
  }
  return resolved;
}

/**
 * Resolve a component's icon slot. The component passes its slot state and
 * its own fallback; the active theme's `componentIcons[slot]` adjusts that
 * fallback. A shared icon name replaces the fallback icon, `null` hides the
 * icon, a request applies field by field, and a slot function receives the
 * state and returns a request whose result is final: `null` hides the icon,
 * `undefined` changes nothing.
 *
 * This is the only caller of a theme's slot functions. Caller-supplied icon
 * content wins before resolution, so a component does not resolve the slot
 * when its caller passed content.
 * @internal
 */
export function resolveComponentIcon<Slot extends ComponentIconSlotName>(
  slot: Slot,
  state: ComponentIconSlotState<Slot>,
  fallback: ComponentIconFallback,
  source: IconRegistrySource,
): ResolvedComponentIcon {
  const own: ResolvedComponentIcon =
    fallback === null || typeof fallback === 'string'
      ? {icon: fallback}
      : fallback;
  const theme = getTheme(source);
  const value = getThemeComponentIcons(theme)?.[slot];
  if (value === undefined) {
    return own;
  }
  if (typeof value === 'function') {
    const result: unknown = (value as (state: unknown) => unknown)(state);
    if (typeof result === 'string') {
      warnMalformedRequest(
        slot,
        `returned ${JSON.stringify(result)}, which is not a request`,
      );
      return own;
    }
    return applyComponentIconRequest(slot, own, result, theme);
  }
  if (typeof value === 'string') {
    return applyComponentIconRequest(slot, own, {icon: value}, theme);
  }
  return applyComponentIconRequest(slot, own, value, theme);
}

/**
 * Reset the global registry. For testing only.
 * @internal
 */
export function resetIcons(): void {
  registry.entries = {};
}
