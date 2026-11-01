// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioListPrivateContext.ts
 * @input Disabled native name, description and group synchronization callbacks
 * @output Private context without extending the exported RadioListContextValue
 * @position Internal RadioList/RadioListItem bridge; not a public entry point
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const RadioListPrivateContext = createLayerScopedContext<{
  disabledName: string;
  disabledDescriptionID?: string;
  nativeSync: {
    sync: (element: HTMLElement) => void;
    detach: (radio: HTMLInputElement) => void;
  };
} | null>(null);
RadioListPrivateContext.displayName = 'RadioListPrivateContext';
