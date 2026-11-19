// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for `integrationExampleScope()`, the scope a
 * package's component examples are read against. `ExampleScope` itself is the
 * authoring contract in `authoring/example/type.ts`.
 */

/**
 * Options for `integrationExampleScope()`.
 * @typedef {object} IntegrationExampleScopeOptions
 * @property {string} [cwd] the folder the local package or `node_modules` is
 *   found from
 */

/**
 * The scope a package's component examples are read against, as JSON. The
 * shape is a contract: a release may add a field, and never renames, removes
 * or retypes one, so a stored scope stays readable.
 * @typedef {object} IntegrationExampleScopeResponse
 * @property {'integration.example-scope'} type
 * @property {{found: boolean, name: string | null, version: string | null, scope: import('../../authoring/example/type.ts').ExampleScope | null, reason?: string, incomplete?: string}} data
 */

export {};
