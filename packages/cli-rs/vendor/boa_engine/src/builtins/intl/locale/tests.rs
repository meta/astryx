use icu_decimal::provider::DecimalSymbolsV1;
use icu_locale::{
    Locale, extensions_unicode_key as key, extensions_unicode_value as value, locale,
    preferences::extensions::unicode::keywords::NumberingSystem,
};
use icu_plurals::provider::PluralsCardinalV1;
use icu_provider::{
    DataIdentifierBorrowed, DataLocale, DataProvider, DataRequest, DataRequestMetadata,
    DryDataProvider,
    prelude::icu_locale_core::{LanguageIdentifier, extensions::unicode},
};

use crate::{
    builtins::intl::{
        Service, ServicePreferences,
        locale::{default_locale, resolve_locale},
        options::{IntlOptions, LocaleMatcher},
    },
    context::icu::IntlProvider,
};

#[derive(Debug, Copy, Clone)]
struct TestPreferences {
    nu: Option<NumberingSystem>,
}

impl From<&Locale> for TestPreferences {
    fn from(value: &Locale) -> Self {
        Self {
            nu: value
                .extensions
                .unicode
                .keywords
                .get(&unicode::key!("nu"))
                .and_then(|nu| NumberingSystem::try_from(nu.clone()).ok()),
        }
    }
}

impl ServicePreferences for TestPreferences {
    fn validate(&mut self, id: &LanguageIdentifier, provider: &IntlProvider) {
        if self.nu.is_some() {
            return;
        }

        let locale = &DataLocale::from(id);
        let req = DataRequest {
            id: DataIdentifierBorrowed::for_locale(locale),
            metadata: DataRequestMetadata::default(),
        };
        let data = DataProvider::<DecimalSymbolsV1>::load(provider, req).unwrap();
        let preferred = data.payload.get().numsys();
        self.nu = Some(
            NumberingSystem::try_from(unicode::Value::try_from_str(preferred).unwrap()).unwrap(),
        );
    }

    fn as_unicode(&self) -> unicode::Unicode {
        let mut exts = unicode::Unicode::new();
        if let Some(nu) = self.nu {
            exts.keywords.set(unicode::key!("nu"), nu.into());
        }
        exts
    }

    fn extended(&self, other: &Self) -> Self {
        let mut result = *self;
        if result.nu.is_none() {
            result.nu = other.nu;
        }
        result
    }

    fn intersection(&self, other: &Self) -> Self {
        let mut inter = *self;
        if inter.nu != other.nu {
            inter.nu.take();
        }
        inter
    }
}

struct TestService;

impl Service for TestService {
    type LangMarker = PluralsCardinalV1;

    type Preferences = TestPreferences;
}

#[test]
fn locale_resolution() {
    let provider = IntlProvider::try_new_buffer(boa_icu_provider::buffer());
    let mut default = default_locale(provider.locale_canonicalizer().unwrap());
    default = <IntlProvider as DryDataProvider<<TestService as Service>::LangMarker>>::dry_load(
        &provider,
        DataRequest {
            id: DataIdentifierBorrowed::for_locale(&default.clone().into()),
            metadata: {
                let mut md = DataRequestMetadata::default();
                md.silent = true;
                md
            },
        },
    )
    .unwrap()
    .locale
    .map_or(default, DataLocale::into_locale);

    default
        .extensions
        .unicode
        .keywords
        .set(key!("nu"), value!("latn"));

    // test lookup
    let mut options = IntlOptions {
        matcher: LocaleMatcher::Lookup,
        preferences: TestPreferences {
            nu: Some(NumberingSystem::try_from(value!("latn")).unwrap()),
        },
    };
    let locale = resolve_locale::<TestService>([], &mut options, &provider).unwrap();
    assert_eq!(locale, default);

    // test best fit
    let mut options = IntlOptions {
        matcher: LocaleMatcher::BestFit,
        preferences: TestPreferences {
            nu: Some(NumberingSystem::try_from(value!("latn")).unwrap()),
        },
    };

    let locale = resolve_locale::<TestService>([], &mut options, &provider).unwrap();
    assert_eq!(locale, default);

    // requested: [es-ES]
    let mut options = IntlOptions {
        matcher: LocaleMatcher::Lookup,
        preferences: TestPreferences { nu: None },
    };

    let locale =
        resolve_locale::<TestService>([locale!("bn-Arab")], &mut options, &provider).unwrap();
    assert_eq!(locale, "bn-u-nu-beng".parse().unwrap());
}
