// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle-proof.4.test.mjs
 * @input The change under test
 * @output Slice 4 of 8 of the swizzle proof (spec:AST-110 FR7)
 * @position One of eight files, so the test-node shards split the proof
 */

import {proveSlice} from './slice.mjs';

proveSlice(3, 8);
