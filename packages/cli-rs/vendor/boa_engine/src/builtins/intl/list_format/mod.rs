use std::fmt::Write;

use boa_gc::{Finalize, Trace};
use icu_list::{
    ListFormatter, ListFormatterPreferences,
    options::{ListFormatterOptions, ListLength},
    provider::{ListAndV1, ListFormatterPatterns},
};
use icu_locale::Locale;

use crate::{
    Context, JsArgs, JsData, JsExpect, JsNativeError, JsResult, JsString, JsValue,
    builtins::{
        Array, BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject, OrdinaryObject,
        intl::options::EmptyPreferences,
        iterable::IteratorHint,
        options::{get_option, get_options_object},
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
    symbol::JsSymbol,
};

use super::{
    Service,
    locale::{canonicalize_locale_list, filter_locales, resolve_locale},
    options::IntlOptions,
};

mod options;
pub(crate) use options::*;

#[derive(Debug, Trace, Finalize, JsData)]
// Safety: `ListFormat` only contains non-traceable types.
#[boa_gc(unsafe_empty_trace)]
pub(crate) struct ListFormat {
    locale: Locale,
    typ: ListFormatType,
    style: ListLength,
    native: ListFormatter,
}

impl Service for ListFormat {
    type LangMarker = ListAndV1;

    const ATTRIBUTES: &'static icu_provider::DataMarkerAttributes = ListFormatterPatterns::WIDE;

    type Preferences = EmptyPreferences;
}

impl IntrinsicObject for ListFormat {
    fn init(realm: &Realm) {
        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_method(
                Self::supported_locales_of,
                js_string!("supportedLocalesOf"),
                1,
            )
            .property(
                JsSymbol::to_string_tag(),
                js_string!("Intl.ListFormat"),
                Attribute::CONFIGURABLE,
            )
            .method(Self::format, js_string!("format"), 1)
            .method(Self::format_to_parts, js_string!("formatToParts"), 1)
            .method(Self::resolved_options, js_string!("resolvedOptions"), 0)
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for ListFormat {
    const NAME: JsString = StaticJsStrings::LIST_FORMAT;
}

impl BuiltInConstructor for ListFormat {
    const CONSTRUCTOR_ARGUMENTS: usize = 0;
    const PROTOTYPE_STORAGE_SLOTS: usize = 4;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 1;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::list_format;

    /// Constructor [`Intl.ListFormat ( [ locales [ , options ] ] )`][spec].
    ///
    /// Constructor for `ListFormat` objects.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.ListFormat
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("cannot call `Intl.ListFormat` constructor without `new`")
                .into());
        }

        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 3. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 4. Set options to ? GetOptionsObject(options).
        let options = get_options_object(options)?;

        // 5. Let opt be a new Record.
        // 6. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
        let matcher =
            get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

        // 7. Set opt.[[localeMatcher]] to matcher.
        // 8. Let localeData be %ListFormat%.[[LocaleData]].
        // 9. Let r be ResolveLocale(%ListFormat%.[[AvailableLocales]], requestedLocales, opt, %ListFormat%.[[RelevantExtensionKeys]], localeData).
        // 10. Set listFormat.[[Locale]] to r.[[locale]].
        let locale = resolve_locale::<Self>(
            requested_locales,
            &mut IntlOptions {
                matcher,
                ..Default::default()
            },
            context.intl_provider(),
        )?;

        // 11. Let type be ? GetOption(options, "type", string, « "conjunction", "disjunction", "unit" », "conjunction").
        // 12. Set listFormat.[[Type]] to type.
        let typ = get_option(&options, js_string!("type"), context)?.unwrap_or_default();

        // 13. Let style be ? GetOption(options, "style", string, « "long", "short", "narrow" », "long").
        // 14. Set listFormat.[[Style]] to style.
        let style = get_option(&options, js_string!("style"), context)?.unwrap_or(ListLength::Wide);

        // 15. Let dataLocale be r.[[dataLocale]].
        // 16. Let dataLocaleData be localeData.[[<dataLocale>]].
        // 17. Let dataLocaleTypes be dataLocaleData.[[<type>]].
        // 18. Set listFormat.[[Templates]] to dataLocaleTypes.[[<style>]].
        let prefs = ListFormatterPreferences::from(&locale);
        let options = ListFormatterOptions::default().with_length(style);
        let formatter = match typ {
            ListFormatType::Conjunction => ListFormatter::try_new_and_with_buffer_provider(
                context.intl_provider().erased_provider(),
                prefs,
                options,
            ),
            ListFormatType::Disjunction => ListFormatter::try_new_or_with_buffer_provider(
                context.intl_provider().erased_provider(),
                prefs,
                options,
            ),
            ListFormatType::Unit => ListFormatter::try_new_unit_with_buffer_provider(
                context.intl_provider().erased_provider(),
                prefs,
                options,
            ),
        }
        .map_err(|e| JsNativeError::typ().with_message(e.to_string()))?;

        // 2. Let listFormat be ? OrdinaryCreateFromConstructor(NewTarget, "%ListFormat.prototype%", « [[InitializedListFormat]], [[Locale]], [[Type]], [[Style]], [[Templates]] »).
        let prototype =
            get_prototype_from_constructor(new_target, StandardConstructors::list_format, context)?;
        let list_format = JsObject::from_proto_and_data_with_shared_shape(
            context.root_shape(),
            prototype,
            Self {
                locale,
                typ,
                style,
                native: formatter,
            },
        );

        // 19. Return listFormat.
        Ok(list_format.into())
    }
}

impl ListFormat {
    /// [`Intl.ListFormat.supportedLocalesOf ( locales [ , options ] )`][spec].
    ///
    /// Returns an array containing those of the provided locales that are supported in list
    /// formatting without having to fall back to the runtime's default locale.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.ListFormat.supportedLocalesOf
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/supportedLocalesOf
    fn supported_locales_of(
        _: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        let locales = args.get_or_undefined(0);
        let options = args.get_or_undefined(1);

        // 1. Let availableLocales be %ListFormat%.[[AvailableLocales]].
        // 2. Let requestedLocales be ? CanonicalizeLocaleList(locales).
        let requested_locales = canonicalize_locale_list(locales, context)?;

        // 3. Return ? FilterLocales(availableLocales, requestedLocales, options).
        filter_locales::<Self>(requested_locales, options, context).map(JsValue::from)
    }

    /// [`Intl.ListFormat.prototype.format ( list )`][spec].
    ///
    /// Returns a language-specific formatted string representing the elements of the list.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.ListFormat.prototype.format
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/format
    fn format(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let lf be the this value.
        // 2. Perform ? RequireInternalSlot(lf, [[InitializedListFormat]]).
        let object = this.as_object();
        let lf = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`format` can only be called on a `ListFormat` object")
            })?;

        // 3. Let stringList be ? StringListFromIterable(list).
        // TODO: support for UTF-16 unpaired surrogates formatting
        let strings = string_list_from_iterable(args.get_or_undefined(0), context)?;

        let formatted = lf
            .native
            .format_to_string(strings.into_iter().map(|s| s.to_std_string_escaped()));

        // 4. Return ! FormatList(lf, stringList).
        Ok(js_string!(formatted).into())
    }

    /// [`Intl.ListFormat.prototype.formatToParts ( list )`][spec].
    ///
    /// Returns a language-specific formatted string representing the elements of the list.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.ListFormat.prototype.formatToParts
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/formatToParts
    fn format_to_parts(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // TODO: maybe try to move this into icu4x?
        use writeable::{PartsWrite, Writeable};

        #[derive(Debug, Clone)]
        enum Part {
            Literal(String),
            Element(String),
        }

        impl Part {
            const fn typ(&self) -> &'static str {
                match self {
                    Self::Literal(_) => "literal",
                    Self::Element(_) => "element",
                }
            }

            #[allow(clippy::missing_const_for_fn)]
            fn value(self) -> String {
                match self {
                    Self::Literal(s) | Self::Element(s) => s,
                }
            }
        }

        #[derive(Debug, Clone)]
        struct WriteString(String);

        impl Write for WriteString {
            fn write_str(&mut self, s: &str) -> std::fmt::Result {
                self.0.write_str(s)
            }

            fn write_char(&mut self, c: char) -> std::fmt::Result {
                self.0.write_char(c)
            }
        }

        impl PartsWrite for WriteString {
            type SubPartsWrite = Self;

            fn with_part(
                &mut self,
                _part: writeable::Part,
                mut f: impl FnMut(&mut Self::SubPartsWrite) -> std::fmt::Result,
            ) -> std::fmt::Result {
                f(self)
            }
        }

        #[derive(Debug, Clone)]
        struct PartsCollector(Vec<Part>);

        impl Write for PartsCollector {
            fn write_str(&mut self, _: &str) -> std::fmt::Result {
                Ok(())
            }
        }

        impl PartsWrite for PartsCollector {
            type SubPartsWrite = WriteString;

            fn with_part(
                &mut self,
                part: writeable::Part,
                mut f: impl FnMut(&mut Self::SubPartsWrite) -> core::fmt::Result,
            ) -> core::fmt::Result {
                assert_eq!(part.category, "list");
                let mut string = WriteString(String::new());
                f(&mut string)?;
                if !string.0.is_empty() {
                    match part.value {
                        "element" => self.0.push(Part::Element(string.0)),
                        "literal" => self.0.push(Part::Literal(string.0)),
                        _ => unreachable!(),
                    }
                }
                Ok(())
            }
        }

        // 1. Let lf be the this value.
        // 2. Perform ? RequireInternalSlot(lf, [[InitializedListFormat]]).
        let object = this.as_object();
        let lf = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`formatToParts` can only be called on a `ListFormat` object")
            })?;

        // 3. Let stringList be ? StringListFromIterable(list).
        // TODO: support for UTF-16 unpaired surrogates formatting
        let strings = string_list_from_iterable(args.get_or_undefined(0), context)?
            .into_iter()
            .map(|s| s.to_std_string_escaped());

        // 4. Return ! FormatListToParts(lf, stringList).

        // Abstract operation `FormatListToParts ( listFormat, list )`
        // https://tc39.es/ecma402/#sec-formatlisttoparts

        // 1. Let parts be ! CreatePartsFromList(listFormat, list).
        let mut parts = PartsCollector(Vec::new());
        lf.native
            .format(strings)
            .write_to_parts(&mut parts)
            .map_err(|e| JsNativeError::typ().with_message(e.to_string()))?;

        // 2. Let result be ! ArrayCreate(0).
        let result = Array::array_create(0, None, context)
            .js_expect("creating an empty array with default proto must not fail")?;

        // 3. Let n be 0.
        // 4. For each Record { [[Type]], [[Value]] } part in parts, do
        for (n, part) in parts.0.into_iter().enumerate() {
            // a. Let O be OrdinaryObjectCreate(%Object.prototype%).
            let o = context
                .intrinsics()
                .templates()
                .ordinary_object()
                .create(OrdinaryObject, vec![]);

            // b. Perform ! CreateDataPropertyOrThrow(O, "type", part.[[Type]]).
            o.create_data_property_or_throw(js_string!("type"), js_string!(part.typ()), context)
                .js_expect("operation must not fail per the spec")?;

            // c. Perform ! CreateDataPropertyOrThrow(O, "value", part.[[Value]]).
            o.create_data_property_or_throw(js_string!("value"), js_string!(part.value()), context)
                .js_expect("operation must not fail per the spec")?;

            // d. Perform ! CreateDataPropertyOrThrow(result, ! ToString(n), O).
            result
                .create_data_property_or_throw(n, o, context)
                .js_expect("operation must not fail per the spec")?;

            // e. Increment n by 1.
        }

        // 5. Return result.
        Ok(result.into())
    }

    /// [`Intl.ListFormat.prototype.resolvedOptions ( )`][spec].
    ///
    /// Returns a new object with properties reflecting the locale and style formatting options
    /// computed during the construction of the current `Intl.ListFormat` object.
    ///
    /// More information:
    ///  - [MDN documentation][mdn]
    ///
    /// [spec]: https://tc39.es/ecma402/#sec-Intl.ListFormat.prototype.resolvedoptions
    /// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/resolvedOptions
    fn resolved_options(this: &JsValue, _: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let lf be the this value.
        // 2. Perform ? RequireInternalSlot(lf, [[InitializedListFormat]]).
        let object = this.as_object();
        let lf = object
            .as_ref()
            .and_then(|o| o.downcast_ref::<Self>())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("`resolvedOptions` can only be called on a `ListFormat` object")
            })?;

        // 3. Let options be OrdinaryObjectCreate(%Object.prototype%).
        let options = context
            .intrinsics()
            .templates()
            .ordinary_object()
            .create(OrdinaryObject, vec![]);

        // 4. For each row of Table 11, except the header row, in table order, do
        //     a. Let p be the Property value of the current row.
        //     b. Let v be the value of lf's internal slot whose name is the Internal Slot value of the current row.
        //     c. Assert: v is not undefined.
        //     d. Perform ! CreateDataPropertyOrThrow(options, p, v).
        options
            .create_data_property_or_throw(
                js_string!("locale"),
                js_string!(lf.locale.to_string()),
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("type"),
                match lf.typ {
                    ListFormatType::Conjunction => js_string!("conjunction"),
                    ListFormatType::Disjunction => js_string!("disjunction"),
                    ListFormatType::Unit => js_string!("unit"),
                },
                context,
            )
            .js_expect("operation must not fail per the spec")?;
        options
            .create_data_property_or_throw(
                js_string!("style"),
                match lf.style {
                    ListLength::Wide => js_string!("long"),
                    ListLength::Short => js_string!("short"),
                    ListLength::Narrow => js_string!("narrow"),
                    _ => unreachable!(),
                },
                context,
            )
            .js_expect("operation must not fail per the spec")?;

        // 5. Return options.
        Ok(options.into())
    }
}

/// Abstract operation [`StringListFromIterable ( iterable )`][spec]
///
/// [spec]: https://tc39.es/ecma402/#sec-createstringlistfromiterable
fn string_list_from_iterable(iterable: &JsValue, context: &mut Context) -> JsResult<Vec<JsString>> {
    // 1. If iterable is undefined, then
    if iterable.is_undefined() {
        //     a. Return a new empty List.
        return Ok(Vec::new());
    }

    // 2. Let iteratorRecord be ? GetIterator(iterable, sync).
    let mut iterator = iterable.get_iterator(IteratorHint::Sync, context)?;

    // 3. Let list be a new empty List.
    let mut list = Vec::new();

    // 4. Let next be true.
    // 5. Repeat, while next is not false,
    //     a. Let next be ? IteratorStepValue(iteratorRecord).
    while let Some(next) = iterator.step_value(context)? {
        // c. If next is not a String, then
        let Some(s) = next.as_string() else {
            // i. Let error be ThrowCompletion(a newly created TypeError object).
            // ii. Return ? IteratorClose(iteratorRecord, error).
            return Err(iterator
                .close(
                    Err(JsNativeError::typ()
                        .with_message("StringListFromIterable: can only format strings into a list")
                        .into()),
                    context,
                )
                .expect_err("`close` should return the provided error"));
        };

        // d. Append next to list.
        list.push(s);
    }

    //     b. If next is done, then
    //         i. Return list.
    Ok(list)
}
