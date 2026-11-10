use std::{cell::OnceCell, fmt::Debug};

use icu_casemap::CaseMapper;
use icu_locale::{LocaleCanonicalizer, LocaleExpander};
use icu_normalizer::{ComposingNormalizer, DecomposingNormalizer};
use icu_provider::prelude::*;
use serde::Deserialize;
use thiserror::Error;
use yoke::Yokeable;
use zerofrom::ZeroFrom;

use crate::{JsError, JsNativeError, builtins::string::StringNormalizers};

/// Error thrown when the engine cannot initialize the ICU4X utilities from a data provider.
#[derive(Debug, Error, Copy, Clone)]
pub enum IcuError {
    /// Failed to create the internationalization utilities.
    #[error("could not construct the internationalization utilities")]
    DataError(#[from] DataError),
}

impl From<IcuError> for JsNativeError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(value: IcuError) -> Self {
        JsNativeError::typ().with_message(value.to_string())
    }
}

impl From<IcuError> for JsError {
    #[cfg_attr(feature = "native-backtrace", track_caller)]
    fn from(value: IcuError) -> Self {
        JsNativeError::from(value).into()
    }
}

/// Custom [`DataProvider`] for `Intl` that caches some utilities.
pub(crate) struct IntlProvider {
    inner_provider: Box<dyn DynamicDryDataProvider<BufferMarker>>,
    locale_canonicalizer: OnceCell<LocaleCanonicalizer>,
    locale_expander: OnceCell<LocaleExpander>,
    string_normalizers: OnceCell<StringNormalizers>,
    case_mapper: OnceCell<CaseMapper>,
}

impl<M> DataProvider<M> for IntlProvider
where
    M: DataMarker + 'static,
    for<'de> <M::DataStruct as Yokeable<'de>>::Output: Deserialize<'de> + Clone,
    M::DataStruct: ZeroFrom<'static, M::DataStruct>,
{
    fn load(&self, req: DataRequest<'_>) -> Result<DataResponse<M>, DataError> {
        self.inner_provider
            .as_deserializing()
            .load_data(M::INFO, req)
    }
}

impl<M> DryDataProvider<M> for IntlProvider
where
    M: DataMarker + 'static,
    for<'de> <M::DataStruct as Yokeable<'de>>::Output: Deserialize<'de> + Clone,
    M::DataStruct: ZeroFrom<'static, M::DataStruct>,
{
    fn dry_load(&self, req: DataRequest<'_>) -> Result<DataResponseMetadata, DataError> {
        self.inner_provider.dry_load_data(M::INFO, req)
    }
}

impl Debug for IntlProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Icu")
            .field("locale_canonicalizer", &self.locale_canonicalizer)
            .field("locale_expander", &self.locale_expander)
            .field("string_normalizers", &self.string_normalizers)
            .field("string_normalizercase_mapper", &self.case_mapper)
            .finish_non_exhaustive()
    }
}

impl IntlProvider {
    /// Creates a new [`IntlProvider`] from a [`DynamicDryDataProvider<BufferMarker>`].
    ///
    /// # Errors
    ///
    /// Returns an error if any of the tools required cannot be constructed.
    pub(crate) fn try_new_buffer(
        provider: impl DynamicDryDataProvider<BufferMarker> + 'static,
    ) -> IntlProvider {
        Self {
            locale_canonicalizer: OnceCell::new(),
            locale_expander: OnceCell::new(),
            string_normalizers: OnceCell::new(),
            case_mapper: OnceCell::new(),
            inner_provider: Box::new(provider),
        }
    }

    /// Gets the [`LocaleCanonicalizer`] tool.
    pub(crate) fn locale_canonicalizer(&self) -> Result<&LocaleCanonicalizer, IcuError> {
        if let Some(lc) = self.locale_canonicalizer.get() {
            return Ok(lc);
        }
        let expander = self.locale_expander()?.clone();
        let lc = LocaleCanonicalizer::try_new_with_expander_with_buffer_provider(
            &self.inner_provider,
            expander,
        )?;
        Ok(self.locale_canonicalizer.get_or_init(|| lc))
    }

    /// Gets the [`LocaleExpander`] tool.
    pub(crate) fn locale_expander(&self) -> Result<&LocaleExpander, IcuError> {
        if let Some(le) = self.locale_expander.get() {
            return Ok(le);
        }

        let le = LocaleExpander::try_new_extended_with_buffer_provider(&self.inner_provider)?;
        Ok(self.locale_expander.get_or_init(|| le))
    }

    /// Gets the [`StringNormalizers`] tools.
    pub(crate) fn string_normalizers(&self) -> Result<&StringNormalizers, IcuError> {
        if let Some(sn) = self.string_normalizers.get() {
            return Ok(sn);
        }
        let sn = StringNormalizers {
            nfc: ComposingNormalizer::try_new_nfc_with_buffer_provider(&self.inner_provider)?,
            nfkc: ComposingNormalizer::try_new_nfkc_with_buffer_provider(&self.inner_provider)?,
            nfd: DecomposingNormalizer::try_new_nfd_with_buffer_provider(&self.inner_provider)?,
            nfkd: DecomposingNormalizer::try_new_nfkd_with_buffer_provider(&self.inner_provider)?,
        };
        Ok(self.string_normalizers.get_or_init(|| sn))
    }

    /// Gets the [`CaseMapper`] tool.
    pub(crate) fn case_mapper(&self) -> Result<&CaseMapper, IcuError> {
        if let Some(cm) = self.case_mapper.get() {
            return Ok(cm);
        }
        let cm = CaseMapper::try_new_with_buffer_provider(&self.inner_provider)?;

        Ok(self.case_mapper.get_or_init(|| cm))
    }

    /// Gets the inner provider.
    pub(crate) fn erased_provider(&self) -> &dyn DynamicDryDataProvider<BufferMarker> {
        &self.inner_provider
    }
}
