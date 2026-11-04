// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doc-type vocabulary barrel. Each kind's types live in one `type.ts`
 * under its folder (`base/` shared leaves, then `component/`, `hook/`,
 * `reference/`, `template/`, `theme/`, `icon-set/`, `icon-definition/`); this re-exports them as the full doc vocabulary
 * behind `@astryxdesign/cli/authoring`.
 */

export type * from './base/type.js';
export type * from './component/type.js';
export type * from './hook/type.js';
export type * from './function/type.js';
export type * from './reference/type.js';
export type * from './namespace/type.js';
export type * from './template/type.js';
export type * from './schema/type.js';
export type * from './command/type.js';
export type * from './enum/type.js';
export type * from './theme/type.js';
export type * from './icon-set/type.js';
export type * from './icon-definition/type.js';
