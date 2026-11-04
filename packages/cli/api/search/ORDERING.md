# Search ordering data

`astryx search` decides **what matches**, and each match's score and reason, with the lexical ranker (`_lexical.mjs` and the files it imports). The files in this folder only decide **the order of matches inside one score band**: they never add or drop a match, change a score, or move a match past one of another band or kind (doc or not). The bands are scores 195 and up, 188–194, 170–187, 160–169, 151–159, 100–150, 55–99, and under 55. A band can be wide (55–99 holds keyword matches beside one-word description hits), so inside a band a lower score can lead a higher one.

## Rule

`spec:AST-083` owns search's result order; this file describes the data that implements it. Inside one score band, a searcher's static weights decide the order. Matches with the same score move together as one block, placed by the learned position of the block's first match: moving each one on its own breaks search's existing rules for tied matches. Inside a block, the lexical ranker's order holds, except below the first result: there a block of one domain puts a part of the first result first (its name words start with the first result's; at most two parts lead across an answer), then the match whose matched words are rarer in the catalog. Matches never cross bands or kinds. There is no model runtime: every number is a plain static value read at load time.

## Files

| File                                                                                           | What it holds                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree.weights.json`                                                                            | The root classifier: for each query word or word pair, one number per class (component, hook, doc, template, theme, none). The query's tokens vote, and a topic searcher takes the query only when its class wins by the floor in `tree.mjs`. |
| `_main-searcher.weights.json`, `_doc-searcher.weights.json`, `_template-searcher.weights.json` | One weight, mean and spread per signal for each searcher (see `SIGNALS` and `PER_DOMAIN` in `_features.mjs`). A match's place inside its band is the weighted sum of its standardized signals.                                                |
| `_cards.json`                                                                                  | One card per Core component and hook: what it is, the words people use for it, and its main props, written from the item's own source. Cards feed one signal, word overlap with the card.                                                     |

The signals are counts over the query and each entry's own text: the lexical score and rank, BM25 over the entry's name, docs text and card, how many query words the entry covers, whether the query holds the entry's name, and the classifier's guess of the domain.

## Status

These files are static and reviewed. They are not computed when the CLI runs, and nothing at run time writes them.

## Refreshing

- A Core component or hook without a card is still matched and scored as usual; inside its band it is ordered by its other signals.
- When Core adds or renames items, a reviewed change adds or updates their cards and, if needed, refreshed weights.
- Any refresh must keep every test that pins search's behavior passing, including the ordering invariants in `_order.test.mjs`. It must also keep the `astryx search` output's matches, scores and reasons identical to the lexical ranker's.
- Any refresh must also be measured as `spec:AST-083` FR6 requires: against the held-out, fresh and synthetic evaluation sets, with no row worse than the previous order (a row is worse when the paired 95% confidence interval of its change lies entirely below zero).
