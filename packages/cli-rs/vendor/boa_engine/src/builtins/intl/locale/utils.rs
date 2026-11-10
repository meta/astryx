use crate::{
    Context, JsNativeError, JsResult, JsValue,
    builtins::{
        Array,
        intl::{
            Service, ServicePreferences,
            options::{IntlOptions, LocaleMatcher, coerce_options_to_object},
        },
        options::get_option,
    },
    context::icu::IntlProvider,
    js_string,
    object::JsObject,
};

use icu_locale::extensions::unicode::value;
use icu_locale::{LanguageIdentifier, Locale, LocaleCanonicalizer};
use icu_provider::{
    DataIdentifierBorrowed, DataLocale, DataMarker, DataMarkerAttributes, DataRequest,
    DataRequestMetadata, DryDataProvider,
};
use indexmap::IndexSet;

use tap::TapOptional;

/// Abstract operation `DefaultLocale ( )`
///
/// Returns a String value representing the structurally valid and canonicalized
/// Unicode BCP 47 locale identifier for the host environment's current locale.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma402/#sec-defaultlocale
pub(crate) fn default_locale(canonicalizer: &LocaleCanonicalizer) -> Locale {
    sys_locale::get_locale()
        .and_then(|loc| loc.parse::<Locale>().ok())
        .tap_some_mut(|loc| {
            canonicalizer.canonicalize(loc);
        })
        .unwrap_or(Locale::UNKNOWN)
}

/// Gets the `Locale` struct from a `JsValue`.
pub(crate) fn locale_from_value(tag: &JsValue, context: &mut Context) -> JsResult<Locale> {
    // ii. If Type(kValue) is not String or Object, throw a TypeError exception.
    if !(tag.is_object() || tag.is_string()) {
        return Err(JsNativeError::typ()
            .with_message("locale should be a String or Object")
            .into());
    }
    // iii. If Type(kValue) is Object and kValue has an [[InitializedLocale]] internal slot, then
    let object = tag.as_object();
    if let Some(tag) = object.as_ref().and_then(|obj| obj.downcast_ref::<Locale>()) {
        // 1. Let tag be kValue.[[Locale]].
        // No need to canonicalize since all `Locale` objects should already be canonicalized.
        return Ok(tag.clone());
    }

    // iv. Else,
    // 1. Let tag be ? ToString(kValue).
    let tag = tag.to_string(context)?.to_std_string_escaped();
    if tag.contains('_') {
        return Err(JsNativeError::range()
            .with_message("locale is not a structurally valid language tag")
            .into());
    }

    let mut tag = tag
        .parse()
        // v. If IsStructurallyValidLanguageTag(tag) is false, throw a RangeError exception.
        .map_err(|_| {
            JsNativeError::range().with_message("locale is not a structurally valid language tag")
        })?;

    // All callers of `locale_from_value` canonicalize the result immediately after, so
    // we canonicalize here instead.
    context
        .intl_provider()
        .locale_canonicalizer()?
        .canonicalize(&mut tag);

    // TODO: Remove this workaround once ICU4X supports canonicalization of
    // Unicode extension value aliases (unicode-org/icu4x#3483).
    // Currently ICU4X does not canonicalize "yes" → "true" for certain keys.
    let keys: Vec<_> = tag
        .extensions
        .unicode
        .keywords
        .iter()
        .map(|(k, _)| *k)
        .collect();

    for k in keys {
        match k.as_str() {
            "kb" | "kc" | "kh" | "kk" | "kn" => {
                if let Some(v) = tag.extensions.unicode.keywords.get_mut(&k)
                    && *v == value!("yes")
                {
                    *v = value!("true");
                }
            }
            _ => {}
        }
    }
    Ok(tag)
}

/// Abstract operation `CanonicalizeLocaleList ( locales )`
///
/// Converts an array of [`JsValue`]s containing structurally valid
/// [Unicode BCP 47 locale identifiers][bcp-47] into their [canonical form][canon].
///
/// For efficiency, this returns [`Locale`]s instead of [`String`]s, since
/// `Locale` allows us to modify individual parts of the locale without scanning
/// the whole string again.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma402/#sec-canonicalizelocalelist
/// [bcp-47]: https://unicode.org/reports/tr35/#Unicode_locale_identifier
/// [canon]: https://unicode.org/reports/tr35/#LocaleId_Canonicalization
pub(crate) fn canonicalize_locale_list(
    locales: &JsValue,
    context: &mut Context,
) -> JsResult<Vec<Locale>> {
    // 1. If locales is undefined, then
    if locales.is_undefined() {
        // a. Return a new empty List.
        return Ok(Vec::default());
    }

    // 2. Let seen be a new empty List.
    let mut seen = IndexSet::new();

    // 3. If Type(locales) is String or Type(locales) is Object and locales has an [[InitializedLocale]] internal slot, then
    let o = if locales.is_string() || locales.as_object().is_some_and(|o| o.is::<Locale>()) {
        // a. Let O be CreateArrayFromList(« locales »).
        Array::create_array_from_list([locales.clone()], context)
    } else {
        // 4. Else,
        // a. Let O be ? ToObject(locales).
        locales.to_object(context)?
    };

    // 5. Let len be ? ToLength(? Get(O, "length")).
    let len = o.length_of_array_like(context)?;

    // 6 Let k be 0.
    // 7. Repeat, while k < len,
    for k in 0..len {
        // a. Let Pk be ToString(k).
        // b. Let kPresent be ? HasProperty(O, Pk).
        // c. If kPresent is true, then
        // c.i. Let kValue be ? Get(O, Pk).
        if let Some(k_value) = o.try_get(k, context)? {
            let tag = locale_from_value(&k_value, context)?;

            // vii. If canonicalizedTag is not an element of seen, append canonicalizedTag as the last element of seen.
            seen.insert(tag);
        }
        // d. Increase k by 1.
    }

    // 8. Return seen.
    Ok(seen.into_iter().collect())
}

/// Abstract operation [`LookupMatchingLocaleByPrefix ( availableLocales, requestedLocales )`][prefix]
/// and [`LookupMatchingLocaleByBestFit ( availableLocales, requestedLocales )`][best]
///
/// Compares `requestedLocales`, which must be a `List` as returned by `CanonicalizeLocaleList`,
/// against the locales in `availableLocales` and determines the best available language to
/// meet the request.
///
/// # Notes
///
/// - This differs a bit from the spec, since we don't have an `[[AvailableLocales]]`
///   list to compare with. However, we can do data requests to a [`DryDataProvider`]
///   in order to see if a certain [`Locale`] is supported.
///
/// - Calling this function with a singleton [`DataMarker`] will always return `None`.
///
/// [prefix]: https://tc39.es/ecma402/#sec-lookupmatchinglocalebyprefix
/// [best]: https://tc39.es/ecma402/#sec-lookupmatchinglocalebybestfit
fn lookup_matching_locale_by_prefix<S: Service>(
    requested_locales: impl IntoIterator<Item = Locale>,
    provider: &IntlProvider,
) -> Option<Locale>
where
    IntlProvider: DryDataProvider<S::LangMarker>,
{
    // 1. For each element locale of requestedLocales, do
    for locale in requested_locales {
        // a. Let extension be empty.
        // b. If locale contains a Unicode locale extension sequence, then
        //     i. Set extension to the Unicode locale extension sequence of locale.
        //     ii. Set locale to the String value that is locale with any Unicode locale extension sequences removed.
        let mut locale = locale.clone();
        let id = std::mem::replace(&mut locale.id, LanguageIdentifier::UNKNOWN);
        locale.extensions.transform.clear();
        locale.extensions.private.clear();

        // c. Let prefix be locale.
        let mut prefix = id.into();

        // d. Repeat, while prefix is not the empty String,
        // We don't use a `while !prefix.is_und()` because it could be that prefix is und at the start,
        // so we need to make the request at least once.
        loop {
            // i. If availableLocales contains prefix, return the Record { [[locale]]: prefix, [[extension]]: extension }.
            // ICU4X requires doing data requests in order to check if a locale
            // is part of the set of supported locales.
            let response = DryDataProvider::dry_load(
                provider,
                DataRequest {
                    id: DataIdentifierBorrowed::for_marker_attributes_and_locale(
                        S::ATTRIBUTES,
                        &prefix,
                    ),
                    metadata: {
                        let mut metadata = DataRequestMetadata::default();
                        metadata.silent = true;
                        metadata
                    },
                },
            );

            if let Ok(metadata) = response {
                // `metadata.locale` returns None when the provider doesn't have a fallback mechanism,
                // but supports the required locale. However, if the provider has a fallback mechanism,
                // this will return `Some(locale)`, where the locale is the used locale after applying
                // the fallback algorithm, even if the used locale is exactly the same as the required
                // locale.
                match metadata.locale {
                    Some(loc) if loc.into_locale().id == prefix.into_locale().id => {
                        locale.id = prefix.into_locale().id;
                        return Some(locale);
                    }
                    None => {
                        locale.id = prefix.into_locale().id;
                        return Some(locale);
                    }
                    _ => {}
                }
            }

            // ii. If prefix contains "-" (code unit 0x002D HYPHEN-MINUS), let pos be the index into prefix of the last occurrence of "-"; else let pos be 0.
            // iii. Repeat, while pos ≥ 2 and the substring of prefix from pos - 2 to pos - 1 is "-",
            //     1. Set pos to pos - 2.
            // iv. Set prefix to the substring of prefix from 0 to pos.
            // Since the definition of `LanguageIdentifier` allows us to manipulate it
            // without using strings, we can replace these steps by a simpler
            // algorithm.
            if prefix.variant.take().is_none()
                && prefix.region.take().is_none()
                && prefix.script.take().is_none()
            {
                break;
            }
        }
    }

    // 2. Return undefined.
    None
}

/// Abstract operation [`LookupMatchingLocaleByBestFit ( availableLocales, requestedLocales )`][spec]
///
/// Compares `requestedLocales`, which must be a `List` as returned by `CanonicalizeLocaleList`,
/// against the locales in `availableLocales` and determines the best available language to
/// meet the request. The algorithm is implementation dependent, but should produce results
/// that a typical user of the requested locales would perceive as at least as good as those
/// produced by the `LookupMatcher` abstract operation.
///
/// [spec]: https://tc39.es/ecma402/#sec-bestfitmatcher
fn lookup_matching_locale_by_best_fit<S: Service>(
    requested_locales: impl IntoIterator<Item = Locale>,
    provider: &IntlProvider,
) -> Option<Locale>
where
    IntlProvider: DryDataProvider<S::LangMarker>,
{
    for mut locale in requested_locales {
        let id = std::mem::replace(&mut locale.id, LanguageIdentifier::UNKNOWN);

        // Only leave unicode extensions when returning the locale.
        locale.extensions.transform.clear();
        locale.extensions.private.clear();

        let dl = &DataLocale::from(&id);

        let Ok(response) = DryDataProvider::dry_load(
            provider,
            DataRequest {
                id: DataIdentifierBorrowed::for_marker_attributes_and_locale(S::ATTRIBUTES, dl),
                metadata: {
                    let mut md = DataRequestMetadata::default();
                    md.silent = true;
                    md
                },
            },
        ) else {
            continue;
        };

        if id == LanguageIdentifier::UNKNOWN {
            return Some(locale);
        }

        if let Some(id) = response
            .locale
            .map(|dl| dl.into_locale().id)
            .or(Some(id))
            .filter(|loc| loc != &LanguageIdentifier::UNKNOWN)
        {
            locale.id = id;
            return Some(locale);
        }
    }
    None
}

/// Abstract operation `ResolveLocale ( availableLocales, requestedLocales, options, relevantExtensionKeys, localeData )`
///
/// Compares a BCP 47 language priority list `requestedLocales` against the locales
/// in `availableLocales` and determines the best available language to meet the request.
/// `availableLocales`, `requestedLocales`, and `relevantExtensionKeys` must be provided as
/// `List` values, options and `localeData` as Records.
///
/// More information:
///  - [ECMAScript reference][spec]
///
/// [spec]: https://tc39.es/ecma402/#sec-resolvelocale
pub(in crate::builtins::intl) fn resolve_locale<S>(
    requested_locales: impl IntoIterator<Item = Locale>,
    options: &mut IntlOptions<S::Preferences>,
    provider: &IntlProvider,
) -> JsResult<Locale>
where
    S: Service,
    IntlProvider: DryDataProvider<S::LangMarker>,
{
    // 1. Let matcher be options.[[localeMatcher]].
    // 2. If matcher is "lookup", then
    //     a. Let r be LookupMatchingLocaleByPrefix(availableLocales, requestedLocales).
    // 3. Else,
    //     a. Let r be LookupMatchingLocaleByBestFit(availableLocales, requestedLocales).
    // 4. If r is undefined, set r to the Record { [[locale]]: DefaultLocale(), [[extension]]: empty }.
    let found_locale = if options.matcher == LocaleMatcher::Lookup {
        lookup_matching_locale_by_prefix::<S>(requested_locales, provider)
    } else {
        lookup_matching_locale_by_best_fit::<S>(requested_locales, provider)
    };

    let mut found_locale = if let Some(loc) = found_locale {
        loc
    } else {
        let default = default_locale(provider.locale_canonicalizer()?);
        lookup_matching_locale_by_best_fit::<S>([default], provider).ok_or_else(|| {
            JsNativeError::typ().with_message("could not find i18n data for Intl service")
        })?
    };

    // From here, the spec differs significantly from the implementation,
    // since ICU4X allows us to skip some steps and modularize the
    // extension resolution algorithm. However, the original spec is left here
    // for completion purposes.

    // 5. Let result be a new Record.
    // 6. Set result.[[dataLocale]] to foundLocale.
    // 7. If r has an [[extension]] field, then
    //     a. Let components be ! UnicodeExtensionComponents(r.[[extension]]).
    //     b. Let keywords be components.[[Keywords]].
    // 9. For each element key of relevantExtensionKeys, do
    //     a. Let foundLocaleData be localeData.[[<foundLocale>]].
    //     b. Assert: Type(foundLocaleData) is Record.
    //     c. Let keyLocaleData be foundLocaleData.[[<key>]].
    //     d. Assert: Type(keyLocaleData) is List.
    //     e. Let value be keyLocaleData[0].
    //     f. Assert: Type(value) is either String or Null.
    //     g. Let supportedExtensionAddition be "".
    //     h. If r has an [[extension]] field, then
    //         i. If keywords contains an element whose [[Key]] is the same as key, then
    //             1. Let entry be the element of keywords whose [[Key]] is the same as key.
    //             2. Let requestedValue be entry.[[Value]].
    //             3. If requestedValue is not the empty String, then
    //                 a. If keyLocaleData contains requestedValue, then
    //                     i. Let value be requestedValue.
    //                     ii. Let supportedExtensionAddition be the string-concatenation of "-", key, "-", and value.
    //             4. Else if keyLocaleData contains "true", then
    //                 a. Let value be "true".
    //                 b. Let supportedExtensionAddition be the string-concatenation of "-" and key.
    //     i. If options has a field [[<key>]], then
    //         i. Let optionsValue be options.[[<key>]].
    //         ii. Assert: Type(optionsValue) is either String, Undefined, or Null.
    //         iii. If Type(optionsValue) is String, then
    //             1. Let optionsValue be the string optionsValue after performing the algorithm steps to transform
    //                Unicode extension values to canonical syntax per Unicode Technical Standard #35 LDML § 3.2.1
    //                Canonical Unicode Locale Identifiers, treating key as ukey and optionsValue as uvalue productions.
    //             2. Let optionsValue be the string optionsValue after performing the algorithm steps to replace
    //                Unicode extension values with their canonical form per Unicode Technical Standard #35 LDML § 3.2.1
    //                Canonical Unicode Locale Identifiers, treating key as ukey and optionsValue as uvalue productions.
    //             3. If optionsValue is the empty String, then
    //                 a. Let optionsValue be "true".
    //         iv. If keyLocaleData contains optionsValue, then
    //             1. If SameValue(optionsValue, value) is false, then
    //                 a. Let value be optionsValue.
    //                 b. Let supportedExtensionAddition be "".
    //     j. Set result.[[<key>]] to value.
    //     k. Append supportedExtensionAddition to supportedExtension.
    // 10. If the number of elements in supportedExtension is greater than 2, then
    //     a. Let foundLocale be InsertUnicodeExtensionAndCanonicalize(foundLocale, supportedExtension).
    // 11. Set result.[[locale]] to foundLocale.

    // This is basically an adaptation of the process above, which
    // ensures:
    // - All options provided by the locale are valid.
    // - All options provided by args are valid.
    // - Options provided by args are extended (but not overridden) by
    //   options provided in the locale.
    // - Only the locale options that extended the args options are
    //   added to the final locale.
    provider
        .locale_canonicalizer()?
        .canonicalize(&mut found_locale);
    let mut locale_prefs = S::Preferences::from(&found_locale);

    options.preferences.validate(&found_locale.id, provider);
    locale_prefs.validate(&found_locale.id, provider);

    // This should not touch the found locale.
    let prefs = locale_prefs.extended(&options.preferences);

    found_locale.extensions.unicode = prefs.intersection(&locale_prefs).as_unicode();
    options.preferences = prefs;

    // 12. Return result.
    Ok(found_locale)
}

/// Abstract operation [`FilterLocales ( availableLocales, requestedLocales, options )`][spec]
///
/// Returns the subset of the provided BCP 47 language priority list requestedLocales for which
/// availableLocales has a matching locale.
///
/// # Note
///
/// Calling this function with a Service that has a singleton `LangMarker` will always return `None`.
///
/// [spec]: https://tc39.es/ecma402/#sec-supportedlocales
pub(in crate::builtins::intl) fn filter_locales<S: Service>(
    requested_locales: Vec<Locale>,
    options: &JsValue,
    context: &mut Context,
) -> JsResult<JsObject>
where
    IntlProvider: DryDataProvider<S::LangMarker>,
{
    // 1. Set options to ? CoerceOptionsToObject(options).
    let options = coerce_options_to_object(options, context)?;

    // 2. Let matcher be ? GetOption(options, "localeMatcher", string, « "lookup", "best fit" », "best fit").
    let matcher = get_option(&options, js_string!("localeMatcher"), context)?.unwrap_or_default();

    // 3. Let subset be a new empty List.
    let mut subset = Vec::with_capacity(requested_locales.len());

    // 4. For each element locale of requestedLocales, do
    for locale in requested_locales {
        // a. Let noExtensionsLocale be the String value that is locale with any Unicode locale extension sequences removed.
        let mut no_ext_loc = locale.clone();
        no_ext_loc.extensions.unicode.clear();
        let loc_match = match matcher {
            // b. If matcher is "lookup", then
            //     i. Let match be LookupMatchingLocaleByPrefix(availableLocales, noExtensionsLocale).
            LocaleMatcher::Lookup => {
                lookup_matching_locale_by_prefix::<S>([no_ext_loc], context.intl_provider())
            }
            // c. Else,
            //     i. Let match be LookupMatchingLocaleByBestFit(availableLocales, noExtensionsLocale).
            LocaleMatcher::BestFit => {
                lookup_matching_locale_by_best_fit::<S>([no_ext_loc], context.intl_provider())
            }
        };

        // d. If match is not undefined, append locale to subset.
        if loc_match.is_some() {
            subset.push(locale);
        }
    }

    // 5. Return CreateArrayFromList(subset).
    Ok(Array::create_array_from_list(
        subset
            .into_iter()
            .map(|loc| js_string!(loc.to_string()).into()),
        context,
    ))
}

/// Validates that the unicode extension `key` with `value` is a valid extension value for the
/// `language`.
///
/// # Note
///
/// Calling this function with a singleton `DataMarker` will always return `None`.
pub(in crate::builtins::intl) fn validate_extension<M: DataMarker>(
    language: &LanguageIdentifier,
    attributes: &DataMarkerAttributes,
    provider: &impl DryDataProvider<M>,
) -> bool {
    let locale = DataLocale::from(language);
    let req = DataRequest {
        id: DataIdentifierBorrowed::for_marker_attributes_and_locale(attributes, &locale),
        metadata: {
            let mut metadata = DataRequestMetadata::default();
            metadata.silent = true;
            metadata
        },
    };

    provider.dry_load(req).is_ok()
}

#[cfg(all(test, feature = "intl_bundled"))]
mod tests {
    use icu_locale::{Locale, langid, locale};
    use icu_plurals::provider::PluralsCardinalV1;

    struct TestService;

    impl Service for TestService {
        type LangMarker = PluralsCardinalV1;
        type Preferences = EmptyPreferences;
    }

    use crate::{
        builtins::intl::{
            Service,
            locale::utils::{lookup_matching_locale_by_best_fit, lookup_matching_locale_by_prefix},
            options::EmptyPreferences,
        },
        context::icu::IntlProvider,
    };

    #[test]
    fn best_fit() {
        let icu = &IntlProvider::try_new_buffer(boa_icu_provider::buffer());

        assert_eq!(
            lookup_matching_locale_by_best_fit::<TestService>([locale!("en")], icu),
            Some(locale!("en"))
        );

        assert_eq!(
            lookup_matching_locale_by_best_fit::<TestService>([locale!("es-ES")], icu),
            Some(locale!("es"))
        );

        assert_eq!(
            lookup_matching_locale_by_best_fit::<TestService>([locale!("kr")], icu),
            None
        );
    }

    #[test]
    fn lookup_match() {
        let icu = &IntlProvider::try_new_buffer(boa_icu_provider::buffer());

        // requested: [fr-FR-u-hc-h12]
        let requested: Locale = "fr-FR-u-hc-h12".parse().unwrap();

        let result =
            lookup_matching_locale_by_prefix::<TestService>([requested.clone()], icu).unwrap();
        assert_eq!(result.id, langid!("fr"));
        assert_eq!(result.extensions, requested.extensions);

        // requested: [kr-KR-u-hc-h12, gr-GR-u-hc-h24-x-4a, es-ES-valencia-u-ca-gregory, uz-Cyrl]
        let kr = "kr-KR-u-hc-h12".parse().unwrap();
        let gr = "gr-GR-u-hc-h24-x-4a".parse().unwrap();
        let es: Locale = "es-ES-valencia-u-ca-gregory".parse().unwrap();
        let uz = locale!("uz-Cyrl");
        let requested = vec![kr, gr, es.clone(), uz];

        let res = lookup_matching_locale_by_best_fit::<TestService>(requested, icu).unwrap();
        assert_eq!(res.id, langid!("es"));
        assert_eq!(res.extensions, es.extensions);
    }
}
