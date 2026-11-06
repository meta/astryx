// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Slider.a11y.known-failures.ts
 * @input The exact slider-contract failures the shipped Slider produces today
 * @output SLIDER_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the Slider binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const SLIDER_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
