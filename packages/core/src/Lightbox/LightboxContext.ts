// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file LightboxContext.ts
 * @input Lightbox provides the gallery and zoom values to its Footer
 * @output useLightboxGallery and useLightboxZoom: values and methods only
 * @position Read by the components in a Lightbox's `footer`, such as
 *   LightboxFilmstrip and LightboxZoomControl. The recognizers and the zoom
 *   stage stay inside Lightbox.
 */

import {createContext, use} from 'react';
import type {LightboxItem} from './Lightbox';

/** The open gallery, as a Footer component reads it. */
export interface LightboxGallery {
  /** Every item, in order. */
  readonly items: ReadonlyArray<LightboxItem>;
  /** The active item's index. */
  readonly index: number;
  /** Moves to an item, as Previous and Next do. */
  setIndex(index: number): void;
}

/** The active image's zoom, as a Footer component reads it. */
export interface LightboxZoom {
  /** The settled scale: 1 is the fitted size. */
  readonly scale: number;
  /** Whether the active item can zoom in further. */
  readonly canZoomIn: boolean;
  /** Whether the active item is zoomed, so it can zoom out. */
  readonly canZoomOut: boolean;
  /** Zooms in about the centre, as `+` does. */
  zoomIn(): void;
  /** Zooms out about the centre, as `-` does. */
  zoomOut(): void;
  /** Returns to the fitted size, as `0` does. */
  reset(): void;
}

export interface LightboxFooterValue {
  readonly gallery: LightboxGallery;
  readonly zoom: LightboxZoom;
}

export const LightboxFooterContext = createContext<LightboxFooterValue | null>(
  null,
);
LightboxFooterContext.displayName = 'LightboxFooterContext';

function useFooterValue(hook: string): LightboxFooterValue {
  const value = use(LightboxFooterContext);
  if (value == null) {
    throw new Error(`${hook} reads a Lightbox, so call it in its footer.`);
  }
  return value;
}

/** The open gallery's items, active index and a way to move. */
export function useLightboxGallery(): LightboxGallery {
  return useFooterValue('useLightboxGallery').gallery;
}

/** The active image's settled zoom and the steps it can take. */
export function useLightboxZoom(): LightboxZoom {
  return useFooterValue('useLightboxZoom').zoom;
}
