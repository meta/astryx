// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The full Astryx CLI program, with every command loaded.
 *
 * @input createProgram (index.mjs).
 * @output `program`, built once when this module loads.
 * @position For code that reads every command at once, such as tests of the
 *   manifest and the docs drift check. A run of the bin builds its own
 *   program from its arguments (run.mjs), so it does not load this module.
 */

import {createProgram} from './index.mjs';

export const program = await createProgram();
