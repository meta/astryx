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
 * The active marker's colour. Table's one row-paint path owns the active
 * fill, so this module writes no background or row overlay.
 */
const activeBarColor = colorVars['--color-accent'];

/**
 * Press-taking gate, carried as a private custom property instead of an
 * attribute. The subscriber sets it while the row takes activation presses
 * and removes it otherwise; the cursor rule below reads it, so no public
 * name is needed to carry press-taking liveness into CSS.
 */
const ELIGIBLE_CURSOR_VAR = '--_table-activation-cursor';

/** Width of the leading-edge active bar, the non-colour active cue. */
const ACTIVE_BAR_WIDTH_PX = 3;

/**
 * First-cell gate for the forced-colors bar rule below. The bar lives on the
 * row's first cell (box-shadow misses `<tr>`), so the rule keys off the
 * active row's first child.
 */
const ACTIVE_FIRST_CELL: string = ':where([data-active="true"]) > :first-child';

/** Rows whose `aria-current="true"` this module wrote. Membership decides
 * cleanup: only the exposure this module wrote comes off, so a competing
 * owner's value survives. */
const rowsWithModuleCurrentState = new WeakSet<HTMLTableRowElement>();

/** Bar cell per row. The bar is inline paint on the first cell, so clearing
 * a deactivated row needs the cell without a public marker attribute. */
const barCells = new WeakMap<HTMLTableRowElement, HTMLTableCellElement>();

/** Whether a row already exposes current state this module must not overwrite. */
function hasCompetingCurrentOwner(row: Element | null): boolean {
  const current = row?.getAttribute('aria-current');
  // `aria-current="false"` states no current state, so only a real state
  // value competes: one this module would otherwise overwrite.
  return current != null && current !== 'true' && current !== 'false';
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
 * Apply or remove active styling on a `<tr>` element.
 *
 * Active state is a `data-active` attribute, `aria-current="true"`, plus the
 * non-colour marker: a leading-edge accent bar on the first cell. Table's
 * row-paint path owns the fill. The bar is an inset shadow on the first cell in default mode; under forced colors the
 * shadow maps to nothing, so the stylesheet rule below paints an outline
 * there instead, which draws over the cell in a system color and follows
 * mode changes without a store update. No selection
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
    rowsWithModuleCurrentState.add(row);
  } else {
    clearRowActivationStyle(row);
    return;
  }
  // The bar lives on the first cell rather than the row: box-shadow does not
  // paint reliably on `<tr>`. Direction reads the row's own computed style,
  // not the nearest ancestor that names one.
  const firstCell = row.cells[0];
  const previousBarCell = barCells.get(row);
  if (previousBarCell != null && previousBarCell !== firstCell) {
    clearBarCell(previousBarCell);
  }
  if (firstCell == null) {
    return;
  }
  // Reserve the bar's edge from the pinned overlay: a pinned cell replays
  // the row wash on a ::before layer above the cell's own paint, which would
  // otherwise cover the inset bar. Other cells ignore the variable.
  firstCell.style.setProperty(
    '--_table-row-overlay-inset',
    `${ACTIVE_BAR_WIDTH_PX}px`,
  );
  // Inline shadow only. Forced colors drop this shadow. The forced-colors
  // rule in `activationStyles` draws the marker.
  const bar = `inset ${isRtlElement(row) ? '-' : ''}${ACTIVE_BAR_WIDTH_PX}px 0 0 ${activeBarColor}`;
  if (firstCell.style.boxShadow !== bar) {
    firstCell.style.boxShadow = bar;
  }
  barCells.set(row, firstCell);
}
/**
 * Remove everything this module wrote on a `<tr>`: the active attribute and
 * current-state exposure, the press-taking cursor gate, plus the bar from
 * whichever cell carries it. The cursor and marker classes stay: they are
 * stamped on every transformed row and their rules key off the attributes
 * and variables the subscriber maintains. Cleanup paths call this rather
 * than only unsubscribing, so a row that becomes ineligible, loses its
 * plugin, or loses `idKey` while mounted never keeps stale active paint.
 * Only the `aria-current="true"` this module wrote is removed; a competing
 * owner's value stays untouched.
 */
function clearRowActivationStyle(row: HTMLTableRowElement): void {
  row.removeAttribute('data-active');
  if (row.style.getPropertyValue(ELIGIBLE_CURSOR_VAR) !== '') {
    row.style.removeProperty(ELIGIBLE_CURSOR_VAR);
  }
  // Only the exposure this module wrote comes off: the set tracks it, so a
  // competing owner's value survives cleanup.
  if (rowsWithModuleCurrentState.has(row)) {
    rowsWithModuleCurrentState.delete(row);
    if (row.getAttribute('aria-current') === 'true') {
      row.removeAttribute('aria-current');
    }
  }
  const barCell = barCells.get(row);
  if (barCell != null) {
    barCells.delete(row);
    clearBarCell(barCell);
  }
}

/** Clear every bar style the module may have written on a bar cell. */
function clearBarCell(cell: HTMLTableCellElement): void {
  cell.style.boxShadow = '';
  cell.style.removeProperty('--_table-row-overlay-inset');
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
   * Press-target cursor, gated on the private cursor variable rather than on
   * class presence. These classes are stamped on every transformed row and
   * stay in `className` across re-renders, so a `TableRow` re-render from a
   * `TableContext` change (stripes, dividers, hover) that reuses stale
   * transform props cannot strand or steal the cursor: only the live
   * variable paints it. An unset variable makes the declaration invalid at
   * computed-value time, which falls back to the default cursor.
   */
  clickableRow: {
    cursor: {
      default: null,
      ':where(:not(:disabled,[aria-disabled="true"]))': `var(${ELIGIBLE_CURSOR_VAR})`,
    },
  },
  /**
   * Forced-colors bar. The inline shadow below maps to nothing under forced
   * colors, so the marker needs a rule that follows the mode by itself: an
   * outline branch that only matches `forced-colors: active`, keyed off the
   * active row's first cell. The width reuses the module bar constant.
   */
  forcedColorsBar: {
    outline: {
      default: null,
      [ACTIVE_FIRST_CELL]: {
        '@media (forced-colors: active)': `${ACTIVE_BAR_WIDTH_PX}px solid CanvasText`,
      },
    },
    outlineOffset: {
      default: null,
      [ACTIVE_FIRST_CELL]: {
        '@media (forced-colors: active)': `-${ACTIVE_BAR_WIDTH_PX}px`,
      },
    },
  },
});

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

/** Stylesheet classes for the forced-colors bar, resolved once and stamped on every transformed row. */
let forcedColorsBarClassNames: ReadonlyArray<string> | null = null;

export function getForcedColorsBarClassNames(): ReadonlyArray<string> {
  if (forcedColorsBarClassNames == null) {
    forcedColorsBarClassNames = Object.freeze(
      (stylex.props(activationStyles.forcedColorsBar).className ?? '')
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  return forcedColorsBarClassNames;
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
      // activation in the parent pipeline with a diagnostic. The claim also
      // publishes canonical identity on the row context (see
      // `TableRowContext`); no separate opt-in is declared.
      wholeRowOwner: 'activation',
      transformBodyRow(
        props: BodyRowRenderProps,
        item: T,
        _index: number,
        context?: TableRowContext,
      ): BodyRowRenderProps {
        const {getIsItemActivatable} = store.getConfig();
        // The first apply reuses this result. Later applies and every press
        // call the predicate again.
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
        // stop and key affordances that would do nothing. `false` states no
        // current state, matching `hasCompetingCurrentOwner`, so skipping it
        // keeps the result independent of plugin order.
        const declaredCurrent = props.htmlProps['aria-current'];
        // ARIA `false` states no current state, unlike JSX children:
        // `isRenderable` would skip `true` and keep `'false'`.
        const declaresCompetingCurrent =
          // eslint-disable-next-line @astryx/no-nullish-jsx-guard -- aria-current states differ from JSX renderability
          declaredCurrent != null &&
          declaredCurrent !== false &&
          declaredCurrent !== 'false';
        if (declaresCompetingCurrent) {
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

        // The keyboard affordances an eligible row takes: a tab stop only
        // when earlier props declare none, so an explicit -1 (roving
        // focus) or another owner's tab stop survives, and Enter/Space
        // beside the key announcements earlier props declare.
        const earlierTabIndex = props.htmlProps.tabIndex;
        const earlierShortcuts = props.htmlProps['aria-keyshortcuts'] ?? null;
        const ownTabIndex = earlierTabIndex ?? 0;
        const ownShortcuts = withActivationShortcuts(earlierShortcuts);

        // Imperative active-state reflection, subscribed to the store: a
        // controlled-key change reaches mounted rows without re-rendering
        // the table, touching at most the rows whose state flips. Eligibility
        // re-resolves live on every apply and every press, so flipping the
        // caller predicate takes effect without waiting for a row update;
        // the render-time value below only decides the static affordances.
        const isEligibleNow = () =>
          store.getConfig().getIsItemActivatable?.(item) ?? true;
        // Declarative snapshot for this render; the subscriber below keeps
        // it fresh between renders.
        const activeNow = eligible && key === store.getConfig().activeKey;
        const activationRef: React.RefCallback<HTMLTableRowElement> = row => {
          if (!row) {
            return;
          }
          // The render above already declared this row's affordances for its
          // render-time eligibility. The subscriber changes them only when
          // liveness flips between renders: the caller predicate changed, or
          // a later plugin marked the row current.
          let lastInteractive: boolean = eligible;
          let lastActive: boolean | null = null;
          const applyStyle = (eligibleNow: boolean) => {
            const interactive = eligibleNow && !hasCompetingCurrentOwner(row);
            const active = eligibleNow && key === store.getConfig().activeKey;
            if (active !== lastActive) {
              lastActive = active;
              applyRowActivationStyle(row, active);
            }
            // Press-taking liveness rides the private cursor variable.
            // Clearing the active paint above also clears it, so it is set
            // again here whenever the row takes presses.
            const cursor = interactive ? 'pointer' : '';
            if (row.style.getPropertyValue(ELIGIBLE_CURSOR_VAR) !== cursor) {
              if (interactive) {
                row.style.setProperty(ELIGIBLE_CURSOR_VAR, cursor);
              } else {
                row.style.removeProperty(ELIGIBLE_CURSOR_VAR);
              }
            }
            if (interactive === lastInteractive) {
              return;
            }
            lastInteractive = interactive;
            // The tab stop and key announcements follow liveness. A row that
            // stops taking presses gets back what earlier props declared.
            if (interactive) {
              row.setAttribute('tabindex', String(ownTabIndex));
              row.setAttribute('aria-keyshortcuts', ownShortcuts);
              return;
            }
            if (earlierTabIndex == null) {
              row.removeAttribute('tabindex');
            } else {
              row.setAttribute('tabindex', String(earlierTabIndex));
            }
            if (earlierShortcuts == null) {
              row.removeAttribute('aria-keyshortcuts');
            } else {
              row.setAttribute('aria-keyshortcuts', earlierShortcuts);
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

        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            // The cursor and forced-colors marker classes ride every
            // transformed row, unconditionally: their rules key off the
            // `data-active` attribute and the cursor variable the subscriber
            // maintains, so a row re-render (a TableContext change rewrites
            // the className React owns without re-running this transform)
            // keeps the cursor and marker from the live row state instead of
            // stale render-time values.
            className: [
              props.htmlProps.className,
              ...getClickableRowClassNames(),
              ...getForcedColorsBarClassNames(),
            ]
              .filter(Boolean)
              .join(' '),
            ...(activeNow ? {'data-active': 'true' as const} : null),
            // Seeded from the render-time eligibility; the subscriber
            // corrects it against competing owners and later flips. Merged
            // over earlier plugins' row style, which the spread preserves.
            ...(eligible
              ? {
                  style: {
                    ...props.htmlProps.style,
                    [ELIGIBLE_CURSOR_VAR]: 'pointer',
                  } as React.CSSProperties,
                }
              : null),
            ...(eligible
              ? {tabIndex: ownTabIndex, 'aria-keyshortcuts': ownShortcuts}
              : null),
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
    [store],
  );
}
