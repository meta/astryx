// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemMarkerColumnsContext.tsx
 * @input The exact marker element supplied by a numbered composing row
 * @output Private ItemMarkerColumnsContext; not part of the public Item exports
 * @position Item-owned seam for the marker/content formatting group
 *
 * Numbered ListItem rows need two subgrid cells. Other marked Items keep their
 * flat flex children. Marker identity, rather than an inherited boolean,
 * confines the group to that one row: an Item nested in a slot has a different
 * marker and does not inherit the formatting request.
 */

import {createContext, type ReactNode} from 'react';

export const ItemMarkerColumnsContext = createContext<ReactNode>(null);
ItemMarkerColumnsContext.displayName = 'ItemMarkerColumnsContext';
