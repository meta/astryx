// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Translation overlays for component and hook docs.
 *
 * @input An authored component or hook doc and the translation its module
 *   exports for the reading language (`docsZh`, `docsDense`).
 * @output The doc in that language: translated text laid over the authored
 *   doc, never dropping a prop, param, or field the translation has not
 *   caught up with.
 * @position Used by ./compile.mjs when it lowers a component or hook doc, so
 *   every reader sees one overlay rule. Reference topics overlay by section in
 *   ./compile.mjs instead.
 */

/**
 * The translation a doc module exports for `lang`, or null.
 * @param {Record<string, any>} mod
 * @param {string | null} lang
 * @returns {any}
 */
export function translationFor(mod, lang) {
  const key = lang === 'zh' ? 'docsZh' : lang === 'dense' ? 'docsDense' : null;
  return key && mod?.[key] ? mod[key] : null;
}

/**
 * Lay a translation over an authored component or hook doc. A translation
 * that carries props is a full translated doc, overlaid prop by prop; any other
 * is a set of translated strings merged onto the doc.
 * @param {any} docs
 * @param {any} translation
 * @returns {any}
 */
export function overlayAuthoredDoc(docs, translation) {
  if (
    translation.props ||
    translation.components?.some((/** @type {any} */ c) => c.props)
  ) {
    return overlayComponentDoc(docs, translation);
  }
  return mergeTranslation(docs, translation);
}

/**
 * @param {any} docs
 * @param {any} translation
 * @returns {any}
 */
export function mergeTranslation(docs, translation) {
  if (!translation) return docs;

  /** @type {any} */
  const merged = {...docs};

  // Merge prose into usage
  if (merged.usage) {
    merged.usage = {...merged.usage};
    if (translation.usage?.description)
      merged.usage.description = translation.usage.description;
    else if (translation.description)
      merged.usage.description = translation.description;
    if (translation.usage?.bestPractices)
      merged.usage.bestPractices = translation.usage.bestPractices;
    if (translation.usage?.accessibility)
      merged.usage.accessibility = translation.usage.accessibility;
  }

  // Legacy top-level fields (for docsZh that are full ComponentDoc clones)
  if (translation.description && !merged.usage)
    merged.description = translation.description;

  // Merge prop descriptions for single-component docs
  if (translation.propDescriptions && merged.props) {
    merged.props = merged.props.map((/** @type {any} */ prop) => {
      const desc = translation.propDescriptions[prop.name];
      return desc != null ? {...prop, description: desc} : prop;
    });
  }

  // Merge hook param descriptions (HookTranslationDoc). Params are an array of
  // {name, type, description, required}; override description by name where the
  // translation has an entry. Names may include dots (e.g. 'options.isActive');
  // the lookup is keyed by the exact param name.
  if (translation.paramDescriptions && merged.params) {
    merged.params = merged.params.map((/** @type {any} */ param) => {
      const desc = translation.paramDescriptions[param.name];
      return desc != null ? {...param, description: desc} : param;
    });
  }

  // Merge hook return descriptions (HookTranslationDoc). Returns are an array
  // of {name, type, description}; override description by name where present.
  if (translation.returnDescriptions && merged.returns) {
    merged.returns = merged.returns.map((/** @type {any} */ ret) => {
      const desc = translation.returnDescriptions[ret.name];
      return desc != null ? {...ret, description: desc} : ret;
    });
  }

  // Merge sub-component translations
  if (translation.components && merged.components) {
    merged.components = merged.components.map(
      (/** @type {any} */ comp, /** @type {any} */ i) => {
        const trans =
          translation.components.find(
            (/** @type {any} */ t) => t.name === comp.name,
          ) || translation.components[i];
        if (!trans) return comp;

        const mergedComp = {...comp};
        if (trans.description) mergedComp.description = trans.description;
        if (trans.propDescriptions && comp.props) {
          mergedComp.props = comp.props.map((/** @type {any} */ prop) => {
            const desc = trans.propDescriptions[prop.name];
            return desc != null ? {...prop, description: desc} : prop;
          });
        }
        return mergedComp;
      },
    );
  }

  return merged;
}

/**
 * Overlay a full-ComponentDoc-shaped translation onto the English doc.
 *
 * Base order and completeness win; the translation supplies text for the
 * entries it covers. Props are matched by name, never by position, so a
 * translation that is missing entries (or lists them in another order) can no
 * longer drop or misattribute one.
 *
 * @param {any} docs Base (English) component doc.
 * @param {any} translation Translated doc, possibly covering only some props.
 * @returns {any} Merged doc with every base prop present.
 */
function overlayComponentDoc(docs, translation) {
  /** Merge one prop list: keep base entries and order, translate what's covered.
   * @param {any[] | undefined} baseProps
   * @param {any[] | undefined} tProps
   */
  const overlayProps = (baseProps, tProps) => {
    if (!baseProps) return baseProps;
    const byName = new Map(
      (tProps ?? []).map((/** @type {any} */ p) => [p.name, p]),
    );
    return baseProps.map((/** @type {any} */ prop) => {
      const t = byName.get(prop.name);
      // Take the translated text, but never let it drop the prop's contract
      // (type/default/required stay authoritative from the English doc).
      return t ? {...prop, ...t, name: prop.name, type: prop.type} : prop;
    });
  };

  /** Preserve canonical structured guidance added after legacy full-doc translations,
   * without changing established translated prose behavior.
   * @param {any} baseUsage
   * @param {any} translatedUsage
   */
  const mergeUsage = (baseUsage, translatedUsage) => {
    if (!translatedUsage) return baseUsage;
    return {
      ...translatedUsage,
      ...(translatedUsage.accessibility === undefined &&
      baseUsage?.accessibility !== undefined
        ? {accessibility: baseUsage.accessibility}
        : null),
      ...(translatedUsage.accessibilityThemeCoverage === undefined &&
      baseUsage?.accessibilityThemeCoverage !== undefined
        ? {accessibilityThemeCoverage: baseUsage.accessibilityThemeCoverage}
        : null),
      ...(translatedUsage.anatomy === undefined &&
      baseUsage?.anatomy !== undefined
        ? {anatomy: baseUsage.anatomy}
        : null),
    };
  };

  const merged = {
    ...docs,
    ...translation,
    usage: mergeUsage(docs.usage, translation.usage),
  };

  merged.props = overlayProps(docs.props, translation.props);

  if (docs.components) {
    const tByName = new Map(
      (translation.components ?? []).map((/** @type {any} */ c) => [c.name, c]),
    );
    merged.components = docs.components.map((/** @type {any} */ base) => {
      const t = tByName.get(base.name);
      if (!t) return base;
      return {
        ...base,
        ...t,
        usage: mergeUsage(base.usage, t.usage),
        props: overlayProps(base.props, t.props),
      };
    });
  }

  return merged;
}
