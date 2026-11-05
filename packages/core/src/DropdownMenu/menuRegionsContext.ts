// Copyright (c) Meta Platforms, Inc. and affiliates.
'use client';
/**
 * @file menuRegionsContext.ts
 * @input DropdownMenu's `header` and `footer` props
 * @output `MenuRegionsContext`: whether the root menu has a header or footer
 * @position Internal; not exported from the package. A sub-menu flyout reads it
 *   to close itself on Tab, so the root menu can move focus to a region.
 *
 * A plain context rather than a layer-scoped one on purpose: each sub-menu
 * flyout is its own layer, and it must still see the root's value. A nested
 * DropdownMenu provides its own value, so it never inherits an outer one.
 */
import {createContext} from 'react';

export const MenuRegionsContext = createContext(false);
MenuRegionsContext.displayName = 'MenuRegionsContext';
