// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file logic/index.ts
 * @input None
 * @output The logic core runtime (`@astryxdesign/native/logic`)
 * @position Arm C entry. Portable: ECMAScript built-ins only, no Node or DOM
 *   APIs, no clock and no randomness of its own
 */

export {createLogicCore} from './createLogicCore.js';
export type {
  LogicAction,
  LogicCore,
  LogicCoreOptions,
  LogicNode,
} from './createLogicCore.js';
export {BRIDGE_VERSION, connectBridge} from './connectBridge.js';
export type {Bridge, BridgeHost} from './connectBridge.js';
