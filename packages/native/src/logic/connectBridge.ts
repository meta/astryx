// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// Follows the bridge of EJ Campbell's astryx-swift spike
// (github.com/ejc3/astryx-swift, MIT).

/**
 * @file logic/connectBridge.ts
 * @input A logic core and the native host's two calls in
 * @output The two calls the host makes: read the snapshot, dispatch an action
 * @position Carries a logic core across a JavaScript engine boundary as JSON
 *   strings, the one form every engine bridge passes cheaply
 */

import type {LogicAction, LogicCore, LogicNode} from './createLogicCore.js';

/** Bumped when the bridge's calls or their JSON change meaning. */
export const BRIDGE_VERSION = 1;

/** What the native host offers the core. */
export interface BridgeHost {
  /**
   * The core is running and speaks this bridge version. Called while
   * `connectBridge` runs, before it returns the bridge: read and dispatch
   * through the returned bridge, not from inside this call.
   */
  connected(bridgeVersion: number): void;
  /** The tree changed; here it is as JSON. */
  changed(snapshotJSON: string): void;
}

export interface Bridge {
  getSnapshot(): string;
  /** An action as the host's JSON, such as Swift's `AstryxAction.json`. */
  dispatch(actionJSON: string): void;
  disconnect(): void;
}

function isAction(value: unknown): value is LogicAction {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const action = value as Record<string, unknown>;
  return (
    typeof action.key === 'string' &&
    typeof action.component === 'string' &&
    typeof action.event === 'string' &&
    Array.isArray(action.args)
  );
}

export function connectBridge<
  State,
  Node extends LogicNode,
  Action extends LogicAction,
>(core: LogicCore<State, Node, Action>, host: BridgeHost): Bridge {
  const unsubscribe = core.subscribe(() =>
    host.changed(JSON.stringify(core.getSnapshot())),
  );
  host.connected(BRIDGE_VERSION);
  return {
    getSnapshot: () => JSON.stringify(core.getSnapshot()),
    dispatch(actionJSON) {
      const action: unknown = JSON.parse(actionJSON);
      if (!isAction(action)) {
        throw new Error(`Not an Astryx action: ${actionJSON}`);
      }
      // The host sends only actions for callbacks the tree listed in `events`.
      core.dispatch(action as Action);
    },
    disconnect: unsubscribe,
  };
}
