// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle-proof.5.test.mjs
 * @input The change under test
 * @output Slice 5 of 8 of the swizzle proof (spec:AST-110 FR7)
 * @position One of eight files, so the test-node shards split the proof
 */

import {proveSlice} from './slice.mjs';

proveSlice(4, 8);
