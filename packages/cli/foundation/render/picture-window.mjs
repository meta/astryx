// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The window the editor's pictures are taken in.
 * @input None.
 * @output `PICTURE_WINDOW`: its width and height in CSS pixels.
 * @position Read by the picture scripts (picture-chrome.mjs,
 *   picture-playwright.mjs), which open the browser at this size, and by the
 *   layer drawing (layers.mjs), which answers media queries for it, so a
 *   part drawn open lays out as the picture shows it.
 */

export const PICTURE_WINDOW = Object.freeze({width: 1280, height: 900});
