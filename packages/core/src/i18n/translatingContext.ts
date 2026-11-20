// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file translatingContext.ts
 * @input InternationalizationContext, getResolve, defaultTranslator
 * @output InternationalizationContext, the same context object, for a module
 *   that translates
 * @position Internal. Translators take the context from here. Loading it
 *   fills the English translator of a context without a provider. The export
 *   is its own binding, so bundlers keep this module with its translator.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/defaultTranslator.ts
 * - /packages/core/src/i18n/useComponentTranslator.ts
 * - /packages/core/src/i18n/useTranslator.ts
 * - /packages/core/src/i18n/publicContext.ts
 */

import {InternationalizationContext as LocaleContext} from './InternationalizationContext';
import {defaultTranslator} from './defaultTranslator';
import {getResolve} from './resolve';

defaultTranslator.translate ??= getResolve('en', {});

export const InternationalizationContext = LocaleContext;
