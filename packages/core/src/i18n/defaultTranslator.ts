// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file defaultTranslator.ts
 * @input sharedState
 * @output defaultTranslator, the slot for the English translator of a context
 *   without a provider
 * @position Internal. InternationalizationContext.ts reads the slot and
 *   translatingContext.ts fills it. It imports no resolver.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/translatingContext.ts
 */

import type {getResolve} from './resolve';
import {sharedState} from '../utils/sharedRealm';

export const defaultTranslator = sharedState(
  'i18n/default-translator/default-translator',
  1,
  (): {translate?: ReturnType<typeof getResolve>} => ({}),
);
