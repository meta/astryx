// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle-proof.3.test.mjs
 * @input The change under test
 * @output Slice 3 of 8 of the swizzle proof (spec:AST-110 FR7)
 * @position One of eight files: CI runs each in its own swizzle-proof leg
 */

import {proveSlice} from './slice.mjs';

proveSlice(2, 8);
