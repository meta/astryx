// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// The shape of this runtime (one state, a snapshot per change, a bridge of two
// calls in and two out) follows EJ Campbell's astryx-swift spike
// (github.com/ejc3/astryx-swift, MIT), whose core runs in Hermes and drives
// SwiftUI views.

/**
 * @file logic/createLogicCore.ts
 * @input A screen's initial state, a view of the state as a node tree, and a
 *   reducer of actions
 * @output A logic core: the current tree, a dispatcher, and change listeners
 * @position Arm C of the native experiment (AST-082 FR12): component logic in
 *   TypeScript, run by a JavaScript engine inside a native app, decides every
 *   word, value, and state; native views draw the tree and send actions back.
 *   Uses ECMAScript built-ins only, so it runs in Hermes, Node, and browsers
 */

/** The least a node has: the component it names and its identity in the tree. */
export interface LogicNode {
  readonly component: string;
  readonly key: string;
}

/** The least an action has: the node, its component, the callback, and its arguments. */
export interface LogicAction {
  readonly key: string;
  readonly component: string;
  readonly event: string;
  readonly args: readonly unknown[];
}

export interface LogicCoreOptions<
  State,
  Node extends LogicNode,
  Action extends LogicAction,
> {
  readonly initial: State;
  /** The whole screen for a state. Pure: the same state gives the same tree. */
  readonly view: (state: State) => Node;
  /** The next state after an action. Returns the same state when nothing changes. */
  readonly reduce: (state: State, action: Action) => State;
}

export interface LogicCore<
  State,
  Node extends LogicNode,
  Action extends LogicAction,
> {
  getState(): State;
  /** The tree for the current state, built once per change. */
  getSnapshot(): Node;
  dispatch(action: Action): void;
  /** Called after every change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/**
 * Creates a logic core. Pass the platform's `AstryxNode` and `AstryxAction`
 * types from `@astryxdesign/native/components` so a tree and an action are
 * checked against that platform's contracts.
 */
export function createLogicCore<
  State,
  Node extends LogicNode,
  Action extends LogicAction,
>(
  options: LogicCoreOptions<State, Node, Action>,
): LogicCore<State, Node, Action> {
  let state = options.initial;
  let snapshot: Node | null = null;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    getSnapshot() {
      snapshot ??= options.view(state);
      return snapshot;
    },
    dispatch(action) {
      const next = options.reduce(state, action);
      if (Object.is(next, state)) {
        return;
      }
      state = next;
      snapshot = null;
      for (const listener of [...listeners]) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
