---
'@astryxdesign/cli': patch
---

[feat] `astryx template <name> <path>` and `astryx template <name>` replace Astryx's docs-only demo content, such as the playing card shown inside motion and gesture examples, with a `<Text>Card content</Text>` placeholder, and remove its import, so copied code never imports a module only Astryx's own previews have. `template.copy` and `template.show` gain `demoContentReplaced` (0 when the template carried none), and the text output says how many elements became placeholders. Templates without demo content are copied exactly as before. The docsite's shadcn install of an example, block, or page is a copy too: it now replaces demo content and demo media the same way. Each replacement is a marked placeholder in the installed source: `<Text>Card content</Text>` for demo content, a placeholder image for an image, and a `data:,placeholder-video-add-your-own` source for a video. The item's description says how many references and elements were replaced. The adjacent `.astryx/<item>.json` receipt keeps its current shape, so every released `astryx upgrade` still reads it.

@cixzhang
