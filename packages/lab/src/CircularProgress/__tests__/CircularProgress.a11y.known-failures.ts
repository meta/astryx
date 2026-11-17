// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircularProgress.a11y.known-failures.ts
 * @input The exact progressbar-contract failures the shipped CircularProgress produces today
 * @output CIRCULAR_PROGRESS_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the CircularProgress binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const CIRCULAR_PROGRESS_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
