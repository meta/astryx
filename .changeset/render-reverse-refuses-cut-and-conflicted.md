---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render --reverse` refuses two kinds of damaged Astryx page with `ERR_RENDER_SOURCE_DAMAGED` and writes nothing, instead of answering with a page that looks fine. A rendered file cut short before its embedded source used to come back rebuilt from the part of the markup that was left; it is now refused as cut short. An Astryx page a merge left with conflict markers used to give back one side's source without a word; it is now refused, naming the conflict, so you keep the whole file from one side or render the merged page again. A file that is not an Astryx page is still refused with `ERR_RENDER_NOT_ASTRYX`, markers or not.

@josephfarina
