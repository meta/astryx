// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Door conformance (spec AST-081 FR1) in an empty folder: every command
 * example gives the same result through the bin and the host entry.
 * @input door-conformance.shared.mjs
 * @output Vitest tests
 * @position packages/cli/host; one of three files, one per folder
 */

import {describeDoorConformance} from './door-conformance.shared.mjs';

describeDoorConformance('an empty folder');
