// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTableInfiniteScroll.tsx
 * @input Controlled loading, parent render context, Button and IntersectionObserver
 * @output Stable generic TablePlugin, immutable loading state and inline-sticky load command
 * @position Infinite-scroll module; caller owns rows, transport and errors
 *
 * SYNC: useTableInfiniteScroll.test.tsx, index.ts, ../../useTableInfiniteScroll.doc.mjs
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '../../../Button/Button';
import {
  registerEnglishFallback,
  useComponentTranslator,
} from '../../../i18n/useComponentTranslator';
import english from '../../../i18n/generated-english/Table/plugins/infiniteScroll/useTableInfiniteScroll.generated';

registerEnglishFallback(english);
import {spacingVars} from '../../../theme/tokens.stylex';
import {
  moveFocusLeftBehind,
  noteFocusWithin,
  type FocusWithin,
} from '../../../utils/focusReturn';
import {useFocusLeavingChange} from '../../../utils/useFocusLeavingChange';
import {LayoutChangeSnapshot} from '../../../motion/LayoutChangeSnapshot';
import {devWarn} from '../../../utils/devWarning';
import {useInteractionModalityTracking} from '../../../utils/interactionModality';
import type {TablePlugin, TableRenderContext} from '../../types';

export interface UseTableInfiniteScrollConfig {
  /** Whether another batch can be loaded. */
  hasMore: boolean;
  /** Caller-controlled loading; the request latch also contributes busy state. */
  isLoading: boolean;
  /** Complete the batch work before fulfilling. Rows and errors stay caller-owned. */
  onLoadMore: () => Promise<void>;
}

type Request = {
  generation: number;
  settledAt: number | null;
  isSuccessful: boolean;
};
type LoadingSnapshot = Readonly<{isLoading: boolean; hasMore: boolean}>;
type SurfaceSnapshot = Readonly<{
  hasMore: boolean;
  isLoading: boolean;
  version: number;
}>;

function isAdmitted(
  context: TableRenderContext | undefined,
): context is TableRenderContext & {
  mode: 'data';
  rowModel: 'flat';
} {
  return context?.mode === 'data' && context.rowModel === 'flat';
}

/** Hook-owned request/store lifetime, independent of the replaceable Table child. */
function createRuntime(
  initial: UseTableInfiniteScrollConfig,
  wake: () => void,
) {
  let snapshot: LoadingSnapshot = Object.freeze({
    isLoading: initial.hasMore && initial.isLoading,
    hasMore: initial.hasMore,
  });
  const serverSnapshot = snapshot;
  let surface: SurfaceSnapshot = Object.freeze({
    hasMore: initial.hasMore,
    isLoading: snapshot.isLoading,
    version: 0,
  });
  const listeners = new Set<() => void>();
  // Each diagnosis warns once per hook instance.
  const warned = new Set<string>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const runtime = {
    config: initial,
    context: undefined as TableRenderContext | undefined,
    stopObservation: undefined as (() => void) | undefined,
    request: null as Request | null,
    isActive: true,
    isAutoPaused: false,
    generation: 0,
    commitCount: 0,
    version: 0,
    renderState: {
      subscribe,
      getSnapshot: () => snapshot,
      getServerSnapshot: () => serverSnapshot,
    },
    subscribe,
    getSurface: () => surface,
    diagnose(message: string) {
      if (warned.has(message)) {
        return;
      }
      warned.add(message);
      devWarn('useTableInfiniteScroll', message);
    },
    activate() {
      runtime.isActive = true;
    },
    deactivate() {
      runtime.isActive = false;
      runtime.generation++;
      runtime.request = null;
      runtime.version++;
    },
    attach(context: TableRenderContext, stopObservation: () => void) {
      runtime.context = context;
      runtime.stopObservation = stopObservation;
    },
    detach(
      context: TableRenderContext | undefined,
      stopObservation: () => void,
    ) {
      if (runtime.context === context) {
        runtime.context = undefined;
      }
      if (runtime.stopObservation === stopObservation) {
        runtime.stopObservation = undefined;
      }
    },
    commit(config: UseTableInfiniteScrollConfig) {
      runtime.config = config;
      runtime.commitCount++;
      const request = runtime.request;
      // Settlement schedules a hook commit. A pre-call false value is never completion.
      if (
        request?.settledAt != null &&
        runtime.commitCount > request.settledAt &&
        !config.isLoading
      ) {
        runtime.request = null;
        if (request.isSuccessful) {
          runtime.isAutoPaused = false;
        }
        runtime.version++;
      }
      const isLoading =
        config.hasMore && (config.isLoading || runtime.request !== null);
      if (
        snapshot.isLoading !== isLoading ||
        snapshot.hasMore !== config.hasMore
      ) {
        snapshot = Object.freeze({isLoading, hasMore: config.hasMore});
      }
      if (
        surface.hasMore !== config.hasMore ||
        surface.isLoading !== isLoading ||
        surface.version !== runtime.version
      ) {
        surface = Object.freeze({
          hasMore: config.hasMore,
          isLoading,
          version: runtime.version,
        });
        // The hook's commit effect is the only broadcast writer. Render never notifies.
        for (const listener of listeners) {
          listener();
        }
      }
    },
    invoke(isAutomatic: boolean) {
      const {config} = runtime;
      if (
        !runtime.isActive ||
        !isAdmitted(runtime.context) ||
        !config.hasMore ||
        config.isLoading ||
        runtime.request ||
        (isAutomatic && runtime.isAutoPaused)
      ) {
        return;
      }
      const request: Request = {
        generation: runtime.generation,
        settledAt: null,
        isSuccessful: false,
      };
      runtime.request = request;
      runtime.version++;
      // Stop observing when the latch is taken. A request that resolves at
      // once may never render a busy state. Keep the last visibility until the
      // next observer reports.
      runtime.stopObservation?.();
      wake();
      const settle = (isSuccessful: boolean) => {
        if (
          !runtime.isActive ||
          runtime.generation !== request.generation ||
          runtime.request !== request
        ) {
          return;
        }
        request.isSuccessful = isSuccessful;
        request.settledAt = runtime.commitCount;
        if (!isSuccessful) {
          runtime.isAutoPaused = true;
        }
        runtime.version++;
        wake();
      };
      try {
        const result = config.onLoadMore();
        if (result == null || typeof result.then !== 'function') {
          runtime.request = null;
          runtime.isAutoPaused = true;
          runtime.version++;
          runtime.diagnose(
            'onLoadMore must return a Promise<void>; automatic loading is paused.',
          );
          wake();
          return;
        }
        Promise.resolve(result).then(
          () => settle(true),
          () => settle(false),
        );
      } catch {
        settle(false);
      }
    },
  };
  return runtime;
}
type Runtime = ReturnType<typeof createRuntime>;

const styles = stylex.create({
  // Grid gives the existing content box the table's intrinsic inline extent,
  // without size containment suppressing its contribution to shrink-to-fit hosts.
  viewport: {display: 'grid'},
  command: {position: 'sticky', insetInlineStart: 0, insetInlineEnd: 0},
  surface: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingBlock: spacingVars['--spacing-2'],
    gap: spacingVars['--spacing-2'],
  },
  sentinel: {height: 1, width: '100%', flexShrink: 0},
});

/** A single surface owns its observer, rearm task and focus-handoff resource. */
function InfiniteScrollSurface({
  runtime,
  context,
}: {
  runtime: Runtime;
  context: TableRenderContext;
}) {
  const view = useSyncExternalStore(
    runtime.subscribe,
    runtime.getSurface,
    runtime.getSurface,
  );
  const t = useComponentTranslator();
  useInteractionModalityTracking();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const resourcesRef = useRef({
    observer: null as IntersectionObserver | null,
    root: null as HTMLDivElement | null,
    node: null as HTMLDivElement | null,
    isVisible: false,
    task: null as ReturnType<typeof setTimeout> | null,
    context: undefined as TableRenderContext | undefined,
    viewport: null as HTMLDivElement | null,
  });
  const disconnect = useCallback(() => {
    const state = resourcesRef.current;
    state.observer?.disconnect();
    state.observer = null;
    if (state.task !== null) {
      clearTimeout(state.task);
    }
    state.task = null;
  }, []);
  // When the last batch removes a focused Load more command, focus moves to
  // the Table scroll region, without scrolling. Focus that a caller already
  // moved elsewhere stays there.
  const noteExhaustion = useFocusLeavingChange(
    view.hasMore,
    (hadMore: boolean) =>
      hadMore ? noteFocusWithin(surfaceRef.current) : null,
    (focus: FocusWithin) =>
      moveFocusLeftBehind(
        focus,
        context.viewport.current ?? resourcesRef.current.viewport,
        null,
        {preventScroll: true, temporaryTabStop: true},
      ),
  );
  const setSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (sentinelRef.current !== node) {
        disconnect();
        resourcesRef.current.isVisible = false;
      }
      sentinelRef.current = node;
    },
    [disconnect],
  );

  useEffect(() => {
    // Sync the sentinel's IntersectionObserver with the committed loading
    // state. Parent refs are attached by now.
    runtime.attach(context, disconnect);
    const state = resourcesRef.current;
    state.context = context;
    state.viewport = context.viewport.current;
    // The browser viewport is the observation root until Table has a
    // bounded block viewport of its own.
    const root = null;
    const node = sentinelRef.current;
    if (state.root !== root || state.node !== node) {
      disconnect();
      state.isVisible = false;
      state.root = root;
      state.node = node;
    }
    const canObserve =
      isAdmitted(context) &&
      view.hasMore &&
      !view.isLoading &&
      !runtime.isAutoPaused;
    if (!canObserve || !node) {
      disconnect();
      if (!view.hasMore) {
        state.isVisible = false;
      }
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      disconnect();
      runtime.diagnose(
        'IntersectionObserver is unavailable; use the manual Load more command.',
      );
      return;
    }
    if (state.observer) {
      return;
    }
    const isRearming = state.isVisible;
    const observer = new IntersectionObserver(
      entries => {
        if (
          state.observer !== observer ||
          state.node !== node ||
          !runtime.isActive
        ) {
          return;
        }
        for (const entry of entries) {
          if (entry.target !== node) {
            continue;
          }
          state.isVisible = entry.isIntersecting;
          if (!state.isVisible) {
            if (state.task !== null) {
              clearTimeout(state.task);
            }
            state.task = null;
          } else if (isRearming) {
            // Reacquisition's native entry refreshes visibility after appended rows.
            // Never load from stale pre-append geometry or a recursive microtask.
            if (state.task === null) {
              state.task = setTimeout(() => {
                state.task = null;
                if (
                  state.observer === observer &&
                  state.node === node &&
                  state.isVisible
                ) {
                  runtime.invoke(true);
                }
              }, 0);
            }
          } else {
            runtime.invoke(true);
          }
        }
      },
      {root, rootMargin: '0px', threshold: 0},
    );
    state.observer = observer;
    observer.observe(node);
  });
  // Release native observation/focus resources and detach the surface on unmount.
  useLayoutEffect(
    () => () => {
      disconnect();
      runtime.detach(resourcesRef.current.context, disconnect);
    },
    [disconnect, runtime],
  );

  const snapshot = (
    <LayoutChangeSnapshot
      value={view.hasMore}
      onBeforeChange={noteExhaustion}
    />
  );
  if (!view.hasMore || !isAdmitted(context)) {
    return snapshot;
  }
  return (
    <>
      {snapshot}
      <div ref={surfaceRef} {...stylex.props(styles.surface)}>
        <div
          ref={setSentinel}
          {...stylex.props(styles.sentinel)}
          aria-hidden="true"
        />
        <Button
          xstyle={styles.command}
          label={t('@astryx.table.loadMore')}
          isLoading={view.isLoading}
          onClick={() => runtime.invoke(false)}
        />
      </div>
    </>
  );
}

/**
 * Load successive batches without owning rows, pagination or a request client.
 *
 * @example
 * ```
 * const plugin = useTableInfiniteScroll<Item>({
 *   hasMore,
 *   isLoading,
 *   onLoadMore: async () => {
 *     const batch = await fetchNextBatch();
 *     setRows(rows => [...rows, ...batch.rows]);
 *     setHasMore(batch.hasMore);
 *   },
 * });
 * <Table data={rows} idKey="id" plugins={{infiniteScroll: plugin}} />
 * ```
 * Reset by remounting the component owning both this hook and its Table.
 */
export function useTableInfiniteScroll<T extends Record<string, unknown>>(
  config: UseTableInfiniteScrollConfig,
): TablePlugin<T> {
  const [, wake] = useReducer((version: number) => version + 1, 0);
  const [runtime] = useState(() => createRuntime(config, wake));
  const [plugin] = useState<TablePlugin<T>>(() => ({
    rowModel: 'flat',
    // Table hides its default empty row while this source loads.
    renderState: runtime.renderState,
    transformScrollWrapper(props, context) {
      if (!isAdmitted(context)) {
        runtime.diagnose(
          context == null
            ? 'Loading requires an explicit Table render context; no loading surface is added.'
            : context.mode !== 'data'
              ? 'Loading requires a data-driven Table; children mode remains unchanged.'
              : "Loading requires admitted flat product rows; body modifiers must declare rowModel: 'flat'.",
        );
        return props;
      }
      return {
        ...props,
        xstyle: [...props.xstyle, styles.viewport],
        afterTable: (
          <>
            {props.afterTable}
            <InfiniteScrollSurface runtime={runtime} context={context} />
          </>
        ),
      };
    },
  }));
  useLayoutEffect(() => {
    // Synchronize the request runtime's mount lifetime and stale-settlement generation.
    runtime.activate();
    return () => runtime.deactivate();
  }, [runtime]);
  useLayoutEffect(() => {
    // Publish current controlled state only after commit, including settle-only commits.
    runtime.commit(config);
  });
  return plugin;
}
