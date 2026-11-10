//! [`JsValue`] conversions for std collections.

use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;

use crate::object::JsMap;
use crate::value::TryFromJs;
use crate::{Context, JsNativeError, JsResult, JsValue};

impl<K, V> TryFromJs for BTreeMap<K, V>
where
    K: TryFromJs + Ord,
    V: TryFromJs,
{
    fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
        let Some(object) = value.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("cannot convert value to a BTreeMap")
                .into());
        };

        // JsMap case
        if let Ok(js_map) = JsMap::from_object(object.clone()) {
            let mut map = Self::default();
            js_map.for_each_native(|key, value| {
                map.insert(
                    K::try_from_js(&key, context)?,
                    V::try_from_js(&value, context)?,
                );
                Ok(())
            })?;
            return Ok(map);
        }

        // key-valued JsObject case:
        let keys = object.__own_property_keys__(context)?;

        keys.into_iter()
            .map(|key| {
                let js_value = object.get(key.clone(), context)?;
                let js_key: JsValue = key.into();

                let key = K::try_from_js(&js_key, context)?;
                let value = V::try_from_js(&js_value, context)?;

                Ok((key, value))
            })
            .collect()
    }
}

impl<K, V, S> TryFromJs for HashMap<K, V, S>
where
    K: TryFromJs + Ord + Hash,
    V: TryFromJs,
    S: std::hash::BuildHasher + Default,
{
    fn try_from_js(value: &JsValue, context: &mut Context) -> JsResult<Self> {
        let Some(object) = value.as_object() else {
            return Err(JsNativeError::typ()
                .with_message("cannot convert value to a BTreeMap")
                .into());
        };

        // JsMap case
        if let Ok(js_map) = JsMap::from_object(object.clone()) {
            let mut map = Self::default();
            js_map.for_each_native(|key, value| {
                map.insert(
                    K::try_from_js(&key, context)?,
                    V::try_from_js(&value, context)?,
                );
                Ok(())
            })?;
            return Ok(map);
        }

        // key-valued JsObject case:
        let keys = object.__own_property_keys__(context)?;

        keys.into_iter()
            .map(|key| {
                let js_value = object.get(key.clone(), context)?;
                let js_key: JsValue = key.into();

                let key = K::try_from_js(&js_key, context)?;
                let value = V::try_from_js(&js_value, context)?;

                Ok((key, value))
            })
            .collect()
    }
}
