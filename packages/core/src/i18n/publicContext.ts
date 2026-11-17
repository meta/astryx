// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file publicContext.ts
 * @input InternationalizationContext, fullEnglishFallback
 * @output The public InternationalizationContext export
 * @position The package's InternationalizationContext, re-exported by the i18n
 *   barrel. The same context object Core components read.
 *
 * Application code may call `translate` from this context with any Astryx
 * key, so loading the public export registers the whole English catalog.
 * Core modules import ./InternationalizationContext directly and register only
 * the English they name. The export is its own binding rather than a
 * re-export so bundlers keep this module, and its registration, whenever the
 * public context is used.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/index.ts
 */

import {InternationalizationContext as ProviderContext} from './InternationalizationContext';
import {registerFullEnglishFallback} from './fullEnglishFallback';

registerFullEnglishFallback();

export const InternationalizationContext = ProviderContext;
