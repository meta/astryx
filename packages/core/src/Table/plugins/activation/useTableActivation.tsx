// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableActivation.tsx
 * @input Controlled current key, request callback and optional eligibility predicate
 * @output Stable TablePlugin with ref-safe keyboard access for admitted flat rows
 * @position Activation plugin; Table owns identity, admission and row paint
 *
 * SYNC: When modified, update useTableActivation.test.tsx and
 * ../../useTableActivation.doc.mjs.
 */
import {useMemo, useRef, type RefCallback} from 'react';
import {hasTextSelection} from '../../../hooks/useClickableContainer';
import {useIsomorphicLayoutEffect} from '../../../hooks/useIsomorphicLayoutEffect';
import {mergeRefs} from '../../../utils/mergeRefs';
import {createDevWarnings} from '../../../utils/devWarning';
import type {
  BodyRowRenderProps,
  TablePlugin,
  TableRowContext,
} from '../../types';
import {setRowActivation} from '../../tableRowState';
import {registerCountIndependentPlugin} from '../../tableRowContextUsage';
import {
  isRowActivationGesture,
  withRowActivationFinalizer,
} from './activationGuard';

export interface UseTableActivationConfig<T extends Record<string, unknown>> {
  /** Canonical Table key driving adjacent content; null means no current row. */
  activeKey: string | number | null;
  /** Requests activation without changing the controlled current key. */
  onActivate: (item: T, key: string | number) => void;
  /** Whether this admitted product row can activate. Defaults to true. */
  getIsItemActivatable?: (item: T) => boolean;
}

type Key = string | number;
type RowProps = BodyRowRenderProps['htmlProps'];

// Navigation-specific current values remain owned by the caller.
const COMPATIBLE_CURRENT_OWNERS = new Set<unknown>([
  undefined,
  null,
  false,
  true,
  'false',
  'true',
]);

interface RowBinding {
  refreshEligibility: () => void;
  reflect: () => void;
  detach: () => void;
}

// A connected focused row may be detached only to replace its React ref. Keep
// its tab stop until the same-commit successor can claim the native element.
const rowBindingOwners = new WeakMap<HTMLTableRowElement, RowBinding>();

/** Holds mounted row bindings. A key change repaints only the old and new keys. */
function createActivationStore<T extends Record<string, unknown>>(configRef: {
  current: UseTableActivationConfig<T>;
}) {
  const rows = new Map<Key, Set<RowBinding>>();
  let previousKey = configRef.current.activeKey;
  let previousPredicate = configRef.current.getIsItemActivatable;
  const warn = createDevWarnings();
  let isMounted = true;
  return {
    diagnose(message: string) {
      warn('useTableActivation', message);
    },
    getConfig: () => configRef.current,
    getIsMounted: () => isMounted,
    register(key: Key, binding: RowBinding) {
      let bucket = rows.get(key);
      if (!bucket) {
        bucket = new Set();
        rows.set(key, bucket);
      }
      bucket.add(binding);
      return () => {
        bucket.delete(binding);
        if (bucket.size === 0 && rows.get(key) === bucket) {
          rows.delete(key);
        }
      };
    },
    synchronize() {
      isMounted = true;
      const {activeKey, getIsItemActivatable} = configRef.current;
      if (getIsItemActivatable !== previousPredicate) {
        for (const bucket of rows.values()) {
          for (const binding of bucket) {
            binding.refreshEligibility();
            binding.reflect();
          }
        }
      } else if (activeKey !== previousKey) {
        if (previousKey !== null) {
          for (const binding of rows.get(previousKey) ?? []) {
            binding.reflect();
          }
        }
        if (activeKey !== null) {
          for (const binding of rows.get(activeKey) ?? []) {
            binding.reflect();
          }
        }
      }
      previousKey = activeKey;
      previousPredicate = getIsItemActivatable;
    },
    dispose() {
      isMounted = false;
      for (const bucket of rows.values()) {
        for (const binding of [...bucket]) {
          binding.detach();
        }
      }
      rows.clear();
    },
  };
}

function hasAdmission(
  context: TableRowContext | undefined,
): context is TableRowContext & {key: Key} {
  return (
    context?.identityStatus === 'valid' &&
    context.kind === 'product' &&
    (typeof context.key === 'string' ||
      (typeof context.key === 'number' && Number.isFinite(context.key))) &&
    context.render?.mode === 'data' &&
    context.render.rowModel === 'flat' &&
    context.render.canActivate === true
  );
}

function composeShortcuts(value: string | undefined): string {
  return [
    ...new Set([
      ...(value?.split(/\s+/).filter(Boolean) ?? []),
      'Enter',
      'Space',
    ]),
  ].join(' ');
}

function restoreAttribute(
  row: HTMLTableRowElement,
  name: string,
  value: string | null,
): void {
  if (value === null) {
    row.removeAttribute(name);
  } else {
    row.setAttribute(name, value);
  }
}

function makeRowBinding<T extends Record<string, unknown>>(
  store: ReturnType<typeof createActivationStore<T>>,
  props: BodyRowRenderProps,
  item: T,
  key: Key,
  reportCurrentOwner: () => void,
): BodyRowRenderProps {
  const original = props.htmlProps;
  const shortcuts = composeShortcuts(original['aria-keyshortcuts']);
  let isEligible = store.getConfig().getIsItemActivatable?.(item) ?? true;
  let eligibilityPredicate = store.getConfig().getIsItemActivatable;
  let node: HTMLTableRowElement | null = null;
  let unregister: (() => void) | undefined;
  let isActive = false;
  let hasAffordances = false;
  let isFinalizingEvent = false;
  let hasCompatibleCurrentOwner = true;
  const originalTabIndex =
    original.tabIndex == null ? null : String(original.tabIndex);
  const originalShortcuts = original['aria-keyshortcuts'] ?? null;
  const originalCurrent =
    original['aria-current'] == null ? null : String(original['aria-current']);
  const originalActive = (
    original as RowProps & {'data-active'?: string | boolean}
  )['data-active'];

  const removeActive = () => {
    if (!node || !isActive) {
      return;
    }
    setRowActivation(node, false);
    isActive = false;
    // Restore compatible pre-existing semantic contributions, never a new one.
    if (originalCurrent !== null) {
      restoreAttribute(node, 'aria-current', originalCurrent);
    }
    if (originalActive != null) {
      restoreAttribute(node, 'data-active', String(originalActive));
    }
  };
  const removeAffordances = (isRefHandoff = false) => {
    if (!node || !hasAffordances) {
      return;
    }
    if (originalTabIndex === null && node.getAttribute('tabindex') === '0') {
      if (
        isRefHandoff &&
        node.isConnected &&
        node.ownerDocument.activeElement === node
      ) {
        const row = node;
        queueMicrotask(() => {
          if (
            !rowBindingOwners.has(row) &&
            row.getAttribute('tabindex') === '0'
          ) {
            row.removeAttribute('tabindex');
          }
        });
      } else {
        node.removeAttribute('tabindex');
      }
    }
    if (node.getAttribute('aria-keyshortcuts') === shortcuts) {
      restoreAttribute(node, 'aria-keyshortcuts', originalShortcuts);
    }
    hasAffordances = false;
  };
  const binding: RowBinding = {
    refreshEligibility() {
      eligibilityPredicate = store.getConfig().getIsItemActivatable;
      isEligible =
        hasCompatibleCurrentOwner && (eligibilityPredicate?.(item) ?? true);
    },
    reflect() {
      if (!node) {
        return;
      }
      if (!node.isConnected) {
        binding.detach();
        return;
      }
      // Ref replacement can run cleanup after React diffed unchanged props.
      // Reconcile the real DOM on every eligible reflection, not just attachment.
      if (isEligible) {
        if (originalTabIndex === null && !node.hasAttribute('tabindex')) {
          node.setAttribute('tabindex', '0');
        }
        if (node.getAttribute('aria-keyshortcuts') !== shortcuts) {
          node.setAttribute('aria-keyshortcuts', shortcuts);
        }
        hasAffordances = true;
      } else if (!isEligible) {
        removeAffordances();
      }
      const nextActive = isEligible && store.getConfig().activeKey === key;
      if (nextActive !== isActive) {
        if (nextActive) {
          setRowActivation(node, true, {
            current: originalCurrent,
            active: originalActive == null ? null : String(originalActive),
          });
          isActive = true;
        } else {
          removeActive();
        }
      }
    },
    detach() {
      unregister?.();
      unregister = undefined;
      removeActive();
      if (node && rowBindingOwners.get(node) === binding) {
        rowBindingOwners.delete(node);
      }
      removeAffordances(true);
      node = null;
    },
  };
  const activationRef: RefCallback<HTMLTableRowElement> = element => {
    binding.detach();
    if (!element) {
      return;
    }
    node = element;
    rowBindingOwners.set(element, binding);
    // Initial DOM props are already derived from the current config. Track their
    // ownership before synchronizing so an ineligible transition restores them.
    hasAffordances = isEligible;
    isActive = isEligible && store.getConfig().activeKey === key;
    if (eligibilityPredicate !== store.getConfig().getIsItemActivatable) {
      binding.refreshEligibility();
    }
    if (isActive) {
      setRowActivation(element, true, {
        current: originalCurrent,
        active: originalActive == null ? null : String(originalActive),
      });
    }
    unregister = store.register(key, binding);
    binding.reflect();
    return binding.detach;
  };
  const canRequest = (event: {
    currentTarget: HTMLTableRowElement;
    target: EventTarget | null;
    defaultPrevented: boolean;
  }) =>
    store.getIsMounted() &&
    node === event.currentTarget &&
    isEligible &&
    !event.defaultPrevented &&
    isRowActivationGesture(event.currentTarget, event.target);

  const requestClick: NonNullable<RowProps['onClick']> = event => {
    if (
      event.button === 0 &&
      canRequest(event) &&
      !hasTextSelection(event.currentTarget)
    ) {
      store.getConfig().onActivate(item, key);
    }
  };
  const requestKeyDown: NonNullable<RowProps['onKeyDown']> = event => {
    if ((event.key !== 'Enter' && event.key !== ' ') || !canRequest(event)) {
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
    }
    if (!event.repeat) {
      store.getConfig().onActivate(item, key);
    }
  };
  const htmlProps: RowProps & {'data-active'?: boolean} = {
    ...original,
    onClick(event) {
      original.onClick?.(event);
      if (!isFinalizingEvent) {
        requestClick(event);
      }
    },
    onKeyDown(event) {
      original.onKeyDown?.(event);
      if (!isFinalizingEvent) {
        requestKeyDown(event);
      }
    },
  };
  if (isEligible) {
    htmlProps.tabIndex = original.tabIndex ?? 0;
    htmlProps['aria-keyshortcuts'] = shortcuts;
    if (store.getConfig().activeKey === key) {
      htmlProps['data-active'] = true;
      htmlProps['aria-current'] = true;
    }
  }
  return withRowActivationFinalizer(
    {
      ...props,
      htmlProps,
      ref: props.ref ? mergeRefs(props.ref, activationRef) : activationRef,
    },
    finalProps => {
      const currentOwner = finalProps.htmlProps['aria-current'];
      if (!COMPATIBLE_CURRENT_OWNERS.has(currentOwner)) {
        hasCompatibleCurrentOwner = false;
        isEligible = false;
        const inertProps: RowProps & {'data-active'?: boolean} = {
          ...finalProps.htmlProps,
        };
        if (originalTabIndex === null && inertProps.tabIndex === 0) {
          delete inertProps.tabIndex;
        }
        if (inertProps['aria-keyshortcuts'] === shortcuts) {
          if (originalShortcuts === null) {
            delete inertProps['aria-keyshortcuts'];
          } else {
            inertProps['aria-keyshortcuts'] = originalShortcuts;
          }
        }
        if (originalActive == null && inertProps['data-active'] === true) {
          delete inertProps['data-active'];
        }
        reportCurrentOwner();
        return {...finalProps, htmlProps: inertProps};
      }
      const finalClick = finalProps.htmlProps.onClick;
      const finalKeyDown = finalProps.htmlProps.onKeyDown;
      return {
        ...finalProps,
        htmlProps: {
          ...finalProps.htmlProps,
          onClick(event) {
            const wasFinalizing = isFinalizingEvent;
            isFinalizingEvent = true;
            try {
              finalClick?.(event);
            } finally {
              isFinalizingEvent = wasFinalizing;
            }
            if (!wasFinalizing) {
              requestClick(event);
            }
          },
          onKeyDown(event) {
            const wasFinalizing = isFinalizingEvent;
            isFinalizingEvent = true;
            try {
              finalKeyDown?.(event);
            } finally {
              isFinalizingEvent = wasFinalizing;
            }
            if (!wasFinalizing) {
              requestKeyDown(event);
            }
          },
        },
      };
    },
  );
}

/**
 * Request a controlled current product row from primary click, Enter or Space.
 * Use explicit stable unique Table idKey values; activation is not selection.
 */
export function useTableActivation<T extends Record<string, unknown>>(
  config: UseTableActivationConfig<T>,
): TablePlugin<T> {
  const configRef = useRef(config);
  configRef.current = config;
  const storeRef = useRef<ReturnType<typeof createActivationStore<T>> | null>(
    null,
  );
  if (!storeRef.current) {
    storeRef.current = createActivationStore(configRef);
  }
  const store = storeRef.current;

  // Synchronize controlled state to the parent-owned DOM paint resource.
  useIsomorphicLayoutEffect(() => {
    store.synchronize();
  });
  useIsomorphicLayoutEffect(() => () => store.dispose(), [store]);

  const plugin = useMemo(() => {
    const reportCurrentOwner = () => {
      store.diagnose('An existing aria-current owner prevents row activation.');
    };
    return {
      rowModel: 'flat',
      wholeRowOwner: 'activation',
      transformBodyRow(
        props: BodyRowRenderProps,
        item: T,
        _index: number,
        context?: TableRowContext,
      ) {
        if (!hasAdmission(context)) {
          if (
            context?.render.mode === 'data' &&
            context.render.rowModel !== 'flat'
          ) {
            store.diagnose(
              "Activation requires flat rows. A compatible custom body modifier must declare rowModel: 'flat'.",
            );
          }
          return props;
        }
        const currentOwner = props.htmlProps['aria-current'];
        if (!COMPATIBLE_CURRENT_OWNERS.has(currentOwner)) {
          reportCurrentOwner();
          return props;
        }
        return makeRowBinding(
          store,
          props,
          item,
          context.key,
          reportCurrentOwner,
        );
      },
    } satisfies TablePlugin<T>;
  }, [store]);
  return registerCountIndependentPlugin(plugin);
}
