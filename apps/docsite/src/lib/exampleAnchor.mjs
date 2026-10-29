// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Defines stable HTML ids shared by search links and rendered examples.
 * @input A block catalog directory name.
 * @output A deterministic, HTML-safe component-example anchor id.
 * @position Used by docsite generation and component-detail rendering.
 */

/**
 * Stable id for a component example rendered from a CLI block.
 * The block directory name is the catalog identifier shared by search and the
 * generated example registry; sanitizing keeps integration-owned names valid
 * as HTML ids without inventing a second identity.
 *
 * @param {string} dirName
 * @returns {string}
 */
export function exampleAnchorId(dirName) {
  return `example-${String(dirName).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}
