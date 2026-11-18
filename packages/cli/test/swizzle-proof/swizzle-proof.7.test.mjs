// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swizzle-proof.7.test.mjs
 * @input The change under test
 * @output Slice 7 of 8 of the swizzle proof (spec:AST-110 FR7)
 * @position One of eight files: CI runs each in its own swizzle-proof leg
 */

import {proveSlice} from './slice.mjs';

proveSlice(6, 8);
