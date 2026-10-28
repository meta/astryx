// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableActivation.tsx
 * @input React, StyleX, Table types, shared click guards, theme tokens
 * @output Exports useTableActivation hook and UseTableActivationConfig type
 * @position Row-activation plugin; consumed by Table via plugins prop
 *
 * Gives a data-driven Table one controlled current product-row state for
 * master-detail, preview, and inspector layouts. The caller owns the active
 * key and the response to activation; the plugin owns one whole-row press
 * path (primary click, Enter/Space) and active-state reflection on the
 * existing row anatomy.
 *
 * Activation is not selection, navigation, or focus ownership: the plugin
 * never emits aria-selected or aria-current, and it never moves focus or
 * loads detail content. Those stay with their respective owners.
 *
 * Row identity comes from Table's resolved canonical key (delivered as
 * `transformBodyRow`'s fourth argument), compared with `activeKey` by strict
 * equality. The plugin adds no key extractor of its own. Without an explicit
 * `idKey` on the Table, rows carry no stable identity and activation stays
 * inert with one development warning.
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
import {mergeRefs} from '../../../utils';
import {warnOnce} from '../../../utils/devWarning';
import {
  hasInteractiveAncestor,
  hasTextSelection,
} from '../../../hooks/useClickableContainer';
import type {TablePlugin, BodyRowRenderProps} from '../../types';

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
   * Control which rows are activatable. Ineligible rows get no activation
   * handler, no keyboard affordance, and no active presentation, even when
   * their key equals `activeKey`. @default all rows activatable
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
 */
interface ActivationStore<T extends Record<string, unknown>> {
  subscribe: (listener: () => void) => () => void;
  notify: () => void;
  getConfig: () => UseTableActivationConfig<T>;
}

function createActivationStore<T extends Record<string, unknown>>(
  configRef: React.RefObject<UseTableActivationConfig<T>>,
): ActivationStore<T> {
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify() {
      for (const listener of listeners) {
        listener();
      }
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
const ROW_OVERLAY_VAR = '--table-row-overlay';

const activeWash = colorVars['--color-accent-muted'];
const activeBarColor = colorVars['--color-accent'];

/** Width of the leading-edge active bar, the non-colour active cue. */
const ACTIVE_BAR_WIDTH_PX = 3;

/**
 * Apply or remove active styling on a `<tr>` element.
 *
 * Active state is a `data-active` attribute plus a component-owned fallback
 * on the existing row anatomy: an accent wash (republished through the row
 * overlay variable so pinned cells replay it) and a leading-edge accent bar
 * on the first cell, which keeps the state legible independent of colour.
 * No selection or navigation semantics are inferred: `aria-selected` and
 * `aria-current` are never written here.
 */
function applyRowActivationStyle(
  row: HTMLTableRowElement,
  isActive: boolean,
): void {
  if (isActive) {
    row.setAttribute('data-active', 'true');
  } else {
    row.removeAttribute('data-active');
  }
  const wash = isActive ? activeWash : '';
  if (row.style.backgroundColor !== wash) {
    row.style.backgroundColor = wash;
  }
  const currentOverlay = row.style.getPropertyValue(ROW_OVERLAY_VAR);
  if (wash === '') {
    if (currentOverlay !== '') {
      row.style.removeProperty(ROW_OVERLAY_VAR);
    }
  } else if (currentOverlay !== wash) {
    row.style.setProperty(ROW_OVERLAY_VAR, wash);
  }
  // The bar lives on the first cell rather than the row: box-shadow does not
  // paint reliably on `<tr>`, while a cell shadow sits above the cell's own
  // (possibly pinned-opaque) background. Logical side resolves from the
  // row's direction at apply time.
  const firstCell = row.cells[0];
  const previousBarCell = row.querySelector<HTMLTableCellElement>(
    '[data-activation-bar="true"]',
  );
  if (previousBarCell != null && previousBarCell !== firstCell) {
    previousBarCell.style.boxShadow = '';
    previousBarCell.removeAttribute('data-activation-bar');
  }
  if (!isActive || firstCell == null) {
    if (previousBarCell != null && !isActive) {
      previousBarCell.style.boxShadow = '';
      previousBarCell.removeAttribute('data-activation-bar');
    }
    return;
  }
  const isRTL = row.closest('[dir="rtl"]') != null;
  const bar = `inset ${isRTL ? '-' : ''}${ACTIVE_BAR_WIDTH_PX}px 0 0 ${activeBarColor}`;
  if (firstCell.style.boxShadow !== bar) {
    firstCell.style.boxShadow = bar;
  }
  firstCell.setAttribute('data-activation-bar', 'true');
}

// =============================================================================
// Event guards
// =============================================================================

/**
 * Whether a pointer press must not activate its row: portalled content
 * rendered outside the row, nested interactive descendants (buttons, links,
 * inputs, and equivalent roles share one definition in
 * `useClickableContainer`), editable surfaces, or a text selection
 * intersecting this row. Descendant behavior itself is never suppressed —
 * only the row's activation request is.
 */
function shouldSuppressActivation(
  row: HTMLTableRowElement,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  if (!row.contains(target)) {
    return true;
  }
  if (target !== row && hasInteractiveAncestor(target, row)) {
    return true;
  }
  // An edit inside a contenteditable region is not a row press. The shared
  // guard does not cover contenteditable (it would change every other
  // clickable surface), so the row path checks it separately.
  if (
    target !== row &&
    target.closest('[contenteditable]:not([contenteditable="false"])') != null
  ) {
    return true;
  }
  if (hasTextSelection(row)) {
    return true;
  }
  return false;
}

// =============================================================================
// Styles
// =============================================================================

const activationStyles = stylex.create({
  /** Eligible rows are press targets: signal interactivity. */
  clickableRow: {
    cursor: {
      default: 'pointer',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});

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
 * plugin stays inert. Activation never implies selection or navigation, so no
 * `aria-selected` or `aria-current` is emitted; callers that need those own
 * them through the selection or navigation surface.
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
      transformBodyRow(
        props: BodyRowRenderProps,
        item: T,
        _index: number,
        rowKey?: string | number,
      ): BodyRowRenderProps {
        const {getIsItemActivatable} = store.getConfig();
        // Eligibility resolves once per row update; the result below closes
        // over it rather than re-invoking the caller predicate.
        const eligible = getIsItemActivatable?.(item) ?? true;
        if (!eligible) {
          return props;
        }
        // No stable identity without an explicit idKey: stay inert rather
        // than keying activation by row position.
        if (rowKey === undefined) {
          warnOnce(
            'table-activation-missing-idkey',
            'useTableActivation',
            'Table rendered without an explicit idKey, so row activation is inert. ' +
              'Pass a stable unique idKey for rows to be activatable.',
          );
          return props;
        }
        const key: string | number = rowKey;

        const priorOnClick = props.htmlProps.onClick;
        const priorOnKeyDown = props.htmlProps.onKeyDown;

        // An earlier plugin's explicit tabIndex (including -1 for roving
        // focus) stays authoritative; rows are sequential stops by default.
        const tabIndex = props.htmlProps.tabIndex ?? 0;

        // Compose Enter/Space discoverability with earlier metadata instead
        // of replacing it.
        const priorShortcuts = props.htmlProps['aria-keyshortcuts'];
        const shortcutTokens = new Set(
          (typeof priorShortcuts === 'string' ? priorShortcuts : '')
            .split(/\s+/)
            .filter(Boolean),
        );
        shortcutTokens.add('Enter');
        shortcutTokens.add('Space');
        const keyShortcuts = [...shortcutTokens].join(' ');

        // Imperative active-state reflection, subscribed to the store: a
        // controlled-key change reaches mounted rows without re-rendering
        // the table, touching at most the rows whose state flips. The
        // applies reuse the eligibility resolved above, so the caller
        // predicate runs exactly once per row update; the live controlled
        // key is read from the store on every apply.
        const activationRef: React.RefCallback<HTMLTableRowElement> = row => {
          if (!row) {
            return;
          }
          const applyStyle = () => {
            applyRowActivationStyle(
              row,
              eligible && key === store.getConfig().activeKey,
            );
          };
          applyStyle();
          const unsubscribe = store.subscribe(() => {
            if (!row.isConnected) {
              unsubscribe();
              return;
            }
            applyStyle();
          });
          return () => {
            unsubscribe();
          };
        };

        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            tabIndex,
            'aria-keyshortcuts': keyShortcuts,
            onClick: (event: React.MouseEvent<HTMLTableRowElement>) => {
              const row = event.currentTarget;
              // Earlier accumulated handlers run first and may cancel the
              // activation request with preventDefault; their own side
              // effects are preserved either way.
              priorOnClick?.(event);
              if (event.defaultPrevented) {
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
          xstyle: [
            ...props.xstyle,
            activationStyles.clickableRow,
            focusOutlineStyles.focusVisible,
          ],
          ref: props.ref ? mergeRefs(props.ref, activationRef) : activationRef,
        };
      },
    }),
    [store],
  );
}
