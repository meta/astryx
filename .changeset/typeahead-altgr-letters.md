---
'@astryxdesign/core': patch
---

[fix] Type-to-select: a letter typed with AltGr on Windows, such as ł on a Polish keyboard, now selects a matching item, so typing ł in a Selector reaches "Łódź" (`architecture:internationalization` INV17). AltGr reports Control as well, and type-to-select treated it as a Control shortcut and dropped the letter. This covers `useTypeahead` and every collection that uses it (Selector, MultiSelector, DropdownMenu, ContextMenu), a searchable Selector's typed-to-open query, and TreeList. Control and Command shortcuts such as Control+L still do not type-select.

Reported by Rajatendu1.

@cixzhang
