// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemDescriptionContext.tsx
 * @input Uses React createContext
 * @output Exports ItemDescriptionContext
 * @position Internal seam between Item and a control it renders in a slot
 *
 * Item renders the row's description and owns the element that holds it. A
 * control Item renders in a slot — the checkbox in CheckboxListItem, for
 * example — has to point at that element with `aria-describedby`, and only
 * Item knows its id.
 *
 * Publishing the id here keeps that wiring internal. The alternative, a public
 * `descriptionId` prop, would fail `spec:AST-002/DEC-1`: the caller decides
 * nothing, and Item can derive the id itself. Wrapping the description in an
 * id'd element instead would turn a plain string into a ReactNode and drop the
 * single-line truncation ListItem documents.
 *
 * `null` when the row renders no description, so a consumer adds no dangling
 * `aria-describedby`.
 */

import {createContext} from 'react';

export const ItemDescriptionContext = createContext<string | null>(null);
ItemDescriptionContext.displayName = 'ItemDescriptionContext';
