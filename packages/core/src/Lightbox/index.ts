// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input Imports Lightbox component, useLightbox hook, and types
 * @output Exports Lightbox, useLightbox, and all related types
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 */

export {Lightbox} from './Lightbox';
export type {
  LightboxProps,
  LightboxMedia,
  LightboxMediaType,
  LightboxCustomItem,
  LightboxItem,
  LightboxAction,
} from './Lightbox';
export {useLightboxGallery, useLightboxZoom} from './LightboxContext';
export type {LightboxGallery, LightboxZoom} from './LightboxContext';
export {LightboxFilmstrip} from './LightboxFilmstrip';
export {LightboxZoomControl} from './LightboxZoomControl';

export {useLightbox} from './useLightbox';
export type {UseLightboxOptions, UseLightboxReturn} from './useLightbox';
