// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SliderRange.a11y.known-failures.ts
 * @input The exact contract failures the shipped range Slider produces today
 * @output SLIDER_RANGE_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the range Slider binding (both patterns it runs)
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const SLIDER_RANGE_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
