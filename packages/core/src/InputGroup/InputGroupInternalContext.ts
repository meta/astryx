// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file InputGroupInternalContext.ts
 * @input Layer-scoped React context
 * @output Package-private InputGroup state context
 * @position Internal group state; not re-exported by index.ts
 */

import {createLayerScopedContext as createContext} from '../Layer/layerScopedContext';

export const InputGroupInternalContext = createContext({isDisabled: false});
InputGroupInternalContext.displayName = 'InputGroupInternalContext';
