# Search ordering data

`astryx search` decides **what matches**, and each match's score and reason, with the lexical ranker (`_lexical.mjs` and the files it imports). The files in this folder only decide **the order of matches inside one score band**: they never add or drop a match, change a score, or move a match past one of another band or kind (doc or not). The bands are scores 195 and up, 188–194, 170–187, 160–169, 151–159, 100–150, 55–99, and under 55. A band can be wide (55–99 holds keyword matches beside one-word description hits), so inside a band a lower score can lead a higher one.

## Rule

`spec:AST-083` owns search's result order; this file describes the data that implements it. Inside one score band, a searcher's static weights decide the order. Matches with the same score move together as one block, placed by the learned position of the block's first match: moving each one on its own breaks search's existing rules for tied matches. Inside a block, the lexical ranker's order holds, except below the first result: there a block of one domain puts a part of the first result first (its name words start with the first result's; at most two parts lead across an answer), then the match whose matched words are rarer in the catalog. Matches never cross bands or kinds. There is no model runtime: every number is a plain static value read at load time.

After that order, one fit pass reads the first ten results (`_fit-order.mjs`). The first result stays. The others split into runs of one band and kind. Inside a run, each match gets a fit to the whole query from build's block-picker match (`../build/blocks/blocks.mjs` with `blocks.weights.json`) over the match's own docs: its name words, display name or title, description, and keywords. A match whose fit is under 1.7 times the run's median fit moves, in order, after the others in its run, unless its name spells two or more of the query's words. Such a match never moves down; it can still move up when others move after it. A run whose median fit is zero or less keeps its order. A query that is an entry's whole name skips the pass, as it skips the learned order. The pass always reads ten places before the limit cuts the answer. At the default limit, and at any limit of 10 or more, the set of results stays the same. A smaller limit shows the top of the new order, so it can show a different result. Build's loader (`loadBlockPicker` in `../build/_adapter.mjs`) reads and checks the block-picker weights for both commands. When the file is missing, unreadable, or not the picker's shape, the loader returns null and the pass keeps the order. The pass reads the weights only when a run holds two or more matches, and it decodes only the matrix rows that the query's words and those matches' docs use, so a search does not pay for the whole catalog.

## Files

| File                                                                                           | What it holds                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree.weights.json`                                                                            | The root classifier: for each query word or word pair, one number per class (component, hook, doc, template, theme, none). The query's tokens vote, and a topic searcher takes the query only when its class wins by the floor in `tree.mjs`. |
| `_main-searcher.weights.json`, `_doc-searcher.weights.json`, `_template-searcher.weights.json` | One weight, mean and spread per signal for each searcher (see `SIGNALS` and `PER_DOMAIN` in `_features.mjs`). A match's place inside its band is the weighted sum of its standardized signals.                                                |
| `../build/blocks/blocks.weights.json`                                                          | The block picker's vocabulary, idf and two projection matrices, shared with build. The fit pass reads them through build's loader; search ships no copy.                                                                                      |
| `_cards.json`                                                                                  | One card per Core component and hook: what it is, the words people use for it, and its main props, written from the item's own source. Cards feed one signal, word overlap with the card.                                                     |

The signals are counts over the query and each entry's own text: the lexical score and rank, BM25 over the entry's name, docs text and card, how many query words the entry covers, whether the query holds the entry's name, and the classifier's guess of the domain.

## Status

These files are static and reviewed. They are not computed when the CLI runs, and nothing at run time writes them.

## Refreshing

- A Core component or hook without a card is still matched and scored as usual; inside its band it is ordered by its other signals.
- When Core adds or renames items, a reviewed change adds or updates their cards and, if needed, refreshed weights.
- Any refresh must keep every test that pins search's behavior passing, including the ordering invariants in `_order.test.mjs`. It must also keep the `astryx search` output's matches, scores and reasons identical to the lexical ranker's.
- Any refresh must also be measured as `spec:AST-083` FR6 requires: against the held-out, fresh and synthetic evaluation sets, with no row worse than the previous order (a row is worse when the paired 95% confidence interval of its change lies entirely below zero).
