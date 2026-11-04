---
'@astryxdesign/core': patch
---

[fix] Tokenizer's bottom-sheet presentation (`presentation="bottom-sheet"`, and the default `adaptive` on compact touch screens): a confirmed Clear all keeps focus on the Clear all action, now disabled with its reason, instead of moving it to the search field, which raised the on-screen keyboard over the rows the person had just cleared. The inline presentation is unchanged.

@imdreamrunner
