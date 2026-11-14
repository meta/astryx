// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The component reads' results before `component()` adds `data.theme`.
 * Internal: the API and JSON barrels do not re-export this module.
 */

/**
 * A list read before `component()` adds `data.theme`.
 * @typedef {{type: 'component.list'; data: import('./component.type.mjs').ComponentListData}} ComponentListRead
 */

/**
 * A detail read before `component()` adds `data.theme`.
 * @typedef {Omit<import('./component.type.mjs').ComponentDetailResponse, 'data'> & {data: Omit<import('./component.type.mjs').ComponentDetailResponse['data'], 'theme'>}} ComponentDetailRead
 */

export {};
