---
'@astryxdesign/cli': patch
---

[fix] A run that prints its answer and then exits 1 records the code that answer carries in its debug event, as an error that `cliError` prints does. A component batch with a selector that does not resolve records the first unresolved row's code (such as `ERR_UNKNOWN_COMPONENT`); `theme build --check` that finds stale outputs records `ERR_THEME_STALE`; `upgrade` records the code of an error it reports in text mode, and the `errorCode` of a run that stops incomplete (such as `ERR_CODEMOD_PROTECTED`), in text and in `--json`; `init` that refuses its agent-docs path records `ERR_PATH_TRAVERSAL`. Each code is recorded once the answer is printed, so an error that stops the answer first (a recorded theme that does not load) keeps its own code. A `debug` handler saw these runs as `ERR_UNCLASSIFIED_EXIT`. Output and exit codes are unchanged.

@josephfarina
