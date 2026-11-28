// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * StyleX rules with each relation that ends in a bare `*` keyed to the rule's
 * own class. A rule without one comes back as it is.
 */
export declare function keyRelations<Rule>(rules: readonly Rule[]): Rule[];

/**
 * The text of one StyleX rule with each relation that ends in a bare `*`
 * keyed to `className`. Any other text comes back unchanged.
 */
export declare function keySelectors(css: string, className: string): string;
