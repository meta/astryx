// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useNumberGrouping.ts
 * @input Uses React useState and useEffect, and groupedEditing.ts through a
 *   deferred import with createModuleLoader
 * @output Exports useNumberGrouping, which returns the grouped-editing module
 *   once it loads, and numberGroupingModule, which loads it without rendering
 * @position Internal to NumberInput: the deferred load of
 *   `isGroupedWhileEditing`'s code
 *
 * Only `isGroupedWhileEditing` regroups a draft, so its code (the grouping
 * helpers and the change, composition and keydown handling) loads after
 * the first render that turns it on. A page whose NumberInput does not set
 * the prop does not load them. The load starts in an Effect, so it never
 * starts on the server or in the render that hydrates server HTML. Until it
 * finishes, the field edits the plain locale number. A field that mounts
 * after the first load gets the helpers at once.
 */

import {useEffect, useState} from 'react';
import {createModuleLoader} from '../utils/moduleLoader';
import type * as GroupedEditing from './groupedEditing';

export type NumberGroupingModule = typeof GroupedEditing;

/** The grouped-editing module, loaded once on demand. */
export const numberGroupingModule = createModuleLoader<NumberGroupingModule>(
  async () => import('./groupedEditing'),
);

/**
 * The grouped-editing module while `isEnabled`, or null while it loads or
 * when it is off.
 */
export function useNumberGrouping(
  isEnabled: boolean,
): NumberGroupingModule | null {
  const [grouping, setGrouping] = useState(numberGroupingModule.loaded);
  // Syncs with the module loader: the grouping helpers load after the first
  // render that sets the prop.
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
