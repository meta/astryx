// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Alert.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Exact public-safe baseline failures for Banner's urgent alert binding
 * @position Shared by the jsdom and Chromium bindings. Empty: the urgent
 *   message element holds the title and the description only (FR8).
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const BANNER_ALERT_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
