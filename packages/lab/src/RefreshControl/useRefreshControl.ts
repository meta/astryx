// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useRefreshControl.ts
 * @input onRefresh, isRefreshing, isDisabled and announce; the touch
 *   layer (refreshTouchController.ts)
 * @output Exports useRefreshControl: refs for the pulled content and the
 *   app's indicator, `isRefreshing`, and `refresh()` for the non-gesture path
 * @position Lab's pull to refresh: the state, `onRefresh`, the announcement
 *   and the gate. refreshTouchController.ts holds everything a finger drives,
 *   and only this file imports it.
 *
 * SYNC: When modified, update:
 * - /packages/lab/src/RefreshControl/refreshTouchController.ts
 * - /packages/lab/src/RefreshControl/useRefreshControl.test.tsx
 */

// A finger pulls, and so does a trackpad's two-finger scroll once the content
// is at its top, with the same mapping, trigger and settle. The pull applies
// in an element that scrolls. A mouse or pen drag stays the browser's, for
// text selection. The app draws the indicator and says what is announced.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react';
import {useAnnounce} from '@astryxdesign/core/hooks';
import {
  INITIAL_REFRESH_STATE,
  reduceRefresh,
  type RefreshEffect,
  type RefreshEvent,
  type RefreshState,
} from './refreshModel';
import {useRefreshTouchController} from './refreshTouchController';

export {REFRESH_REVEAL_VAR} from './refreshIndicator';

export interface UseRefreshControlOptions {
  /**
   * Called when a pull triggers, or when `refresh()` runs. Return a promise to
   * keep the control refreshing until it settles (uncontrolled use).
   */
  onRefresh?: () => unknown;
  /**
   * Controlled refreshing state: `true` puts the control in the refreshing
   * state (as `beginRefreshing()`), `false` ends it (as `endRefreshing()`).
   * Omit it to let the promise `onRefresh` returns decide.
   */
  isRefreshing?: boolean;
  /** Turns the pull off. A refresh in progress keeps running. */
  isDisabled?: boolean;
  /**
   * Announced politely when a refresh starts, for example "Refreshing". The
   * app supplies it in its own language. Omit it to announce nothing.
   */
  announce?: string;
}

export interface UseRefreshControlResult {
  /** Attach to the element that wraps the scrolled content (it is pulled). */
  contentRef: RefCallback<HTMLElement>;
  /**
   * Attach this ref to the app's indicator, for example a Spinner. The
   * indicator is a band as tall as the refresh height. It sits at the bottom
   * of an overflow-hidden box that rides on the content's top edge. The hook
   * moves the band against the content, so it stays pinned at the top of the
   * scroll view, where UIRefreshControl sits. The content's edge covers it.
   * The hook writes how much of it the pull reveals, 0 to 1, to
   * `REFRESH_REVEAL_VAR`, and fades it as a settle takes the content back.
   */
  indicatorRef: RefCallback<HTMLElement>;
  /** Whether a refresh is in progress. */
  isRefreshing: boolean;
  /** Starts a refresh without a pull (the non-gesture path). */
  refresh: () => void;
}

/**
 * Pull to refresh, as UIRefreshControl, for the app's own scroll container.
 * Pulling the content down past the top reveals the app's indicator. Pulling
 * past the trigger starts a refresh with the finger still down. Letting go
 * settles the content onto the refreshing inset until the refresh ends, and
 * then it slides back up.
 *
 * A finger pulls, and so does a trackpad's two-finger scroll at the top. A
 * mouse or pen drag stays the browser's, for text selection, and a mouse
 * wheel's notches never pull. Always give people another way to refresh, such
 * as a button that calls `refresh()`: a pull has no keyboard or
 * assistive-technology equivalent.
 *
 * @example
 * ```
 * const pull = useRefreshControl({onRefresh: reload, announce: 'Refreshing'});
 * <div style={{overflowY: 'auto', height: '100%'}}>
 *   <div ref={pull.contentRef} aria-busy={pull.isRefreshing || undefined}>
 *     <List>…</List>
 *     <div style={{position: 'absolute', insetInline: 0, bottom: '100%', height: '100lvh', overflow: 'hidden'}}>
 *       <div ref={pull.indicatorRef} aria-hidden style={{position: 'absolute', insetInline: 0, bottom: 0, height: 60}}>
 *         <Spinner />
 *       </div>
 *     </div>
 *   </div>
 * </div>
 * ```
 */
export function useRefreshControl({
  onRefresh,
  isRefreshing: isRefreshingProp,
  isDisabled = false,
  announce,
}: UseRefreshControlOptions = {}): UseRefreshControlResult {
  const announcer = useAnnounce();
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Controlled: a refresh the hook started waits one commit for the parent
  // to take it.
  const awaitingProp = useRef(false);
  const [controlledCheck, setControlledCheck] = useState(0);

  const model = useRef<RefreshState>(INITIAL_REFRESH_STATE);
  const refreshToken = useRef(0);
  const isControlled = isRefreshingProp !== undefined;
  const latest = useRef({onRefresh, isControlled, announce, announcer});
  // Syncs the handlers' ref with the newest options.
  useLayoutEffect(() => {
    latest.current = {onRefresh, isControlled, announce, announcer};
  });

  const dispatchRef = useRef<(event: RefreshEvent) => void>(() => {});
  const touch = useRefreshTouchController({
    isPullEnabled: !isDisabled,
    model,
    dispatchRef,
  });

  // -- Effects of the state machine -----------------------------------------

  const callHandler = useCallback(() => {
    const token = ++refreshToken.current;
    const result = latest.current.onRefresh?.();
    if (latest.current.isControlled) {
      // The prop is the source: unless the parent takes this refresh by
      // setting `isRefreshing`, it ends on the next commit.
      awaitingProp.current = true;
      setControlledCheck(count => count + 1);
      return;
    }
    const settle = () => {
      if (token === refreshToken.current) {
        dispatchRef.current({type: 'end'});
      }
    };
    void Promise.resolve(result).then(settle, settle);
  }, []);

  const run = useCallback(
    (effect: RefreshEffect) => {
      const {announce: words, announcer: say} = latest.current;
      switch (effect.type) {
        case 'trigger':
          setIsRefreshing(true);
          touch.trigger();
          if (words) {
            say(words);
          }
          callHandler();
          break;
        case 'begin': {
          setIsRefreshing(true);
          if (words) {
            say(words);
          }
          touch.begin();
          if (effect.callHandler) {
            callHandler();
          }
          break;
        }
        case 'settle':
          touch.settle(effect.to);
          break;
        case 'end':
          setIsRefreshing(false);
          touch.end();
          break;
      }
    },
    [callHandler, touch],
  );

  const dispatch = useCallback(
    (event: RefreshEvent) => {
      const next = reduceRefresh(model.current, event);
      model.current = next.state;
      for (const effect of next.effects) {
        run(effect);
      }
    },
    [run],
  );
  // Syncs the touch layer's ref with the committed dispatch.
  useLayoutEffect(() => {
    dispatchRef.current = dispatch;
  });

  // -- Programmatic control -------------------------------------------------

  // Syncs a controlled `isRefreshing` into the systems outside React: the
  // touch layer and the announcer. The touch layer runs the inset and the
  // slide on the compositor. The rendered value is the prop itself.
  useEffect(() => {
    if (isRefreshingProp === undefined) {
      return;
    }
    dispatch(
      isRefreshingProp ? {type: 'begin', source: 'program'} : {type: 'end'},
    );
  }, [dispatch, isRefreshingProp]);

  // A refresh that the hook started, by a pull or `refresh()`, under a
  // controlled `isRefreshing`. If the prop is now true, the parent took it.
  // Otherwise the refresh ends, for example when a parent keeps false. The end
  // goes to the touch layer, outside React, and slides the inset off.
  useEffect(() => {
    if (!awaitingProp.current) {
      return;
    }
    awaitingProp.current = false;
    if (isRefreshingProp === false) {
      dispatch({type: 'end'});
    }
  }, [controlledCheck, dispatch, isRefreshingProp]);

  const refresh = useCallback(() => {
    dispatch({type: 'begin', source: 'user'});
  }, [dispatch]);

  useEffect(
    () => () => {
      refreshToken.current++;
    },
    [],
  );

  return {
    contentRef: touch.contentRef,
    indicatorRef: touch.indicatorRef,
    // Controlled, the prop is the source from the first render.
    isRefreshing: isControlled ? Boolean(isRefreshingProp) : isRefreshing,
    refresh,
  };
}
