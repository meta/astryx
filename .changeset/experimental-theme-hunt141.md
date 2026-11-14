---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: the editor knows its pages and pictures by their exact names (and its pictures record), so a file or link of yours named like one (`sheet-mockup.png`, `preview-v.html`) no longer blocks a change; `preview app --theme` copies such a file, and leaves a link out and names it (it never reads through a link). A link at a picture's exact name, to a file or to nothing, is never written through or replaced: only that picture is skipped and named, and the others are taken. `preview add` at a workspace root names the app to run it from, as the other commands do. A `--section` refusal keeps `--png`; an option written last with no value offers the command without it (never a usage line), except where leaving it out would widen a removal; an empty `--template` offers `preview add` itself; a template typo offers only a page that can be added now. `preview app --theme` names an open font it cannot install, with the package that would load it. The sheet says when a template page's charts are drawn in the browser (recharts), so its pictures show their space empty.

@josephfarina
