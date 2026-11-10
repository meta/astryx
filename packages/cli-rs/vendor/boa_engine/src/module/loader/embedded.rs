//! Embedded module loader. Creates a `ModuleLoader` instance that contains
//! files embedded in the binary at build time.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;
use std::rc::Rc;

use boa_engine::module::{ModuleLoader, Referrer};
use boa_engine::{Context, JsNativeError, JsResult, JsString, Module, Source};

/// Create a module loader that embeds files from the filesystem at build
/// time. This is useful for bundling assets with the binary.
///
/// By default will error if the total file size exceeds 1MB. This can be
/// changed by specifying the `max_size` parameter.
///
/// The embedded module will only contain files that have the `.js`, `.mjs`,
/// or `.cjs` extension.
#[macro_export]
macro_rules! embed_module {
    ($($x: expr),*) => {
        $crate::module::embedded::EmbeddedModuleLoader::from_iter(
            $crate::__embed_module_inner!($($x),*),
        )
    };
}

#[derive(Debug, Clone)]
enum EmbeddedModuleEntry {
    Source(CompressType, JsString, &'static [u8]),
    Module(Module),
}

impl EmbeddedModuleEntry {
    fn from_source(compress_type: CompressType, path: JsString, source: &'static [u8]) -> Self {
        Self::Source(compress_type, path, source)
    }

    fn cache(&mut self, context: &mut Context) -> JsResult<&Module> {
        if let Self::Source(compress, path, source) = self {
            let mut bytes: &[u8] = match compress {
                CompressType::None => source,

                #[cfg(feature = "embedded_lz4")]
                CompressType::Lz4 => &lz4_flex::decompress_size_prepended(source)
                    .map_err(|e| boa_engine::js_error!("Could not decompress module: {}", e))?,
            };
            let path = path.to_std_string_escaped();
            let source = Source::from_reader(&mut bytes, Some(Path::new(&path)));
            match Module::parse(source, None, context) {
                Ok(module) => {
                    *self = Self::Module(module);
                }
                Err(err) => {
                    return Err(err);
                }
            }
        }

        match self {
            Self::Module(module) => Ok(module),
            EmbeddedModuleEntry::Source(_, _, _) => unreachable!(),
        }
    }

    fn as_module(&self) -> Option<&Module> {
        match self {
            Self::Module(module) => Some(module),
            Self::Source(_, _, _) => None,
        }
    }
}

/// The type of compression used, if any.
#[derive(Debug, Copy, Clone)]
pub enum CompressType {
    /// No compression used.
    None,

    #[cfg(feature = "embedded_lz4")]
    /// LZ4 compression.
    Lz4,
}

impl TryFrom<&str> for CompressType {
    type Error = &'static str;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "none" => Ok(Self::None),
            #[cfg(feature = "embedded_lz4")]
            "lz4" => Ok(Self::Lz4),
            _ => Err("Invalid compression type"),
        }
    }
}

/// The resulting type of creating an embedded module loader.
#[derive(Debug, Default, Clone)]
#[allow(clippy::module_name_repetitions)]
pub struct EmbeddedModuleLoader {
    map: HashMap<JsString, RefCell<EmbeddedModuleEntry>>,
}

impl EmbeddedModuleLoader {
    /// Get a module if it has been parsed and created. If the module is not found or
    /// was not loaded, this will return `None`.
    #[must_use]
    pub fn get_module(&self, name: &JsString) -> Option<Module> {
        self.map
            .get(name)
            .and_then(|module| module.borrow().as_module().cloned())
    }
}

impl FromIterator<(&'static str, &'static str, &'static [u8])> for EmbeddedModuleLoader {
    fn from_iter<T: IntoIterator<Item = (&'static str, &'static str, &'static [u8])>>(
        iter: T,
    ) -> Self {
        Self {
            map: iter
                .into_iter()
                .map(|(compress_type, path, source)| {
                    let p = JsString::from(path);
                    (
                        p.clone(),
                        RefCell::new(EmbeddedModuleEntry::from_source(
                            compress_type.try_into().expect("Invalid compress type"),
                            p,
                            source,
                        )),
                    )
                })
                .collect(),
        }
    }
}

impl ModuleLoader for EmbeddedModuleLoader {
    fn load_imported_module(
        self: Rc<Self>,
        referrer: Referrer,
        request: boa_engine::module::ModuleRequest,
        context: &RefCell<&mut Context>,
    ) -> impl Future<Output = JsResult<Module>> {
        let result = (|| {
            let specifier_path = boa_engine::module::resolve_module_specifier(
                None,
                request.specifier(),
                referrer.path(),
                &mut context.borrow_mut(),
            )
            .map_err(|e| {
                JsNativeError::typ()
                    .with_message(format!(
                        "could not resolve module specifier `{}`",
                        request.specifier().display_escaped()
                    ))
                    .with_cause(e)
            })?;

            let module = self
                .map
                .get(&JsString::from(specifier_path.to_string_lossy().as_ref()))
                .ok_or_else(|| {
                    JsNativeError::typ().with_message(format!(
                        "could not find module `{}`",
                        request.specifier().display_escaped()
                    ))
                })?;

            let mut embedded = module.borrow_mut();
            embedded.cache(&mut context.borrow_mut()).cloned()
        })();

        async { result }
    }
}
