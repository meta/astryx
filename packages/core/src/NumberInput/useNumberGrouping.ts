// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useNumberGrouping.ts
 * @input Uses React useState and useEffect, and numberGrouping.ts through a
 *   deferred import with createModuleLoader
 * @output Exports useNumberGrouping, which returns the grouping helpers once
 *   they load, and numberGroupingModule, which loads them without rendering
 * @position Internal to NumberInput: the deferred load of
 *   `isGroupedWhileEditing`'s code
 *
 * Only `isGroupedWhileEditing` regroups a draft, so its helpers load after
 * the first render that turns it on. A page whose NumberInput does not set
 * the prop does not load them. The load starts in an Effect, so it never
 * starts on the server or in the render that hydrates server HTML. Until it
 * finishes, the field edits the plain locale number. A field that mounts
 * after the first load gets the helpers at once.
 */

import {useEffect, useState} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as NumberGrouping from './numberGrouping';

export type NumberGroupingModule = typeof NumberGrouping;

/** The grouping helpers, loaded once on demand. */
export const numberGroupingModule = createModuleLoader<NumberGroupingModule>(
  async () => import('./numberGrouping'),
);

/**
 * The grouping helpers while `isEnabled`, or null while they load or when it
 * is off.
 */
export function useNumberGrouping(
  isEnabled: boolean,
): NumberGroupingModule | null {
  const [grouping, setGrouping] = useState(numberGroupingModule.loaded);
  useEffect(() => {
    if (!isEnabled || grouping !== null) {
      return;
    }
    let isCurrent = true;
    numberGroupingModule.load().then(
      module => {
        if (isCurrent) {
          setGrouping(module);
        }
      },
      () => {
        // The field keeps editing the plain locale number.
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [grouping, isEnabled]);
  return isEnabled ? grouping : null;
}
