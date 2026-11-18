// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file jsdomRefusedRules.ts
 * @input A CSS rule's text
 * @output The marker of the one rule the test setup keeps out of jsdom's
 *   stylesheet
 * @position Test setup only: setup.ts refuses a rule carrying it when it is
 *   inserted, and stylexInject.ts skips one before inserting it
 *
 * SYNC: When modified, update this header and
 * /internal/test-utils/src/README.md
 */

/**
 * The group last-member rule, `:nth-last-child(1 of S)` (ButtonGroup FR3),
 * which jsdom's selector engine evaluates far too slowly and differently from
 * browsers (see setup.ts).
 */
export const GROUP_LAST_MEMBER = ':nth-last-child(1 of ';
