// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file types.ts
 * @input None
 * @output Shared types for the i18n subpackage
 * @position Type-only module; used across client + server t() implementations
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/i18n/InternationalizationContext.ts
 * - /packages/core/src/i18n/InternationalizationProvider.tsx
 * - /packages/core/src/i18n/serverStore.ts
 * - /packages/core/src/i18n/resolve.ts
 */

/**
 * A BCP 47 language tag. Examples: `'en'`, `'pt'`, `'pt-BR'`, `'zh-Hans'`.
 *
 * Regional tags are meaningful — `pt-BR` and `pt` are different catalogs.
 * When resolving a message, the runtime walks the tag from most-specific
 * to least-specific and falls back to `en` if nothing matches
 * (see `resolveLocaleChain` in `resolve.ts`).
 */
export type Locale = string;

/**
 * A single entry in a translation catalog. The `defaultMessage` is an ICU
 * MessageFormat string; `description` is optional context for translators
 * (surfaced by Crowdin's `react_intl` file type parser).
 */
export interface MessageEntry {
  defaultMessage: string;
  description?: string;
}

/**
 * A translation catalog — a map of stable message keys to entries.
 * Astryx's own keys are namespaced under `@astryx.<component>.<name>`.
 */
export type Catalog = Record<string, MessageEntry>;

/**
 * A generated runtime catalog. Unlike the authoring `Catalog`, it contains
 * only the ICU messages used by applications and no translator metadata.
 */
export type RuntimeCatalog = Readonly<Record<string, string>>;

/**
 * The original rich-catalog map retained for context consumers.
 */
export type MessagesByLocale = Record<Locale, Catalog>;

/**
 * Catalog input accepted by `<InternationalizationProvider>`. Each locale can
 * use either the rich authoring shape or a generated runtime string map.
 */
export type ProviderMessagesByLocale = Record<Locale, Catalog | RuntimeCatalog>;

/**
 * Sparse per-locale overrides applied on top of the shipped defaults.
 * Only the keys the consumer cares to override need to be listed.
 * Overrides are locale-keyed so a runtime locale swap picks up the right ones.
 */
export type Overrides = Partial<Record<Locale, Record<string, string>>>;
