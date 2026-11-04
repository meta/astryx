---
'@astryxdesign/cli': patch
---

[perf] `astryx search` and `astryx build` parse a page template's source for the components it renders only when the query could match one of them. A query no page renders parses only the few pages whose source holds an escape, and a first search for it uses about 20% less CPU. A query whose words name components on most pages still parses most of them and can take up to about 4% more. Results are unchanged.

@vjeux
