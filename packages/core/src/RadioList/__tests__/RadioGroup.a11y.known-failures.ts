// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadioGroup.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Exact public-safe radio-group migration failures
 * @position AST-021 debt records; operational ownership remains outside public source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const RADIO_GROUP_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
