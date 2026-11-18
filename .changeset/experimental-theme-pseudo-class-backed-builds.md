---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- A pseudo-class after a pseudo-element that takes one is accepted: any after `::file-selector-button` and `::details-content`, `:window-inactive` after a highlight such as `::selection`, `:target-current` after `::scroll-marker`. One that does not take it is refused with what it takes.
- Only `:hover` and `:active` written in capitals are refused, the two names Core reads; `::BEFORE` or `:FOCUS` build as written.
- A part property that builds dash-first without a vendor prefix (`Color`, `BACKGROUND`, `-webkit-`) is refused, with the name in lower case.
- A tokens map spread from a defined theme's tokens no longer trips over Core's own private copies in it; another private variable it carries is named as coming with the spread, with the way out.
- A value read from another file is blamed on that file through an array element (`cs[1]`), a template (`` `${c}` ``), a choice (`B.x ? B.x : '#fff'`), a call of a global or a function of the theme file's own (`String(B.x)`), and `await import()`.

@josephfarina
