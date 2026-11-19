// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressBar.a11y.known-failures.ts
 * @input The exact progressbar-contract failures the shipped ProgressBar produces today
 * @output PROGRESSBAR_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the ProgressBar binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const PROGRESSBAR_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
