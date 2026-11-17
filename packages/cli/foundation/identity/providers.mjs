// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Canonical identities for Astryx's built-in providers.
 * @input Stable npm package names owned by Astryx.
 * @output Branded ProviderId values shared by discovery and compilation.
 * @position foundation/identity — built-in provider identity boundary.
 */

import {CLI_PACKAGE_NAME, CORE_PACKAGE_NAME} from './package-names.mjs';
import {normalizeProviderId} from './provider-identity.mjs';

/** Core owns built-in components and templates. */
export const CORE_PROVIDER_ID = normalizeProviderId(CORE_PACKAGE_NAME);

/** The CLI owns built-in topic docs and CLI-authored contributions. */
export const CLI_PROVIDER_ID = normalizeProviderId(CLI_PACKAGE_NAME);
