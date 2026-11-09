---
'@astryxdesign/core': patch
---

[feat] Typeahead: `isLoading` and `changeAction` join the input family's busy and Transition Action contracts

Typeahead could show a search in flight but had no way to say its value was busy. `isLoading` marks the field value as resolving or being saved: the end-lane Spinner shows and the combobox carries `aria-busy`, while the search source and its results stay untouched. `changeAction` runs after `onChange` with the same proposed item, in a React transition, on both value paths (selection and the clear button). The proposed item shows as the token until `value` accepts or replaces it, and a controlled value that arrives while the Action is pending wins at once. The clear button follows the accepted `value`. A search in flight and a busy value share one Spinner and one `aria-busy`.

Callers that pass neither prop see one change: when the selected token and the input swap places, focus moves to the one that stays. A focused token that goes away, for example because the parent clears the value, hands focus to the input instead of dropping it to the page, and that focus opens no suggestions on a `hasEntriesOnFocus` field. A token that appears while the input has focus, for example because the parent sets the value while the person types, takes focus, because the input behind it leaves the Tab order. With `changeAction`, the same rule covers an Action that is not accepted.

@AKnassa
