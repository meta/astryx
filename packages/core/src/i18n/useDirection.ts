// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDirection.ts
 * @input TranslationRuntimeContext (via use())
 * @output 'ltr' | 'rtl'
 * @position Client hook for reading the ambient text direction. Returns 'ltr'
 *   when called outside a provider (matches the silent-en-fallback pattern of
 *   useTranslator).
 *
 * Render-time last resort. Prefer, in order: CSS logical properties; the shared
 * `rtlStyles.mirror` for directional icons (CSS scaleX, not a JS icon-name
 * swap); and lazy DOM reads (`isRtlElement`) for behavioral logic like keyboard
 * nav or drag math. Reach for this hook only when you need the direction value
 * during render and none of those fit — note it can mismatch on hydration if
 * the provider's direction disagrees with the actual `<html dir>`.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/TranslationRuntimeContext.ts
 * - /packages/core/src/i18n/getLocaleDirection.ts (server-safe counterpart)
 * - /packages/core/src/i18n/index.ts
 */

import {use} from 'react';
import {TranslationRuntimeContext} from './TranslationRuntimeContext';

export function useDirection(): 'ltr' | 'rtl' {
  const ctx = use(TranslationRuntimeContext);
  return ctx.direction;
}
