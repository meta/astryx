// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Calendar.a11y.known-failures.ts
 * @input The exact grid-contract failures the shipped Calendar produces today
 * @output CALENDAR_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the Calendar binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const CALENDAR_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
