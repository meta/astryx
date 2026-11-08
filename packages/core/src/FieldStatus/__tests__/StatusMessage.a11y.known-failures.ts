// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file StatusMessage.a11y.known-failures.ts
 * @input Uses the exact known-failure vocabulary from the shared runner
 * @output Public-safe Core status-message debt records (currently none)
 * @position Migration debt only; operational ownership is maintained outside this public repository
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const CORE_STATUS_MESSAGE_KNOWN_FAILURES: ReadonlyArray<KnownFailure> =
  [];
