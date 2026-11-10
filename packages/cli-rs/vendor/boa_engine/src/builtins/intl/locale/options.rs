use icu_locale::{
    extensions::unicode::Value,
    subtags::{Language, Region, Script, Variant, Variants},
};

use crate::{Context, JsNativeError, builtins::options::OptionType};

impl OptionType for Value {
    fn from_value(value: crate::JsValue, context: &mut Context) -> crate::JsResult<Self> {
        let val = value.to_string(context)?.to_std_string_escaped();

        if val.is_empty() {
            return Err(JsNativeError::range()
                .with_message("nonterminal `type` must be at least 3 characters long")
                .into());
        }

        let val = val
            .parse::<Self>()
            .map_err(|e| JsNativeError::range().with_message(e.to_string()))?;

        for subtag in val.clone() {
            if subtag.len() < 3 {
                return Err(JsNativeError::range()
                    .with_message("nonterminal `type` must be at least 3 characters long")
                    .into());
            }
        }

        Ok(val)
    }
}

impl OptionType for Language {
    fn from_value(value: crate::JsValue, context: &mut Context) -> crate::JsResult<Self> {
        value
            .to_string(context)?
            .to_std_string_escaped()
            .parse::<Self>()
            .map_err(|e| JsNativeError::range().with_message(e.to_string()).into())
    }
}

impl OptionType for Script {
    fn from_value(value: crate::JsValue, context: &mut Context) -> crate::JsResult<Self> {
        value
            .to_string(context)?
            .to_std_string_escaped()
            .parse::<Self>()
            .map_err(|e| JsNativeError::range().with_message(e.to_string()).into())
    }
}

impl OptionType for Region {
    fn from_value(value: crate::JsValue, context: &mut Context) -> crate::JsResult<Self> {
        value
            .to_string(context)?
            .to_std_string_escaped()
            .parse::<Self>()
            .map_err(|e| JsNativeError::range().with_message(e.to_string()).into())
    }
}

impl OptionType for Variants {
    fn from_value(value: crate::JsValue, context: &mut Context) -> crate::JsResult<Self> {
        let variants = value.to_string(context)?.to_std_string_escaped();
        // a. If variants is the empty String, throw a RangeError exception.
        if variants.is_empty() {
            return Err(JsNativeError::range()
                .with_message("locale variants cannot be empty")
                .into());
        }

        // b. Let lowerVariants be the ASCII-lowercase of variants.
        // c. Let variantSubtags be StringSplitToList(lowerVariants, "-").
        let variants = variants.split('-');

        // d. For each element variant of variantSubtags, do
        let mut v = Vec::with_capacity(variants.size_hint().0);
        for variant in variants {
            //        i. If variant cannot be matched by the unicode_variant_subtag Unicode locale nonterminal, throw a RangeError exception.
            let variant = variant
                .parse::<Variant>()
                .map_err(|e| JsNativeError::range().with_message(e.to_string()))?;

            // e. If variantSubtags contains any duplicate elements, throw a RangeError exception.
            let Err(index) = v.binary_search(&variant) else {
                return Err(JsNativeError::range()
                    .with_message("locale variants cannot have duplicate subtags")
                    .into());
            };
            v.insert(index, variant);
        }

        Ok(Variants::from_vec_unchecked(v))
    }
}
