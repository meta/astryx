// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Namespace doc types. A namespace owns navigation slots and a
 * renderer-neutral layout over already-discovered docs. It never scans files
 * or copies child documents.
 */

import type {AuthoredDocGraphFields, AuthoredDocKind} from '../base/type.js';
import type {
  GraphContentBlock,
  ReferenceContentBlock,
} from '../reference/type.js';

/** Which providers may contribute appearances to a namespace slot. */
export type NamespaceProviderScope = 'same' | 'configured';

/** Constraints declared by the namespace that owns a slot. */
export interface NamespaceSlotAcceptance {
  /** Authored doc kinds accepted by this slot. */
  kinds: AuthoredDocKind[];
  /** Omit for the namespace provider; `configured` admits provider appearances. */
  providers?: NamespaceProviderScope;
}

/** One named placement and collection target owned by a NamespaceDoc. */
export interface NamespaceSlot {
  /** Human-readable heading for children in this slot. */
  title: string;
  /** Which docs may be placed or shown in this slot. */
  accepts: NamespaceSlotAcceptance;
}

/** One logical source group that a namespace may adopt. */
export interface NamespaceAdoptionSource {
  /** Provider-local discovery group, such as `cli-commands`. */
  group: string;
  /** Optional subset of authored kinds from the group. */
  kinds?: AuthoredDocKind[];
  /**
   * Experimental: `all` adopts the group's docs from every package, not
   * only the namespace's own. Read only on the CLI's own namespaces marked
   * `stability: 'experimental'` (the icon definitions).
   * @experimental
   */
  packages?: 'all';
}

/**
 * Assigns otherwise-unplaced docs from one provider-local source group to a
 * child namespace. Discovery defines groups; this rule never scans a folder.
 */
export interface NamespaceAdoptionRule {
  source: NamespaceAdoptionSource;
  /** Slot owned by this namespace that becomes the canonical destination. */
  into: string;
  /** Generate one child namespace per authored kind. */
  groupBy?: 'kind';
}

/**
 * An authored documentation namespace. Its ordered blocks control layout while
 * slots and adoption rules describe where already-discovered docs may appear.
 */
export interface NamespaceDoc extends AuthoredDocGraphFields {
  type: 'namespace';
  /** Stable provider-local name. Navigation changes do not change this value. */
  name: string;
  /** Human-readable page title. */
  title: string;
  /** One-line summary shown in listings and search results. */
  summary: string;
  /** Search terms that are not already present in the title or summary. */
  keywords?: string[];
  /** Named child-placement and collection targets. */
  slots: Record<string, NamespaceSlot>;
  /** Optional source-adoption rules for otherwise-unplaced docs. */
  adopts?: NamespaceAdoptionRule[];
  /** Ordered renderer-neutral content and collection blocks. */
  blocks?: (ReferenceContentBlock | GraphContentBlock)[];
}
