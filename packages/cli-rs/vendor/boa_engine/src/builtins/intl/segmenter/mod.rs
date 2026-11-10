use std::ops::Range;

use crate::{
    Context, JsArgs, JsData, JsNativeError, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        intl::options::EmptyPreferences,
        options::{get_option, get_options_object},
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{JsObject, ObjectInitializer, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};
use boa_gc::{Finalize, Trace};
use boa_string::JsStrVariant;
use icu_collator::provider::CollationDiacriticsV1;
use icu_locale::Locale;
use icu_segmenter::{
    GraphemeClusterSegmenter, SentenceSegmenter, WordSegmenter,
    options::{SentenceBreakOptions, WordBreakOptions},
};

mod iterator;
mod options;
mod segments;
pub(crate) use iterator::*;
pub(crate) use options::*;
pub(crate) use segments::*;

use super::{
    Service,
    locale::{canonicalize_locale_list, filter_locales, resolve_locale},
    options::IntlOptions,
};

#[derive(Debug, Trace, Finalize, JsData)]
// SAFETY: `Segmenter` doesn't contain any traceable data.
#[boa_gc(unsafe_empty_trace)]
pub(crate) struct Segmenter {
    locale: Locale,
    native: NativeSegmenter,
}

#[derive(Debug)]
pub(crate) enum NativeSegmenter {
    Grapheme(Box<GraphemeClusterSegmenter>),
    Word(Box<WordSegmenter>),
    Sentence(Box<SentenceSegmenter>),
}

impl NativeSegmenter {
    /// Gets the granularity level of this `NativeSegmenter`.
    pub(crate) const fn granularity(&self) -> Granularity {
        match self {
            Self::Grapheme(_) => Granularity::Grapheme,
            Self::Word(_) => Granularity::Word,
            Self::Sentence(_) => Granularity::Sentence,
        }
    }

    /// Segment the passed string, returning an iterator with the index boundaries
    /// of the segments.
    pub(crate) fn segment<'l, 's>(
        &'l self,
        input: JsStrVariant<'s>,
    ) -> NativeSegmentIterator<'l, 's> {
        match input {
            JsStrVariant::Latin1(input) => match self {
                Self::Grapheme(g) => {
                    NativeSegmentIterator::GraphemeLatin1(g.as_borrowed().segment_latin1(input))
                }
                Self::Word(w) => {
                    NativeSegmentIterator::WordLatin1(w.as_borrowed().segment_latin1(input))
                }
                Self::Sentence(s) => {
                    NativeSegmentIterator::SentenceLatin1(s.as_borrowed().segment_latin1(input))
                }
            },
            JsStrVariant::Utf16(input) => match self {
                Self::Grapheme(g) => {
                    NativeSegmentIterator::GraphemeUtf16(g.as_borrowed().segment_utf16(input))
                }
                Self::Word(w) => {
                    NativeSegmentIterator::WordUtf16(w.as_borrowed().segment_utf16(input))
                }
                Self::Sentence(s) => {
                    NativeSegmentIterator::SentenceUtf16(s.as_borrowed().segment_utf16(input))
                }
            },
        }
    }
}

impl Service for Segmenter {
    // TODO: Track https://github.com/unicode-org/icu4x/issues/3284
    // and replace when segmenters are locale-aware.
    type LangMarker = CollationDiacriticsV1;

    type Preferences = EmptyPreferences;
}

impl IntrinsicObject for Segmenter {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.Segmenter"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .method(Self::segment, js_string!("segment"), 1)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for Segmenter {
    const NAME: JsString = StaticJsStrings::SEGMENTER;
}

impl BuiltInConstructor for Segmenter {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 3;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::segmenter;

    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("cannot call `Intl.Collator` constructor without `new`")
                .into());
        }
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 4. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 5. Set options to ? GetOptionsObject(options).
        let options = get_options_object(options)?;

        // 6. Let opt be a new Record.
        // 7. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
        let matcher =
            get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

        // 8. Set opt.[[localeMatcher]] to matcher.
        // 9. Let localeData be %Segmenter%.[[LocaleData]].
        // 10. Let r be ResolveLocale(%Segmenter%.[[AvailableLocales]], requestedLocales, opt, %Segmenter%.[[RelevantExtensionKeys]], localeData).
        // 11. Set segmenter.[[Locale]] to r.[[locale]].
        let locale = resolve_locale::<Self>(
            requested_locales,
            &mut IntlOptions {
                matcher,
                ..Default::default()
            },
            context.intl_provider(),
        )?;

        // 12. Let granularity be ? GetOption(options, "granularity", string, « "grapheme", "word", "sentence" », "grapheme").
        let granularity =
            get_option(&options, js_string!("granularity"), context)?.unwrap_or_default();

        // 13. Set segmenter.[[SegmenterGranularity]] to granularity.
        let native = match granularity {
            Granularity::Grapheme => GraphemeClusterSegmenter::try_new_with_buffer_provider(
                &context.intl_provider().erased_provider(),
            )
            .map(|s| NativeSegmenter::Grapheme(Box::new(s))),
            Granularity::Word => WordSegmenter::try_new_auto_with_buffer_provider(
                &context.intl_provider().erased_provider(),
                {
                    let mut options = WordBreakOptions::default();
                    options.content_locale = Some(&locale.id);
                    options
                },
            )
            .map(|s| NativeSegmenter::Word(Box::new(s))),
            Granularity::Sentence => SentenceSegmenter::try_new_with_buffer_provider(
                &context.intl_provider().erased_provider(),
                {
                    let mut options = SentenceBreakOptions::default();
                    options.content_locale = Some(&locale.id);
                    options
                },
            )
            .map(|s| NativeSegmenter::Sentence(Box::new(s))),
        }
        .map_err(|err| JsNativeError::typ().with_message(err.to_string()))?;

        let segmenter = Self { locale, native };

        // 2. Let internalSlotsList be « [[InitializedSegmenter]], [[Locale]], [[SegmenterGranularity]] ».
        // 3. Let segmenter be ? OrdinaryCreateFromConstructor(NewTarget, "%Segmenter.prototype%", internalSlotsList).

        let proto =
            get_prototype_from_constructor(new_target, StandardConstructors::segmenter, context)?;

        let segmenter =
            JsObject::from_proto_and_data_with_shared_shape(context.root_shape(), proto, segmenter);

        // 14. Return segmenter.
        Ok(segmenter.into())
    }
}

impl Segmenter {
    /// [`Intl.Segmenter.supportedLocalesOf ( locales [ , options ] )`][spec].
    ///
    /// Returns an array containing those of the provided locales that are supported in segmenting
    /// without having to fall back to the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.segmenter.supportedlocalesof
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %Segmenter%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`Intl.Segmenter.prototype.resolvedOptions ( )`][spec].
    ///
    /// Returns a new object with properties reflecting the locale and style formatting options
    /// computed during the construction of the current `Intl.Segmenter` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.Segmenter.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let segmenter be the this value.
        // 2. Perform ? RequireInternalSlot(segmenter, [[InitializedSegmenter]]).
        let object = this.as_object();
        let segmenter = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ().with_message(
                    "`resolved_options` can only be called on an `Intl.Segmenter` object",
                )
            })?;

        // 3. Let options be OrdinaryObjectCreate(%Object.prototype%).
        // 4. For each row of Table 19, except the header row, in table order, do
        //     a. Let p be the Property value of the current row.
        //     b. Let v be the value of segmenter's internal slot whose name is the Internal Slot value of the current row.
        //     c. Assert: v is not undefined.
        //     d. Perform ! CreateDataPropertyOrThrow(options, p, v).
        let options = ObjectInitializer::new(context)
            .property(
                js_string!("locale"),
                js_string!(segmenter.locale.to_string()),
                Attribute::all(),
            )
            .property(
                js_string!("granularity"),
                js_string!(segmenter.native.granularity().to_string()),
                Attribute::all(),
            )
            .build();

        // 5. Return options.
        Ok(options.into())
    }

    /// [`Intl.Segmenter.prototype.segment ( string )`][spec].
    ///
    /// Segments a string according to the locale and granularity of this `Intl.Segmenter` object.
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-intl.segmenter.prototype.segment
    fn segment(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let segmenter be the this value.
        // 2. Perform ? RequireInternalSlot(segmenter, [[InitializedSegmenter]]).
        let segmenter = this.as_object().filter(|o| o.is::<Self>()).ok_or_else(|| {
            JsNativeError::typ()
                .with_message("`resolved_options` can only be called on an `Intl.Segmenter` object")
        })?;

        // 3. Let string be ? ToString(string).
        let string = args.get_or_undefined(0).to_string(context)?;

        // 4. Return ! CreateSegmentsObject(segmenter, string).
        Ok(Segments::create(segmenter.clone(), string, context).into())
    }
}

/// [`CreateSegmentDataObject ( segmenter, string, startIndex, endIndex )`][spec].
///
/// [spec]: https://tc39.es/ecma402/#sec-createsegmentdataobject
fn create_segment_data_object(
    string: JsString,
    range: Range<usize>,
    is_word_like: Option<bool>,
    context: &mut Context,
) -> JsObject {
    // 1. Let len be the length of string.
    // 2. Assert: startIndex ≥ 0.
    // ensured by `usize`.
    // 3. Assert: endIndex ≤ len.
    assert!(range.end <= string.len());
    // 4. Assert: startIndex < endIndex.
    assert!(range.start < range.end);

    let start = range.start;

    // 6. Let segment be the substring of string from startIndex to endIndex.
    let segment = string.get(range).expect("range already checked");

    // 5. Let result be OrdinaryObjectCreate(%Object.prototype%).
    let object = &mut ObjectInitializer::new(context);

    object
        // 7. Perform ! CreateDataPropertyOrThrow(result, "segment", segment).
        .property(js_string!("segment"), segment, Attribute::all())
        // 8. Perform ! CreateDataPropertyOrThrow(result, "index", 𝔽(startIndex)).
        .property(js_string!("index"), start, Attribute::all())
        // 9. Perform ! CreateDataPropertyOrThrow(result, "input", string).
        .property(js_string!("input"), string, Attribute::all());

    // 10. Let granularity be segmenter.[[SegmenterGranularity]].
    // 11. If granularity is "word", then
    if let Some(is_word_like) = is_word_like {
        //     a. Let isWordLike be a Boolean value indicating whether the segment in string is "word-like" according to locale segmenter.[[Locale]].
        //     b. Perform ! CreateDataPropertyOrThrow(result, "isWordLike", isWordLike).
        object.property(js_string!("isWordLike"), is_word_like, Attribute::all());
    }

    // 12. Return result.
    object.build()
}
