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
 * never emits aria-selected, and it never moves focus or
 * loads detail content. Those stay with their respective owners. It owns
 * only `aria-current="true"` on the eligible active row.
 *
 * Row identity comes from Table's resolved canonical key (an internal fourth
 * `transformBodyRow` argument until the parent `TableRowContext` protocol
 * lands), compared with `activeKey` by strict
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
import {mergeRefs} from '../../../utils/mergeRefs';
import {warnOnce} from '../../../utils/devWarning';
import {isRtlElement} from '../../../hooks/isRtlElement';
import {hasInteractiveAncestor} from '../../../hooks/useClickableContainer';
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
const activeWash = colorVars['--color-accent-muted'];
const activeBarColor = colorVars['--color-accent'];

/** Width of the leading-edge active bar, the non-colour active cue. */
const ACTIVE_BAR_WIDTH_PX = 3;

/**
 * Apply or remove active styling on a `<tr>` element.
 *
 * Active state is a `data-active` attribute, `aria-current="true"`, plus
 * paint on the existing row anatomy: an accent wash class and a leading-edge
 * accent bar on the first cell. The wash rides the shared row-overlay
 * variable so pinned cells replay it through the freeze line. The bar is an
 * inset shadow on the first cell; under forced colors the shadow maps to
 * nothing and the pinned overlay covers the cell, so there the marker is an
 * outline, which draws over the cell in a system color. No selection
 * semantics are inferred: `aria-selected` is never written here.
 */
/** Whether a row already exposes current state this module must not overwrite. */
function hasCompetingCurrentOwner(row: Element | null): boolean {
  const current = row?.getAttribute('aria-current');
  return current != null && current !== 'true';
}

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
    row.classList.add(...getActiveWashClassNames());
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
 * current-state exposure, the wash, plus the bar from whichever cell carries
 * it. Cleanup paths call this rather than only unsubscribing, so a row that
 * becomes ineligible, loses its plugin, or loses `idKey` while mounted never
 * keeps stale active paint. Only the `aria-current="true"` this module wrote
 * is removed; a competing owner's value stays untouched.
 */
function clearRowActivationStyle(row: HTMLTableRowElement): void {
  row.removeAttribute('data-active');
  // Only the exposure this module wrote comes off: the marker tracks it, so
  // a competing owner's value survives cleanup.
  if (row.hasAttribute('data-activation-current')) {
    row.removeAttribute('data-activation-current');
    if (row.getAttribute('aria-current') === 'true') {
      row.removeAttribute('aria-current');
    }
  }
  if (activeWashClassNames != null && activeWashClassNames.length > 0) {
    row.classList.remove(...activeWashClassNames);
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
  // A row another owner marked current stays fully inactive: presses neither
  // request activation nor repaint it.
  if (hasCompetingCurrentOwner(row)) {
    return true;
  }
  // A press on a read-only control belongs to that control: the shared
  // guard excludes `aria-readonly` from interactive, so without this the row
  // would activate under it.
  if (target !== row) {
    const readonlyScope = target.closest('[aria-readonly="true"]');
    if (readonlyScope != null && row.contains(readonlyScope)) {
      return true;
    }
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
  if (selectionIntersectsRow(row)) {
    return true;
  }
  return false;
}

/**
 * Whether a live text selection intersects the row. The shared
 * `hasTextSelection` only sees selections anchored inside, so a drag that
 * starts outside and covers the row would still activate it; an intersection
 * check keeps the drag inert whichever end the anchor is on. Implemented from
 * anchor/focus containment plus document order rather than
 * `selection.containsNode`: equivalent semantics, and jsdom's `containsNode`
 * answers true for disjoint nodes, which would make any page selection block
 * every row under test.
 */
/**
 * Whether two selection ends intersect the row: either end inside it, or the
 * ends on opposite sides of it in document order (a drag spanning across the
 * row). Pure over the end nodes so tests can pin the geometry without
 * depending on Selection range normalization.
 */
export function selectionEndsIntersectRow(
  row: Element,
  anchorNode: Node | null,
  focusNode: Node | null,
): boolean {
  if (anchorNode == null || focusNode == null) {
    return false;
  }
  if (row.contains(anchorNode) || row.contains(focusNode)) {
    return true;
  }
  // Either end inside the row is covered above; what remains is a selection
  // spanning across it, with the ends on opposite sides in document order.
  const anchorPosition = row.compareDocumentPosition(anchorNode);
  const focusPosition = row.compareDocumentPosition(focusNode);
  const anchorBefore =
    (anchorPosition & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  const anchorAfter =
    (anchorPosition & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  const focusBefore = (focusPosition & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  const focusAfter = (focusPosition & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  return (anchorBefore && focusAfter) || (anchorAfter && focusBefore);
}

function selectionIntersectsRow(row: Element): boolean {
  if (typeof document === 'undefined' || !('getSelection' in document)) {
    return false;
  }
  const selection = document.getSelection();
  if (selection == null || selection.isCollapsed) {
    return false;
  }
  const {anchorNode, focusNode} = selection;
  return selectionEndsIntersectRow(row, anchorNode, focusNode);
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
  /**
   * Active-row wash as a stylesheet rule rather than an inline style.
   * Selection writes its wash inline, so a selected row deterministically
   * keeps the selection fill however the two plugins interleave; an
   * unselected active row shows this wash. The overlay variable rides along
   * so pinned cells replay the active state through the freeze line, under
   * the same contract striping, hover, and selection honour.
   */
  activeWash: {
    backgroundColor: activeWash,
    '--table-row-overlay': activeWash,
  },
});

/** Stylesheet classes for the active wash, resolved once and toggled imperatively. */
let activeWashClassNames: ReadonlyArray<string> | null = null;

function getActiveWashClassNames(): ReadonlyArray<string> {
  if (activeWashClassNames == null) {
    activeWashClassNames = Object.freeze(
      (stylex.props(activationStyles.activeWash).className ?? '')
        .split(/\s+/)
        .filter(Boolean),
    );
  }
  return activeWashClassNames;
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
          const applyStyle = () => {
            applyRowActivationStyle(
              row,
              isEligibleNow() && key === store.getConfig().activeKey,
            );
          };
          applyStyle();
          const unsubscribe = store.subscribe(() => {
            if (!row.isConnected) {
              clearRowActivationStyle(row);
              unsubscribe();
              return;
            }
            applyStyle();
          });
          return () => {
            clearRowActivationStyle(row);
            unsubscribe();
          };
        };

        // Declarative snapshot of the active state for this render; the
        // imperative applies above keep it fresh between renders.
        const activeNow = eligible && key === store.getConfig().activeKey;

        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            // Declarative reflection alongside the imperative applies above:
            // a row re-render (a TableContext change rewrites the className
            // React owns) recomputes these from the live key, so the wash
            // never goes stale between store notifications.
            ...(activeNow
              ? {
                  className: [
                    props.htmlProps.className,
                    ...getActiveWashClassNames(),
                  ]
                    .filter(Boolean)
                    .join(' '),
                  'data-active': 'true' as const,
                }
              : null),
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
