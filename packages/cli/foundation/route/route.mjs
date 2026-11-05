// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The small routing helper the commands that pick among candidates
 * share (build, search): two node kinds and the runner that walks them.
 *
 * A searcher answers a request in its command's own result shape, or returns
 * null to pass. A dispatcher scores nothing: it names the children that should
 * answer, best first, with a confidence from 0 to 1. Below its floor, or when
 * none of the children it named answers, its fallback searcher answers. A
 * dispatcher's children may be dispatchers, so trees nest. A classifier is a
 * dispatcher whose route is a static word-weight classifier: the request's
 * tokens vote for a class, and a class with a searcher takes the request when
 * the classifier is sure enough.
 *
 * A tree file types the helpers for its command once, by taking them from
 * `routeKit` typed as `RouteKit<Request, Context, Answer>` (see
 * api/search/tree.mjs); each node is then plain `{id, summary, run}`.
 *
 * Every node gets the same context, so any node can be run, measured, and
 * tuned on its own: `runTree` takes an optional `tuning` with weights that
 * replace a node's shipped weights for one call, and a trace callback that
 * sees every step. Neither ever reaches a command's output.
 *
 * @input a tree of nodes, a request, and the context the command's adapter
 *   gathered
 * @output the first answer a searcher gives
 * @position foundation; api/build and api/search build their trees with it
 */

/**
 * @template Request, Context, Answer
 * @typedef {object} Searcher
 * @property {'searcher'} kind
 * @property {string} id
 * @property {string} summary One plain line: what it answers.
 * @property {(request: Request, ctx: Context, weights: unknown) => Answer | null | Promise<Answer | null>} run
 *   `weights` is a tuning override for this node, or null for its shipped weights.
 */

/**
 * @typedef {object} Route
 * @property {readonly string[]} ids The children to try, best first.
 * @property {number} confidence From 0 to 1.
 */

/**
 * @template Request, Context
 * @typedef {object} Dispatcher
 * @property {'dispatcher'} kind
 * @property {string} id
 * @property {string} summary
 * @property {readonly string[]} children
 * @property {number} floor Below this confidence the fallback answers.
 * @property {string} fallback A searcher's id.
 * @property {(request: Request, ctx: Context, weights: unknown) => Route | Promise<Route>} route
 */

/**
 * @template Request, Context, Answer
 * @typedef {Searcher<Request, Context, Answer> | Dispatcher<Request, Context>} TreeNode
 */

/**
 * @template Request, Context, Answer
 * @typedef {object} Tree
 * @property {string} root
 * @property {ReadonlyMap<string, TreeNode<Request, Context, Answer>>} nodes
 */

/**
 * One step the runner took.
 * @typedef {object} TraceStep
 * @property {string} id
 * @property {'searcher' | 'dispatcher'} kind
 * @property {number} depth
 * @property {boolean} fallback Whether this step ran as a fallback.
 * @property {Route} [route] A dispatcher's route.
 * @property {boolean} [answered] Whether a searcher answered.
 */

/**
 * @typedef {object} Tuning
 * @property {Readonly<Record<string, unknown>>} [weights] Weights by node id, replacing that node's shipped weights for this call.
 * @property {(step: TraceStep) => void} [onTrace]
 */

/**
 * Static classifier weights: one row of numbers per token, one number per
 * class. A request's score for a class is the sum of its tokens' numbers.
 * @typedef {object} ClassifierWeights
 * @property {readonly string[]} classes
 * @property {Readonly<Record<string, readonly number[]>>} tokens
 */

/**
 * @template Request, Context
 * @typedef {object} ClassifierSpec
 * @property {string} id
 * @property {string} summary
 * @property {Readonly<Record<string, string>>} searchers Class name -> the
 *   searcher that answers it. A class with no searcher goes to the fallback.
 * @property {string} fallback The searcher that keeps every other request.
 * @property {number} floor A searcher takes a request only when its class's
 *   probability is at least this.
 * @property {(request: Request, ctx: Context) => readonly string[]} features
 *   The request's tokens.
 * @property {(ctx: Context) => ClassifierWeights} weights The shipped weights,
 *   which the command's adapter put in the context.
 */

/**
 * The helpers, typed for one command's request, context, and answer.
 * @template Request, Context, Answer
 * @typedef {object} RouteKit
 * @property {(node: Omit<Searcher<Request, Context, Answer>, 'kind'>) => Searcher<Request, Context, Answer>} defineSearcher
 * @property {(node: Omit<Dispatcher<Request, Context>, 'kind'>) => Dispatcher<Request, Context>} defineDispatcher
 * @property {(spec: ClassifierSpec<Request, Context>) => Dispatcher<Request, Context>} defineClassifier
 * @property {(root: string, nodes: readonly TreeNode<Request, Context, Answer>[]) => Tree<Request, Context, Answer>} defineTree
 */

/**
 * The probability of each class for these tokens: a softmax over the summed
 * rows of the tokens the weights know.
 * @param {ClassifierWeights} weights
 * @param {readonly string[]} tokens
 * @returns {number[]}
 */
export function classify(weights, tokens) {
  const score = weights.classes.map(() => 0);
  for (const token of tokens) {
    const row = Object.hasOwn(weights.tokens, token)
      ? weights.tokens[token]
      : undefined;
    if (row) for (let k = 0; k < score.length; k++) score[k] += row[k];
  }
  const top = Math.max(...score);
  const e = score.map(x => Math.exp(x - top));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / sum);
}

/**
 * A dispatcher whose route is a static classifier. The most probable class
 * (the first on a tie) is handed to its searcher; a class with no searcher,
 * or the fallback's own class, stays with the fallback. Tuning weights for
 * this node replace its shipped weights.
 * @template Request, Context
 * @param {ClassifierSpec<Request, Context>} spec
 * @returns {Dispatcher<Request, Context>}
 */
export function defineClassifier(spec) {
  const {searchers, fallback} = spec;
  return defineDispatcher({
    id: spec.id,
    summary: spec.summary,
    children: [...new Set([fallback, ...Object.values(searchers)])],
    floor: spec.floor,
    fallback,
    route: (request, ctx, override) => {
      const weights =
        /** @type {ClassifierWeights | null} */ (override) ?? spec.weights(ctx);
      const p = classify(weights, spec.features(request, ctx));
      const best = p.indexOf(Math.max(...p));
      const target = searchers[weights.classes[best]];
      return target && target !== fallback
        ? {ids: [target], confidence: p[best]}
        : {ids: [fallback], confidence: 1};
    },
  });
}

/**
 * @template Request, Context, Answer
 * @param {Omit<Searcher<Request, Context, Answer>, 'kind'>} node
 * @returns {Searcher<Request, Context, Answer>}
 */
export function defineSearcher(node) {
  return Object.freeze({...node, kind: /** @type {const} */ ('searcher')});
}

/**
 * @template Request, Context
 * @param {Omit<Dispatcher<Request, Context>, 'kind'>} node
 * @returns {Dispatcher<Request, Context>}
 */
export function defineDispatcher(node) {
  return Object.freeze({...node, kind: /** @type {const} */ ('dispatcher')});
}

/**
 * A tree from its nodes. Throws on a duplicate id, a missing root, child, or
 * fallback, a fallback that is not a searcher, or a dispatcher cycle.
 * @template Request, Context, Answer
 * @param {string} root
 * @param {readonly TreeNode<Request, Context, Answer>[]} list
 * @returns {Tree<Request, Context, Answer>}
 */
export function defineTree(root, list) {
  /** @type {Map<string, TreeNode<Request, Context, Answer>>} */
  const nodes = new Map();
  for (const node of list) {
    if (nodes.has(node.id)) throw new Error(`duplicate node "${node.id}"`);
    nodes.set(node.id, node);
  }
  if (!nodes.has(root)) throw new Error(`no root node "${root}"`);
  for (const node of nodes.values()) {
    if (node.kind !== 'dispatcher') continue;
    for (const id of [...node.children, node.fallback]) {
      if (!nodes.has(id)) {
        throw new Error(`"${node.id}" names a missing node "${id}"`);
      }
    }
    if (nodes.get(node.fallback)?.kind !== 'searcher') {
      throw new Error(
        `"${node.id}" falls back to "${node.fallback}", which is not a searcher`,
      );
    }
  }
  /** @param {string} id @param {string[]} path */
  const visit = (id, path) => {
    if (path.includes(id)) {
      throw new Error(`dispatcher cycle ${[...path, id].join(' -> ')}`);
    }
    const node = nodes.get(id);
    if (node?.kind === 'dispatcher') {
      for (const child of node.children) visit(child, [...path, id]);
    }
  };
  visit(root, []);
  return Object.freeze({root, nodes});
}

/**
 * Runs the tree from its root, or from `start` to run one node alone: a
 * dispatcher below its floor runs its fallback; otherwise the children it
 * names run in order and the first answer wins; when none answers, the
 * fallback runs.
 * @template Request, Context, Answer
 * @param {Tree<Request, Context, Answer>} tree
 * @param {Request} request
 * @param {Context} ctx
 * @param {{tuning?: Tuning, start?: string}} [options]
 * @returns {Promise<Answer | null>}
 */
export async function runTree(tree, request, ctx, options = {}) {
  const start = options.start ?? tree.root;
  if (!tree.nodes.has(start)) throw new Error(`no node "${start}"`);
  return runNode(tree, start, request, ctx, options.tuning, 0, false);
}

/**
 * @template Request, Context, Answer
 * @param {Tree<Request, Context, Answer>} tree
 * @param {string} id
 * @param {Request} request
 * @param {Context} ctx
 * @param {Tuning | undefined} tuning
 * @param {number} depth
 * @param {boolean} fallback
 * @returns {Promise<Answer | null>}
 */
async function runNode(tree, id, request, ctx, tuning, depth, fallback) {
  const node = /** @type {TreeNode<Request, Context, Answer>} */ (
    tree.nodes.get(id)
  );
  const weights =
    tuning?.weights && Object.hasOwn(tuning.weights, id)
      ? tuning.weights[id]
      : null;
  if (node.kind === 'searcher') {
    const answer = (await node.run(request, ctx, weights)) ?? null;
    tuning?.onTrace?.({
      id,
      kind: 'searcher',
      depth,
      fallback,
      answered: answer !== null,
    });
    return answer;
  }
  const route = await node.route(request, ctx, weights);
  for (const child of route.ids) {
    if (!node.children.includes(child)) {
      throw new Error(
        `"${id}" routed to "${child}", which is not one of its children`,
      );
    }
  }
  tuning?.onTrace?.({
    id,
    kind: 'dispatcher',
    depth,
    fallback,
    route: {ids: [...route.ids], confidence: route.confidence},
  });
  if (route.confidence >= node.floor) {
    for (const child of route.ids) {
      const answer = await runNode(
        tree,
        child,
        request,
        ctx,
        tuning,
        depth + 1,
        false,
      );
      if (answer !== null) return answer;
    }
  }
  return runNode(tree, node.fallback, request, ctx, tuning, depth + 1, true);
}

/**
 * The helpers in one object, for a tree file to type once (see the file
 * comment).
 * @type {RouteKit<any, any, any>}
 */
export const routeKit = {
  defineSearcher,
  defineDispatcher,
  defineClassifier,
  defineTree,
};
