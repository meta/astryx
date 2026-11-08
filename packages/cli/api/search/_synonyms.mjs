// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's synonym map: product words an agent types, mapped to the
 * catalog's vocabulary in both directions.
 */

/**
 * Synonym / intent map: product-language terms an agent is likely to type,
 * expanded to the catalog's vocabulary so oblique queries still rank. Keys and
 * values are matched bidirectionally (typing any value also pulls in the key
 * and its siblings). Lowercase, single words or short phrases. Exported for
 * `build`, whose page ranker expands a query with the same vocabulary.
 */
export const SYNONYMS = {
  dashboard: [
    'overview',
    'analytics',
    'kpi',
    'kpis',
    'metrics',
    'stats',
    'reporting',
    'insights',
    'control',
  ],
  login: ['signin', 'auth', 'authentication', 'sso', 'credentials', 'account'],
  signup: ['register', 'registration', 'onboarding'],
  payment: ['checkout', 'billing', 'card', 'pay', 'purchase', 'order'],
  pricing: ['plans', 'plan', 'tiers', 'tier', 'subscription', 'subscriptions'],
  chat: ['messaging', 'message', 'messages', 'conversation', 'inbox', 'dm'],
  settings: ['preferences', 'config', 'configuration', 'account'],
  calendar: ['schedule', 'scheduling', 'events', 'event', 'month', 'agenda'],
  table: ['list', 'rows', 'records', 'grid', 'spreadsheet', 'datatable'],
  gallery: ['photos', 'photo', 'images', 'image', 'pictures'],
  hero: ['banner', 'splash', 'headline', 'landing'],
  form: ['fields', 'input', 'inputs', 'survey'],
  profile: ['bio', 'avatar', 'user'],
  documentation: ['docs', 'reference', 'guide', 'api'],
  navigation: ['nav', 'menu', 'sidebar'],
};

// Flatten into a token -> Set(expansions) lookup (bidirectional).
export const SYNONYM_INDEX = (() => {
  /** @type {Map<string, Set<string>>} */
  const idx = new Map();
  /**
   * @param {string} a
   * @param {string} b
   */
  const add = (a, b) => {
    let set = idx.get(a);
    if (!set) {
      set = new Set();
      idx.set(a, set);
    }
    set.add(b);
  };
  for (const [key, vals] of Object.entries(SYNONYMS)) {
    for (const v of vals) {
      add(key, v);
      add(v, key);
      for (const v2 of vals) if (v2 !== v) add(v, v2);
    }
  }
  return idx;
})();
