// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useDevWarning.ts
 * @input A component name, a message, and a boolean condition
 * @output Public once-per-mount warnings and an internal per-message variant
 * @position Core hook; both paths share one render-safe diagnostic owner.
 *   A stable instance and an effect warn after commit, without a re-render.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/utils/devWarning.ts (the imperative counterpart)
 */

import {useEffect, useState} from 'react';
import {createDevWarnings} from '../utils/devWarning';

/**
 * Fire a dev-only warning once per mount while `condition` is true.
 *
 * @param component - Component or hook name (message prefix)
 * @param message - What went wrong and how to fix it
 * @param condition - Whether to warn; defaults to `true`
 *
 * @example
 * ```
 * useDevWarning(
 *   'Field',
 *   'isOptional and isRequired are mutually exclusive. isOptional takes precedence.',
 *   isOptional && isRequired,
 * );
 * ```
 */
export function useDevWarning(
  component: string,
  message: string,
  condition: boolean = true,
): void {
  useWarning(component, message, condition, false);
}

/** Warns once for each distinct message. Internal. */
export function useDevWarningPerMessage(
  component: string,
  message: string,
  condition: boolean = true,
): void {
  useWarning(component, message, condition, true);
}

function useWarning(
  component: string,
  message: string,
  condition: boolean,
  isPerMessage: boolean,
): void {
  // State survives Fast Refresh, so a hot update does not repeat a warning.
  const [warn] = useState(createDevWarnings);
  useEffect(() => {
    // Synchronize the development diagnostic sink after committed renders.
    if (condition) {
      warn(component, message, isPerMessage ? message : '');
    }
  }, [component, message, condition, isPerMessage, warn]);
}
