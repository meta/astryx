---
'@astryxdesign/core': patch
---

[fix] Five components stop assembling built-in text with English punctuation or number formats. ProgressBar's default value text writes the percentage as the provider locale does ("%45" in Turkish, "45 %" in German). Thumbnail's joined name ("{label} — {alt}"), DateRangeInput's trigger name ("{label}: {value}") and selected range ("{start} – {end}"), a range Slider's text value ("{start} – {end}") and MultiSelector's overflow count ("+{count, number}") each come from one catalog message, so a locale can reorder or re-punctuate them, and MultiSelector joins the shown labels, and the count as the last item, with the locale's list format. English output is unchanged, except that a MultiSelector overflow count of 1,000 or more groups its digits.

@nynexman4464
