---
'@astryxdesign/cli': patch
---

[feat] `astryx template <name> <path>` and `astryx template <name>` replace Astryx's docs-only demo content, such as the playing card shown inside motion and gesture examples, with a `<Text>Card content</Text>` placeholder, and remove its import, so copied code never imports a module only Astryx's own previews have. `template.copy` and `template.show` gain `demoContentReplaced` (0 when the template carried none), and the text output says how many elements became placeholders. Templates without demo content are copied exactly as before.

@cixzhang
