---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` no longer sets the page root's color scheme. A built theme stylesheet used to declare `:root { color-scheme: light dark; }`, so a site that loads it without `reset.css`, and sets no scheme of its own, followed the reader's device: for a dark-mode reader its native controls, links and page canvas turned dark around its own light content. A theme now follows the page's scheme; it still pins it where the page or the Theme provider forces a mode (`html[data-theme="light"|"dark"]`), and a `--family` build drops the same rule from each theme's scope. Apps whose page scheme comes only from `reset.css` see no change, while an app that sets its own `color-scheme` on `html` (in its own CSS layer, as the Tailwind setup does) now keeps it. To follow the device with theme CSS alone, add reset.css or `html { color-scheme: light dark }`.

@josephfarina
