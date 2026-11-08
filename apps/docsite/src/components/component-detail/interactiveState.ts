// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Builds the initial prop state for component detail interactive previews.
 * Keeps runtime-only defaults (callbacks, mock search sources, descriptor
 * resolution) and preview-only controlled callbacks out of the generated JSON
 * registries while preserving typed option values from parsed controls.
 * Also builds the simulated AppShell mobile context for
 * `playground.appShellMobile` previews.
 */

import {allSyntaxPresets} from '@astryxdesign/core/theme/syntax';
import type {AppShellMobileContextValue} from '@astryxdesign/core/AppShell';
import {themeObjectsFull} from '../../generated/themeRegistry';
import {
  coerceDefault,
  coerceEnumOption,
  parsePropType,
  type PropControlDescriptor,
} from './parsePropType';
import {resolveValue} from './resolveElements';
import type {
  ComponentEntry,
  PropDoc,
  PlaygroundConfig,
} from '../../generated/componentRegistry';

export interface KnobProp {
  row: PropDoc;
  control: PropControlDescriptor;
}

const PREVIEW_SEARCH_ITEMS = [
  {id: 'dashboard', label: 'Dashboard'},
  {id: 'projects', label: 'Projects'},
  {id: 'settings', label: 'Settings'},
];

const PREVIEW_SEARCH_SOURCE = {
  search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') {
      return PREVIEW_SEARCH_ITEMS;
    }
    return PREVIEW_SEARCH_ITEMS.filter(item =>
      item.label.toLowerCase().includes(normalized),
    );
  },
  bootstrap() {
    return PREVIEW_SEARCH_ITEMS;
  },
  cancel() {},
};

export function pickPrimaryProps(name: string, props: PropDoc[]): KnobProp[] {
  if (props.length === 0) {
    return [];
  }
  return props.map(row => ({
    row,
    control: parsePropType(row.type, row.name, row.slotElements),
  }));
}

function resolveThemeValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return resolveValue(value);
  }

  const byPackageName = themeObjectsFull[value];
  if (byPackageName) {
    return byPackageName;
  }

  return (
    Object.values(themeObjectsFull).find(theme => theme.name === value) ?? value
  );
}

function resolveSyntaxThemeValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return resolveValue(value);
  }

  return allSyntaxPresets.find(theme => theme.name === value) ?? value;
}

function resolveDefaultValue(
  value: unknown,
  control: PropControlDescriptor | undefined,
): unknown {
  if (control?.kind === 'theme') {
    return resolveThemeValue(value);
  }
  if (control?.kind === 'syntax-theme') {
    return resolveSyntaxThemeValue(value);
  }
  return resolveValue(value);
}

function getRequiredFallbackValue(
  row: PropDoc,
  control: PropControlDescriptor,
): unknown {
  switch (control.kind) {
    case 'enum':
      return coerceEnumOption(control, control.options[0]);
    case 'theme':
      return Object.values(themeObjectsFull)[0];
    case 'syntax-theme':
      return allSyntaxPresets[0];
    case 'input-status':
      return {
        type: control.options[0],
        message: `${control.options[0]} status`,
      };
    case 'boolean':
      return false;
    case 'string':
      return row.name;
    case 'number':
      return 0;
    case 'callback':
      return () => {};
    case 'element':
      return row.slotElements?.[0] != null
        ? resolveValue(row.slotElements[0])
        : undefined;
    case 'slot-list':
      return buildSlotListDefault(row);
    case 'unknown':
      if (/\bSearchSource\b/.test(row.type)) {
        return PREVIEW_SEARCH_SOURCE;
      }
      if (/\bnull\b/.test(row.type)) {
        return null;
      }
      return undefined;
  }
}

function buildSlotListDefault(row: PropDoc): unknown[] | undefined {
  const slotEl = row.slotElements?.[0];
  if (!slotEl) {
    return undefined;
  }
  return [1, 2, 3].map(n => {
    const tweaked = {...slotEl};
    const props = {...(tweaked.props ?? {})};
    if (typeof props.label === 'string') {
      props.label = `${props.label} ${n}`;
    }
    if (typeof props.value === 'string') {
      props.value = `${props.value}-${n}`;
    }
    tweaked.props = props;
    if (typeof tweaked.children === 'string') {
      tweaked.children = `${tweaked.children} ${n}`;
    }
    return resolveValue(tweaked);
  });
}

export function buildInitialState(
  knobs: KnobProp[],
  playground?: PlaygroundConfig | null,
): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  const controlByName = new Map(
    knobs.map(({row, control}) => [row.name, control]),
  );

  // Apply playground defaults first (resolved from ElementDescriptor if needed)
  if (playground?.defaults) {
    for (const [key, value] of Object.entries(playground.defaults)) {
      state[key] = resolveDefaultValue(value, controlByName.get(key));
    }
  }

  // Fill in remaining props from doc defaults / auto-generation
  for (const {row, control} of knobs) {
    if (state[row.name] !== undefined) {
      continue;
    }
    const def = coerceDefault(row.default, control);
    if (def !== undefined) {
      state[row.name] = def;
    } else if (control.kind === 'slot-list') {
      // Always generate initial items for slot-lists (empty list isn't useful)
      const slotList = buildSlotListDefault(row);
      if (slotList !== undefined) {
        state[row.name] = slotList;
      }
    } else if (row.required) {
      const fallback = getRequiredFallbackValue(row, control);
      if (fallback !== undefined) {
        state[row.name] = fallback;
      }
    }
  }
  return state;
}

/**
 * Whether a component detail page renders the interactive Properties
 * playground. Hooks document params/returns through HookSignature instead.
 * Utility entries (providers and context, e.g. LinkProvider, LayerProvider,
 * VisuallyHidden) are non-visual, so auto-generated knobs render an empty or
 * meaningless stage; they get the hook-style static layout with a plain props
 * table unless their doc curates a playground (e.g. Theme, which previews
 * themed content). See #2733.
 */
export function hasInteractivePlayground(
  comp: Pick<ComponentEntry, 'category' | 'params' | 'playground'>,
): boolean {
  if (comp.params != null) {
    return false;
  }
  return comp.category !== 'Utility' || comp.playground != null;
}

/**
 * True when an overlay-mode component (`playground.overlay`) is closed in the
 * current preview state. The component renders nothing inline while closed
 * (e.g. a `showModal()` drawer), so the stage shows an open-trigger
 * placeholder instead of an empty box.
 */
export function isOverlayPreviewClosed(
  playground: PlaygroundConfig | null | undefined,
  state: Record<string, unknown>,
): boolean {
  const control = getOverlayPreviewControl(playground);
  return (
    control != null && !Object.is(state[control.stateProp], control.openValue)
  );
}

/** Controlled prop/value used by the Properties preview's open button. */
export function getOverlayPreviewControl(
  playground: PlaygroundConfig | null | undefined,
): {stateProp: string; openValue: unknown} | null {
  if (playground?.overlay !== true) {
    return null;
  }
  return playground.overlayControl ?? {stateProp: 'isOpen', openValue: true};
}

/**
 * Context value for previews of components that read AppShell mobile context
 * (`playground.appShellMobile`). MobileNavToggle renders null unless the
 * context reports an enabled mobile viewport — the default value outside
 * AppShell never does — so the preview simulates one, wiring the drawer open
 * state back to the provided setter to keep the toggle interactive (#4983).
 */
export function buildAppShellMobilePreviewContext(
  isMobileNavOpen: boolean,
  onOpenChange: (isOpen: boolean) => void,
): AppShellMobileContextValue {
  return {
    isMobile: true,
    isMobileNavEnabled: true,
    isMobileNavOpen,
    toggleMobileNav: () => onOpenChange(!isMobileNavOpen),
    openMobileNav: () => onOpenChange(true),
    closeMobileNav: () => onOpenChange(false),
    hasAutoToggle: true,
  };
}

export function getMissingRequiredProps(
  knobs: KnobProp[],
  state: Record<string, unknown>,
): string[] {
  return knobs
    .filter(({row}) => row.required === true && state[row.name] === undefined)
    .map(({row}) => row.name);
}

/**
 * Returns the name of a callback's first parameter from its stringified type,
 * e.g. `(page: number) => void` → `page`. Returns `null` for unnamed params.
 */
function getCallbackTargetProp(type: string): string | null {
  const match = /^\s*\(\s*([^):,]+)/.exec(type);
  if (!match) {
    return null;
  }
  const name = match[1].trim().replace(/\?$/, '');
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : null;
}

/**
 * The state prop a change handler writes back to, or `null` when the preview
 * cannot tell. Prefers the first parameter's name; for `onChange` falls back
 * to the controlled `value` prop, whose payload it carries by convention. The
 * primary `onChange` pair may target an optional, unseeded value prop; secondary
 * change handlers still require their target to be present in preview state.
 */
function resolveChangeTarget(
  name: string,
  type: string,
  state: Record<string, unknown>,
  knownProps: ReadonlySet<string>,
): string | null {
  const named = getCallbackTargetProp(type);
  if (
    named != null &&
    (named in state || (name === 'onChange' && knownProps.has(named)))
  ) {
    return named;
  }
  return name === 'onChange' && ('value' in state || knownProps.has('value'))
    ? 'value'
    : null;
}

/**
 * Wires controlled-component change handlers back into playground state so the
 * preview reflects interaction (clicking a Pagination page, etc.). A callback
 * whose first parameter names a value prop in preview state (page/onChange,
 * pageSize/onPageSizeChange), or the primary `value` prop for literal
 * `onChange`, replaces its noop with one that updates that prop.
 * isOpen/onOpenChange stays gated behind canControlOpenState.
 *
 * `onChange` is the exception to the name match: it conventionally documents
 * its first parameter after the payload it carries (`checked`, `items`,
 * `values`) rather than after the prop that holds it, so it falls back to the
 * component's controlled `value`. Without that fallback a Switch never
 * toggles and a Tokenizer token never leaves, because the component is
 * controlled and nothing writes the next value back (#5981).
 */
export function buildRuntimePreviewState(
  state: Record<string, unknown>,
  onPropChange?: (propName: string, value: unknown) => void,
  options?: {canControlOpenState?: boolean; knobs?: KnobProp[]},
): Record<string, unknown> {
  if (onPropChange == null) {
    return state;
  }

  const knobs = options?.knobs ?? [];
  const knownProps = new Set(knobs.map(knob => knob.row.name));
  const next: Record<string, unknown> = {...state};
  let changed = false;

  for (const {row, control} of knobs) {
    if (control.kind !== 'callback') {
      continue;
    }
    // Only change handlers — not side-effect callbacks (changeAction) or
    // one-off events (onClick).
    if (!/^on[A-Z].*Change$/.test(row.name) && row.name !== 'onChange') {
      continue;
    }
    const target = resolveChangeTarget(row.name, row.type, state, knownProps);
    if (target == null) {
      continue;
    }
    if (target === 'isOpen' && options?.canControlOpenState !== true) {
      continue;
    }
    next[row.name] = (value: unknown) => onPropChange(target, value);
    changed = true;
  }

  // Fallback when knobs aren't supplied: bridge a controllable isOpen pair.
  if (
    !changed &&
    options?.canControlOpenState === true &&
    typeof state.isOpen === 'boolean'
  ) {
    next.onOpenChange = (isOpen: boolean) => onPropChange('isOpen', isOpen);
    return next;
  }

  return changed ? next : state;
}
