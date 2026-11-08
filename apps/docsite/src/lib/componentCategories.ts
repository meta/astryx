// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Normalize category names emitted by older published package metadata. */
export function normalizeComponentCategory(category: string): string {
  return category === 'Data Input' ? 'Form Controls' : category;
}
