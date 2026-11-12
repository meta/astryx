// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.a11y.known-failures.ts
 * @input Uses KnownFailure from @astryxdesign/a11y-spec
 * @output Exact public-safe baseline failures for Dialog's modal-dialog binding
 * @position Shared by the jsdom and Chromium bindings. These records preserve
 *   current behavior during test migration; they do not approve remediation.
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';

export const DIALOG_MODAL_KNOWN_FAILURES: ReadonlyArray<KnownFailure> = [];
