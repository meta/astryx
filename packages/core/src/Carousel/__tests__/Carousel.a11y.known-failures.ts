// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Carousel.a11y.known-failures.ts
 * @input The exact carousel-contract failures the shipped Carousel produces today
 * @output CAROUSEL_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the Carousel binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const CAROUSEL_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
