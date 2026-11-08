// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Listbox.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Current public-safe Selector and MultiSelector listbox migration failures
 * @position AST-021 debt records; operational ownership remains outside public source.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const LISTBOX_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
