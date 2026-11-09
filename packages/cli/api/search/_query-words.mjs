// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How search's searchers and classifier read a query: its words,
 * folded forms, word pairs, and the classifier's tokens and class
 * probabilities.
 */

import {classify} from '../../foundation/route/route.mjs';

/** The domains, in the order the weights files index them. */
export const DOMAINS = ['component', 'hook', 'doc', 'template', 'theme'];

/** The router's classes: the domain a query wants, or none. */
export const ROUTES = [...DOMAINS, 'NONE'];

const STOP = new Set(
  'a an the of for to with and or in on by is it my me i we you this that be as at from use using how what which show make add create get set any can do does not no into via'.split(
    ' ',
  ),
);

const QUESTION = new Set([
  'how',
  'what',
  'why',
  'when',
  'where',
  'can',
  'does',
  'is',
]);

/** @param {string} text @returns {string[]} */
export const words = text =>
  (text || '').toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** Plural folding: one fixed rule per suffix. @param {string} w */
export function fold(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('es') && 'sxz'.includes(w[w.length - 3])) {
    return w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss'))
    return w.slice(0, -1);
  return w;
}

/** A name's words: `DateRangeInput` is date, range, input. @param {string} name */
export function nameWords(name) {
  const s = name
    .replace(/[/-]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return words(s);
}

/** The query's content words, folded. @param {string} q */
export const queryWords = q =>
  words(q)
    .filter(w => !STOP.has(w))
    .map(fold);

/** @param {string} q @returns {string[]} unique words, then adjacent pairs */
export function queryTokens(q) {
  const qw = queryWords(q);
  const pairs = qw.slice(1).map((w, i) => `${qw[i]}_${w}`);
  return [...new Set([...qw, ...pairs])];
}

/** The router's inputs: the query's tokens plus four shape flags. @param {string} q */
export function routerTokens(q) {
  const ws = words(q);
  const flags = [`#n${Math.min(ws.length, 6)}`];
  if (ws.length && QUESTION.has(ws[0])) flags.push('#question');
  if (q.split(/\s+/).some(w => /^use[a-z]+/.test(w)) || /\buse[A-Z]/.test(q)) {
    flags.push('#usehook');
  }
  if (/[A-Z][a-z]+[A-Z]/.test(q)) flags.push('#camel');
  return [...queryTokens(q), ...flags, '#bias'];
}

/**
 * The router's probability for each class: the shared classifier over the
 * query's tokens.
 * @param {import('../../foundation/route/route.mjs').ClassifierWeights} weights
 * @param {string} q
 * @returns {number[]}
 */
export function routeProbs(weights, q) {
  return classify(weights, routerTokens(q));
}
