// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Section anchors and the outline of a reference doc page. Kept apart
 * from ReferenceDocView so build scripts and tests can check anchors without
 * rendering. generate-data's docs-pages.mjs mirrors sectionIds for redirects.
 */

import type {OutlineItem} from '@astryxdesign/core/Outline';
import type {DocSection} from '../../generated/docsRegistry';

/** Slugify a section title into a stable, URL-safe anchor id. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function uniqueSlug(
  value: string,
  seen: Map<string, number>,
  fallback: string,
): string {
  const base = slugify(value) || fallback;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

export function normalizeHeadingLevel(
  level: number | undefined,
): 3 | 4 | 5 | 6 {
  return level === 4 || level === 5 || level === 6 ? level : 3;
}

/**
 * Build unique anchor ids for sections and nested heading blocks, deduping
 * collisions so every outline link resolves to exactly one element.
 */
export function buildOutline(sections: DocSection[]): {
  sectionIds: string[];
  blockIds: Map<string, string>;
  outline: OutlineItem[];
} {
  const seen = new Map<string, number>();
  const sectionIds: string[] = [];
  const blockIds = new Map<string, string>();
  const outline: OutlineItem[] = [];

  sections.forEach((section, sectionIndex) => {
    const sectionId = uniqueSlug(section.title, seen, 'section');
    sectionIds.push(sectionId);
    outline.push({
      id: sectionId,
      label: section.title,
      level: 2,
    });

    section.content.forEach((block, blockIndex) => {
      if (block.type !== 'heading' || !block.text) {
        return;
      }
      const blockId = uniqueSlug(
        `${section.title} ${block.text}`,
        seen,
        `${sectionId}-heading`,
      );
      blockIds.set(`${sectionIndex}:${blockIndex}`, blockId);
      outline.push({
        id: blockId,
        label: block.text,
        level: normalizeHeadingLevel(block.level),
      });
    });
  });

  return {sectionIds, blockIds, outline};
}
