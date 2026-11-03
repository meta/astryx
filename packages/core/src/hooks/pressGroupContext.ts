// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file pressGroupContext.ts
 * @input Nothing
 * @output PressGroupContext: true inside a group whose own tracker paints
 *   its actions' press
 * @position Internal; not exported from the hooks entry. AlertDialog
 *   provides it around its tracked actions, and Button reads it.
 */

import {createContext} from 'react';

/**
 * True inside a group whose tracker paints a pointer's press on its actions.
 * Those actions take no `:active` paint, so one press never lights two.
 */
export const PressGroupContext = createContext(false);
PressGroupContext.displayName = 'PressGroupContext';
