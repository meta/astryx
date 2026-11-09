// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableActivation.tsx
 * @input React, StyleX, Table types, shared click guards, theme tokens
 * @output Exports useTableActivation hook and UseTableActivationConfig type
 * @position Row-activation plugin; consumed by Table via plugins prop
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Table/useTableActivation.doc.mjs (config prop table)
 * - /packages/core/src/Table/Table.doc.mjs (activation documentation)
 * - /packages/core/src/Table/index.ts (exports)
 */

import {useEffect, useMemo, useRef} from 'react';
import * as stylex from '@stylexjs/stylex';
import {colorVars} from '../../../theme/tokens.stylex';
import {focusOutlineStyles} from '../../../utils/focusOutline.stylex';
import {mergeRefs} from '../../../utils/mergeRefs';
import {warnOnce} from '../../../utils/devWarning';
import {isRtlElement} from '../../../hooks/isRtlElement';
import {shouldSuppressRowPress} from '../../rowPressGuard';
import type {
  TablePlugin,
  BodyRowRenderProps,
  TableRowContext,
} from '../../types';

// =============================================================================
// Config Type
// =============================================================================

/**
 * Configuration for useTableActivation (master-detail current-row state).
 *
 * The consumer owns the `activeKey` state (via `useState`); the plugin makes
 * eligible rows activatable by primary click or Enter/Space and reflects the
 * controlled key back onto the matching row.
 */
export interface UseTableActivationConfig<T extends Record<string, unknown>> {
  /**
   * The currently active row's resolved key, or `null` for no active row.
   * Compared with Table's resolved canonical key using strict equality, so a
   * string `"42"` never matches the number `42`. Fully controlled: the plugin
   * never mutates it — respond to `onActivate` to update it.
   */
  activeKey: string | number | null;
  /**
   * Called once with `(item, key)` when an eligible row is activated by a
   * primary click or non-repeated Enter/Space. Receives the same resolved
   * key Table used for the comparison.
   */
  onActivate: (item: T, key: string | number) => void;
  /**
   * Control which rows are activatable. Ineligible rows get no keyboard
   * affordance, no pointer cursor, and no active presentation, even when
   * their key equals `activeKey`; their press handlers stay attached but
   * ignore the press, so a later flip needs no row update. @default all rows activatable
   */
  getIsItemActivatable?: (item: T) => boolean;
}

// =============================================================================
// Activation Store (external store for fine-grained row subscriptions)
// =============================================================================

/**
 * Lightweight external store that lets each row subscribe to activation
 * changes independently, following the useTableSelection pattern. Row state
 * is applied imperatively through per-row ref callbacks, so changing only
 * `activeKey` touches at most the old and new active rows instead of
 * re-rendering the table.
 *
 * Subscriptions are bucketed by canonical row key. A key-only update
 * notifies only the buckets for the previous and current active keys; a
 * predicate change notifies every bucket, because any row may have flipped
 * eligibility. Anything else notifies only the current active bucket — a
 * new `onActivate` identity included, since it changes no row state — and
 * the subscriber writes only where its snapshot changed, which keeps the
 * bound for the documented inline-callback usage.
 */
interface ActivationStore<T extends Record<string, unknown>> {
  subscribe: (key: string | number, listener: () => void) => () => void;
  notify: () => void;
  getConfig: () => UseTableActivationConfig<T>;
}

function createActivationStore<T extends Record<string, unknown>>(
  configRef: React.RefObject<UseTableActivationConfig<T>>,
): ActivationStore<T> {
  const buckets = new Map<string | number, Set<() => void>>();
  let previous = configRef.current;

  const notifyBuckets = (keys: ReadonlyArray<string | number | null>) => {
    for (const key of keys) {
      if (key == null) {
        continue;
      }
      for (const listener of buckets.get(key) ?? []) {
        listener();
      }
    }
  };

  return {
    subscribe(key: string | number, listener: () => void) {
      let bucket = buckets.get(key);
      if (bucket == null) {
        bucket = new Set();
        buckets.set(key, bucket);
      }
      bucket.add(listener);
      return () => {
        bucket.delete(listener);
        // Empty buckets leave the map: the store keeps no entry for a row
        // id it no longer serves.
        if (bucket.size === 0) {
          buckets.delete(key);
        }
      };
    },
    notify() {
      const current = configRef.current;
      if (current.getIsItemActivatable !== previous.getIsItemActivatable) {
        for (const bucket of buckets.values()) {
          for (const listener of bucket) {
            listener();
          }
        }
      } else if (current.activeKey !== previous.activeKey) {
        notifyBuckets([previous.activeKey, current.activeKey]);
      } else {
        notifyBuckets([current.activeKey]);
      }
      // A new `onActivate` identity alone changes no row state: presses
      // read the live config at press time, and the subscriber below skips
      // rows whose snapshot did not change.
      previous = current;
    },
    getConfig() {
      return configRef.current;
    },
  };
}

// =============================================================================
// Active-state reflection
// =============================================================================

/**
 * The row's active fill, republished for pinned cells to read. The same
 * `--table-row-overlay` contract useTableSelection and TableRow honour for
 * striping, hover, and selection: a pinned column paints its own opaque
 * background over the row, and replays this variable so the active state
 * reads on through the freeze line.
 */
const activeWash = colorVars['--color-accent-muted'];
const activeBarColor = colorVars['--color-accent'];

/**
 * Attribute gate for the active wash. `data-active` is maintained
 * imperatively by the store subscriber (and seeded declaratively below), so
 * it survives a `className` rewrite from stale transform props; `:where`
 * keeps the specificity of the plain class it replaces, so the settled
 * stripe/hover/selection precedence is unchanged.
 */
const ACTIVE_ROW: string = ':where([data-active="true"])';

/**
 * Attribute gate for the press-target cursor. The subscriber maintains it
 * alongside the tab stop: present while the row takes activation presses
 * (eligible with no competing current owner), absent otherwise.
 */
const ELIGIBLE_ROW: string = ':where([data-activation-eligible="true"])';

/**
 * Active-plus-hover gate. The plain active gate above intentionally keeps
 * `:where` specificity so the settled stripe/selection precedence is
 * unchanged; this one drops it so the active fill keeps dominating while
 * hovered (selection still wins through its inline wash either way).
 */
const ACTIVE_HOVER_ROW: string = '[data-active="true"]:hover';

/** Width of the leading-edge active bar, the non-colour active cue. */
const ACTIVE_BAR_WIDTH_PX = 3;

/** Whether a row already exposes current state this module must not overwrite. */
function hasCompetingCurrentOwner(row: Element | null): boolean {
  const current = row?.getAttribute('aria-current');
  return current != null && current !== 'true';
}

/**
 * Compose Enter/Space discoverability with the key announcements already on
 * the row instead of replacing them.
 */
function withActivationShortcuts(live: string | null): string {
  const tokens = new Set((live ?? '').split(/\s+/).filter(Boolean));
  tokens.add('Enter');
  tokens.add('Space');
  return [...tokens].join(' ');
}

/**
 * Remove this module's own tokens, so restoring a row that stopped taking
 * presses never strands Enter/Space announcements on it. Null when nothing
 * remains, so the caller removes the attribute instead of blanking it.
 */
function stripActivationTokens(live: string | null): string | null {
  const tokens = (live ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => token !== 'Enter' && token !== 'Space');
  return tokens.length > 0 ? tokens.join(' ') : null;
}

/**
 * Apply or remove active styling on a `<tr>` element.
 *
 * Active state is a `data-active` attribute, `aria-current="true"`, plus
 * paint on the existing row anatomy: an accent wash and a leading-edge accent
 * bar on the first cell. The wash rides the shared row-overlay variable so
 * pinned cells replay it through the freeze line; its stylesheet rule keys
 * off `data-active`, so no class toggling is needed here. The bar is an
 * inset shadow on the first cell; under forced colors the shadow maps to
 * nothing and the pinned overlay covers the cell, so there the marker is an
 * outline, which draws over the cell in a system color. No selection
 * semantics are inferred: `aria-selected` is never written here.
 */

function applyRowActivationStyle(
  row: HTMLTableRowElement,
  isActive: boolean,
): void {
  if (isActive) {
    // A pre-existing current-state owner keeps its semantics: activation
    // stays off this row rather than overwriting navigation or selection
    // state it does not own. The declarative snapshot below cannot see the
    // DOM, so a conflicting row sheds that paint here on mount.
    if (hasCompetingCurrentOwner(row)) {
      warnOnce(
        'table-activation-current-owner',
        'useTableActivation',
        'Table row already exposes its own aria-current state, so row activation stays inert for it. ' +
          'Remove the competing state or the activation plugin for this row.',
      );
      clearRowActivationStyle(row);
      return;
    }
    row.setAttribute('data-active', 'true');
    row.setAttribute('aria-current', 'true');
    row.setAttribute('data-activation-current', 'true');
  } else {
    clearRowActivationStyle(row);
    return;
  }
  // The bar lives on the first cell rather than the row: box-shadow does not
  // paint reliably on `<tr>`. Direction reads the row's own computed style,
  // not the nearest ancestor that names one.
  const firstCell = row.cells[0];
  const previousBarCell = row.querySelector<HTMLTableCellElement>(
    '[data-activation-bar="true"]',
  );
  if (previousBarCell != null && previousBarCell !== firstCell) {
    clearBarCell(previousBarCell);
    previousBarCell.removeAttribute('data-activation-bar');
  }
  if (firstCell == null) {
    return;
  }
  // Reserve the bar's edge from the pinned overlay: a pinned cell replays
  // the row wash on a ::before layer above the cell's own paint, which would
  // otherwise cover the inset bar. Other cells ignore the variable.
  firstCell.style.setProperty(
    '--table-row-overlay-inset',
    `${ACTIVE_BAR_WIDTH_PX}px`,
  );
  if (forcedColorsActive()) {
    firstCell.style.boxShadow = '';
    firstCell.style.outline = `${ACTIVE_BAR_WIDTH_PX}px solid CanvasText`;
    firstCell.style.outlineOffset = `-${ACTIVE_BAR_WIDTH_PX}px`;
  } else {
    firstCell.style.outline = '';
    firstCell.style.outlineOffset = '';
    const bar = `inset ${isRtlElement(row) ? '-' : ''}${ACTIVE_BAR_WIDTH_PX}px 0 0 ${activeBarColor}`;
    if (firstCell.style.boxShadow !== bar) {
      firstCell.style.boxShadow = bar;
    }
  }
  firstCell.setAttribute('data-activation-bar', 'true');
}
/**
 * Remove everything this module wrote on a `<tr>`: the active attribute and
 * current-state exposure, the eligibility attribute, plus the bar from
 * whichever cell carries it. The wash and cursor classes stay: they are
 * stamped on every transformed row and their rules key off the attributes
 * removed here. Cleanup paths call this rather than only unsubscribing, so a
 * row that becomes ineligible, loses its plugin, or loses `idKey` while
 * mounted never keeps stale active paint. Only the `aria-current="true"`
 * this module wrote is removed; a competing owner's value stays untouched.
 */
function clearRowActivationStyle(row: HTMLTableRowElement): void {
  row.removeAttribute('data-active');
  row.removeAttribute('data-activation-eligible');
  // Only the exposure this module wrote comes off: the marker tracks it, so
  // a competing owner's value survives cleanup.
  if (row.hasAttribute('data-activation-current')) {
    row.removeAttribute('data-activation-current');
    if (row.getAttribute('aria-current') === 'true') {
      row.removeAttribute('aria-current');
    }
  }
  const barCell = row.querySelector<HTMLTableCellElement>(
    '[data-activation-bar="true"]',
  );
  if (barCell != null) {
    clearBarCell(barCell);
    barCell.removeAttribute('data-activation-bar');
  }
}

/** Clear every bar style the module may have written on a bar cell. */
function clearBarCell(cell: HTMLTableCellElement): void {
  cell.style.boxShadow = '';
  cell.style.outline = '';
  cell.style.outlineOffset = '';
  cell.style.removeProperty('--table-row-overlay-inset');
}

/** Whether the forced-colors media query currently matches. */
function forcedColorsActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(forced-colors: active)').matches
  );
}

// =============================================================================
// Event guards
// =============================================================================

/**
 * Whether a pointer press must not activate its row: a row another owner
 * marked current stays fully inactive (presses neither request activation
 * nor repaint it), or the press belongs to something else — portalled
 * content, nested rows, interactive descendants, editable surfaces, or an
 * intersecting text selection (see `shouldSuppressRowPress`).
 */
function shouldSuppressActivation(
  row: HTMLTableRowElement,
  target: EventTarget | null,
): boolean {
  if (hasCompetingCurrentOwner(row)) {
    return true;
  }
  return shouldSuppressRowPress(row, target);
}

// =============================================================================
// Styles
// =============================================================================

const activationStyles = stylex.create({
  /**
   * Press-target cursor, gated on the eligibility attribute rather than on
   * class presence. These classes are stamped on every transformed row and
   * stay in `className` across re-renders, so a `TableRow` re-render from a
   * `TableContext` change (stripes, dividers, hover) that reuses stale
   * transform props cannot strand or steal the cursor: only the live
   * attribute paints it.
   */
  clickableRow: {
    cursor: {
      default: null,
      [`${ELIGIBLE_ROW}:not(:disabled,[aria-disabled="true"])`]: 'pointer',
    },
  },
  /**
   * Active-row wash as a stylesheet rule rather than an inline style.
   * Selection writes its wash inline, so a selected row deterministically
   * keeps the selection fill however the two plugins interleave; an
   * unselected active row shows this wash, including while hovered (the
   * hover-combined rule below outranks the row hover rule the way the
   * plain gate cannot). The overlay variable rides along
   * so pinned cells replay the active state through the freeze line, under
   * the same contract striping, hover, and selection honour. Gated on the
   * active attribute for the same staleness reason as the cursor above.
   */
  activeWash: {
    backgroundColor: {
      default: null,
      [ACTIVE_ROW]: activeWash,
      [ACTIVE_HOVER_ROW]: {
        '@media (hover: hover)': activeWash,
      },
    },
    '--table-row-overlay': {
      default: null,
      [ACTIVE_ROW]: activeWash,
      [ACTIVE_HOVER_ROW]: {
        '@media (hover: hover)': activeWash,
      },
    },
  },
});

/** Stylesheet classes for the active wash, resolved once and stamped on every transformed row. */
let activeWashClassNames: ReadonlyArray<string> | null = null;

export function getActiveWashClassNames(): ReadonlyArray<string> {
  if (activeWashClassNames == null) {
    activeWashClassNames = Object.freeze(
      (stylex.props(activationStyles.activeWash).className ?? '')
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  return activeWashClassNames;
}

/** Stylesheet classes for the pointer cursor, resolved once and stamped on every transformed row. */
let clickableRowClassNames: ReadonlyArray<string> | null = null;

export function getClickableRowClassNames(): ReadonlyArray<string> {
  if (clickableRowClassNames == null) {
    clickableRowClassNames = Object.freeze(
      (stylex.props(activationStyles.clickableRow).className ?? '')
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  return clickableRowClassNames;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Returns a TablePlugin that makes rows activatable for master-detail,
 * preview, and inspector layouts.
 *
 * The consumer owns the `activeKey` state (via `useState`); the plugin adds
 * one whole-row press path — primary click or Enter/Space, after any earlier
 * row handlers run (`preventDefault` cancels) — and reflects the controlled
 * key as `data-active` plus component-owned active styling that reaches
 * pinned cells.
 *
 * Requires an explicit `idKey` on the Table: without stable row identity the
 * plugin stays inert. The eligible active row exposes `aria-current="true"`
 * (removed when it stops being the current row); `aria-selected` is never
 * written — activation is not selection, and callers that need selection
 * semantics own them through the selection surface.
 *
 * @example
 * ```
 * const [activeKey, setActiveKey] = useState<string | null>(null);
 * const activation = useTableActivation({
 *   activeKey,
 *   onActivate: (item, key) => setActiveKey(key),
 * });
 * <Table data={orders} columns={columns} idKey="id" plugins={{activation}} />;
 * ```
 */
export function useTableActivation<T extends Record<string, unknown>>(
  config: UseTableActivationConfig<T>,
): TablePlugin<T> {
  const configRef = useRef(config);
  configRef.current = config;

  const storeRef = useRef<ActivationStore<T> | null>(null);
  if (storeRef.current == null) {
    storeRef.current = createActivationStore(configRef);
  }
  const store = storeRef.current;

  // Affordance baselines by mounted row. The row ref below re-attaches
  // whenever the transform re-renders the row, so a snapshot taken there
  // can hold this module's own writes; the record lets a re-attach tell
  // those apart from another plugin's values.
  const rowBaselines = useMemo(
    () =>
      new WeakMap<
        HTMLTableRowElement,
        {
          rowKey: string | number | undefined;
          ownedTabIndex: string | null;
          ownedShortcuts: string | null;
          writtenTabIndex: string | null | undefined;
          writtenShortcuts: string | null | undefined;
        }
      >(),
    [],
  );

  // Notify subscribers on every render — row ref subscribers re-apply
  // imperative styling only where their snapshot changed. Callback and key
  // changes ride the store, so the returned plugin keeps a stable identity.
  useEffect(() => {
    store.notify();
  });

  return useMemo(
    (): TablePlugin<T> => ({
      // Flat row model: one product row per data item. Non-flat models make
      // the row kind `unknown`, which stays inert below.
      rowModel: 'flat',
      // Whole-row ownership: this plugin owns the row's primary press path.
      // A second claim (including a repeated activation entry) neutralizes
      // activation in the parent pipeline with a diagnostic.
      wholeRowOwner: 'activation',
      // Canonical identity opt-in: Table publishes the resolved key and its
      // status on the row context (see `TableRowContext`).
      usesCanonicalRowKey: true,
      transformBodyRow(
        props: BodyRowRenderProps,
        item: T,
        _index: number,
        context?: TableRowContext,
      ): BodyRowRenderProps {
        const {getIsItemActivatable} = store.getConfig();
        // Eligibility resolves once per row update; the first subscriber
        // apply below reuses this result rather than re-invoking the caller
        // predicate, while later applies and every press re-resolve it live.
        const eligible = getIsItemActivatable?.(item) ?? true;
        // Identity and admission come from the row context: no usable key
        // without an explicit idKey, and only flat product rows admit
        // activation. Grouped, tree, detail, and undeclared custom models
        // resolve a non-product kind, which stays inert with a development
        // diagnostic. The parent owns the missing-idKey diagnostic, so an
        // invalid value under an explicit idKey stays silent here.
        const rowKey = context?.key;
        if (
          rowKey === undefined ||
          context?.identityStatus !== 'valid' ||
          context?.kind !== 'product'
        ) {
          if (
            context != null &&
            context.kind !== 'product' &&
            context.identityStatus === 'valid'
          ) {
            warnOnce(
              'table-activation-non-product-row',
              'useTableActivation',
              'Row activation admits only flat product rows, so this row stays inert. ' +
                'Remove the activation plugin from grouped, tree, detail, or custom tables.',
            );
          }
          return props;
        }
        // A row an earlier plugin already marked current keeps its
        // semantics: activation stays fully off it rather than adding a tab
        // stop and key affordances that would do nothing. Presses and paint
        // shed competing owners independently of plugin order.
        if (props.htmlProps['aria-current'] != null) {
          warnOnce(
            'table-activation-current-owner-early',
            'useTableActivation',
            'Table row already exposes its own aria-current state, so row activation stays inert for it. ' +
              'Remove the competing state or the activation plugin for this row.',
          );
          return props;
        }
        const key: string | number = rowKey;

        const priorOnClick = props.htmlProps.onClick;
        const priorOnKeyDown = props.htmlProps.onKeyDown;

        // An earlier plugin's explicit tabIndex (including -1 for roving
        // focus) stays authoritative; rows are sequential stops by default.
        // The default below is only seeded into the props downstream
        // transforms see: the subscriber owns the mounted attribute (see the
        // ref callback), so a later plugin's explicit value is never mistaken
        // for this default.
        const tabIndex = props.htmlProps.tabIndex ?? 0;

        // Imperative active-state reflection, subscribed to the store: a
        // controlled-key change reaches mounted rows without re-rendering
        // the table, touching at most the rows whose state flips. Eligibility
        // re-resolves live on every apply and every press, so flipping the
        // caller predicate takes effect without waiting for a row update;
        // the render-time value below only decides the static affordances.
        const isEligibleNow = () =>
          store.getConfig().getIsItemActivatable?.(item) ?? true;
        const activationRef: React.RefCallback<HTMLTableRowElement> = row => {
          if (!row) {
            return;
          }
          // Mount-time affordances belong to the subscriber, not the
          // declarative props: the transform above seeds no tab stop and no
          // key announcements, so the mounted values are exactly what earlier
          // and later plugins declared. That snapshot is the owned baseline —
          // restoring it later never strands or steals another plugin's focus
          // ownership, whichever side of activation declared it. Matching
          // values are no signal (a later plugin's explicit `tabIndex={0}`
          // reads the same as this module's default), so ownership is
          // positional — what the DOM holds before this module first writes —
          // never inferred from equality.
          //
          // The ref re-attaches whenever the transform re-renders the row, so
          // a later snapshot can hold this module's own writes. A live value
          // that matches the last write is never adopted as someone else's:
          // the earlier baseline and the write record survive, and only a
          // value nobody wrote becomes the new baseline. A row the record
          // does not know (or one recycled for another key) snapshots fresh.
          // `data-activation-eligible` is exempt: it is namespaced to this
          // module, so no other plugin writes it.
          const liveTabIndex = row.getAttribute('tabindex');
          const liveShortcuts = row.getAttribute('aria-keyshortcuts');
          const previousBaseline = rowBaselines.get(row);
          let ownedTabIndex: string | null;
          let ownedShortcuts: string | null;
          let writtenTabIndex: string | null | undefined;
          let writtenShortcuts: string | null | undefined;
          if (previousBaseline != null && previousBaseline.rowKey === key) {
            if (liveTabIndex === previousBaseline.writtenTabIndex) {
              ownedTabIndex = previousBaseline.ownedTabIndex;
              writtenTabIndex = previousBaseline.writtenTabIndex;
            } else {
              ownedTabIndex = liveTabIndex;
              writtenTabIndex = undefined;
            }
            if (liveShortcuts === previousBaseline.writtenShortcuts) {
              ownedShortcuts = previousBaseline.ownedShortcuts;
              writtenShortcuts = previousBaseline.writtenShortcuts;
            } else {
              ownedShortcuts = liveShortcuts;
              writtenShortcuts = undefined;
            }
          } else {
            ownedTabIndex = liveTabIndex;
            ownedShortcuts = liveShortcuts;
            writtenTabIndex = undefined;
            writtenShortcuts = undefined;
          }
          const baseline = {
            rowKey: key as string | number | undefined,
            ownedTabIndex,
            ownedShortcuts,
            writtenTabIndex,
            writtenShortcuts,
          };
          rowBaselines.set(row, baseline);
          // Last applied reflection for this row: a store broadcast over
          // an unchanged row stays a DOM no-op, so key-only updates keep
          // the at-most-two-rows bound even with an inline `onActivate`.
          // Last affordance values this module wrote: a live value that
          // differs is someone else's (a later plugin's imperative roving
          // update — the declarative props carry none of this module's),
          // so it is adopted into the baseline rather than overwritten.
          let lastInteractive: boolean | null = null;
          let lastActive = false;
          const applyStyle = (eligibleNow: boolean) => {
            // Keyboard affordances and the pointer cursor follow the same
            // liveness as paint and presses: a row a later plugin marked
            // current, or one the caller predicate now excludes, is not a
            // tab stop, shows no pointer, and announces no key affordances.
            // The transform runs before later plugins, so this converges
            // imperatively wherever the store reaches the row; full
            // order-independence waits on the parent admission protocol.
            const interactive = eligibleNow && !hasCompetingCurrentOwner(row);
            const active = eligibleNow && key === store.getConfig().activeKey;
            if (interactive === lastInteractive && active === lastActive) {
              return;
            }
            lastInteractive = interactive;
            lastActive = active;
            // Paint first: clearing inactive paint also clears the
            // eligibility attribute, which the liveness update below
            // re-applies for rows that keep it.
            applyRowActivationStyle(row, active);
            // Press-taking liveness rides the eligibility attribute, and the
            // tab stop and key announcements follow it: a row a later plugin
            // marked current, or one the caller predicate now excludes, is
            // not a tab stop, shows no pointer, and announces no key
            // affordances. Classes stay untouched: the wash and cursor rules
            // key off live attributes, so a `className` rewrite from stale
            // transform props cannot strand or steal them.
            if (interactive) {
              row.setAttribute('data-activation-eligible', 'true');
              // The owned tab stop stays untouched; only a row with none
              // takes this module's default. A live value this module did
              // not write is adopted, so a later plugin's imperative update
              // (roving focus) survives the next exclusion.
              const liveTabIndex = row.getAttribute('tabindex');
              if (liveTabIndex == null) {
                const next = baseline.ownedTabIndex ?? String(tabIndex);
                row.setAttribute('tabindex', next);
                baseline.writtenTabIndex = next;
              } else if (liveTabIndex !== baseline.writtenTabIndex) {
                baseline.ownedTabIndex = liveTabIndex;
                baseline.writtenTabIndex = undefined;
              }
              const liveShortcuts = row.getAttribute('aria-keyshortcuts');
              if (liveShortcuts !== baseline.writtenShortcuts) {
                // A live value this module did not write is adopted (minus
                // this module's own tokens, which the merge below re-adds),
                // so a later plugin's announcement update survives.
                baseline.ownedShortcuts = stripActivationTokens(liveShortcuts);
                const next = withActivationShortcuts(baseline.ownedShortcuts);
                row.setAttribute('aria-keyshortcuts', next);
                baseline.writtenShortcuts = next;
              }
            } else {
              row.removeAttribute('data-activation-eligible');
              // Restore the owned baseline, never blank it: a row the
              // predicate excludes keeps its owner's tab stop and key
              // announcements, whichever side of activation declared them.
              if (baseline.ownedTabIndex == null) {
                row.removeAttribute('tabindex');
              } else {
                row.setAttribute('tabindex', baseline.ownedTabIndex);
              }
              // The next apply re-establishes this module's affordances from
              // the baseline above, so its writes are never mistaken for
              // another plugin's.
              baseline.writtenTabIndex = undefined;
              if (baseline.ownedShortcuts == null) {
                row.removeAttribute('aria-keyshortcuts');
              } else {
                row.setAttribute('aria-keyshortcuts', baseline.ownedShortcuts);
              }
              baseline.writtenShortcuts = undefined;
            }
          };
          // The first apply reuses the render-time eligibility above, so the
          // caller predicate runs once per row on mount; later notifies
          // re-resolve it live.
          applyStyle(eligible);
          const unsubscribe = store.subscribe(key, () => {
            if (!row.isConnected) {
              clearRowActivationStyle(row);
              unsubscribe();
              return;
            }
            applyStyle(isEligibleNow());
          });
          return () => {
            clearRowActivationStyle(row);
            unsubscribe();
          };
        };

        // Declarative snapshot for this render; the subscriber above keeps
        // it fresh between renders. Ineligible rows keep the press handlers.
        // The handlers check eligibility live, so a later flip needs no
        // row update.
        const activeNow = eligible && key === store.getConfig().activeKey;

        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            // The wash and cursor classes ride every transformed row,
            // unconditionally: their rules key off the `data-active` and
            // `data-activation-eligible` attributes the subscriber maintains,
            // so a row re-render (a TableContext change rewrites the
            // className React owns without re-running this transform) keeps
            // paint and cursor from the live attributes instead of stale
            // render-time values.
            className: [
              props.htmlProps.className,
              ...getActiveWashClassNames(),
              ...getClickableRowClassNames(),
            ]
              .filter(Boolean)
              .join(' '),
            ...(activeNow ? {'data-active': 'true' as const} : null),
            // Seeded from the render-time eligibility; the subscriber
            // corrects it against competing owners and later flips.
            ...(eligible
              ? {'data-activation-eligible': 'true' as const}
              : null),
            // No declarative tab stop or key announcements: the subscriber
            // owns the mounted values from the plugins' baseline (above), so
            // server markup never bakes this module's default over a later
            // plugin's explicit ownership.
            onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
              const row = event.currentTarget;
              // Earlier accumulated handlers run first and may cancel the
              // activation request with preventDefault; their own side
              // effects are preserved either way.
              priorOnClick?.(event);
              if (event.defaultPrevented) {
                return;
              }
              if (!isEligibleNow()) {
                return;
              }
              // Primary-button presses only; auxiliary clicks stay with
              // earlier handlers.
              if (event.button !== 0) {
                return;
              }
              if (shouldSuppressActivation(row, event.target)) {
                return;
              }
              store.getConfig().onActivate(item, key);
            },
            onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
              priorOnKeyDown?.(event);
              if (event.defaultPrevented) {
                return;
              }
              if (!isEligibleNow()) {
                return;
              }
              const isEnter = event.key === 'Enter';
              const isSpace = event.key === ' ';
              if (!isEnter && !isSpace) {
                return;
              }
              // A keypress that started in a nested control belongs to that
              // control, even when focus is inside an activatable row.
              if (event.target !== event.currentTarget) {
                return;
              }
              if (hasCompetingCurrentOwner(event.currentTarget)) {
                return;
              }
              // Holding Space must not scroll the page, with or without
              // activation; holding Enter activates nothing either, without
              // claiming a browser default.
              if (isSpace) {
                event.preventDefault();
              }
              if (event.repeat) {
                return;
              }
              store.getConfig().onActivate(item, key);
            },
          },
          xstyle: [...props.xstyle, focusOutlineStyles.focusVisible],
          ref: props.ref ? mergeRefs(props.ref, activationRef) : activationRef,
        };
      },
    }),
    [store, rowBaselines],
  );
}
