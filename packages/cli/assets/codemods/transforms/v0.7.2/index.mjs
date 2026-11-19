// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateListEdgeCompensationToEdge, {
  meta as migrateListEdgeCompensationToEdgeMeta,
} from './migrate-list-edge-compensation-to-edge.mjs';

export default [
  {
    name: 'migrate-list-edge-compensation-to-edge',
    transform: migrateListEdgeCompensationToEdge,
    meta: migrateListEdgeCompensationToEdgeMeta,
  },
];
