// SPDX-License-Identifier: LicenseRef-PolyFormNoncommercial-1.0.0
// Match the training-intent request contract, including imported camelCase fields.
const ALIASES: Record<string, string> = {
  networkDim: 'network_dim', networkAlpha: 'network_alpha', shuffleCaption: 'shuffle_caption',
  keepTokens: 'keep_tokens', captionDropout: 'caption_dropout_rate', captionDropoutRate: 'caption_dropout_rate',
  semanticRegionWeightingEnabled: 'semantic_region_weighting_enabled', trainingIntent: 'training_intent',
}

export function filterIntentSuggestions(
  values: Record<string, unknown>, explicitFields: Iterable<string>, managedKeys: ReadonlySet<string> = new Set(),
) {
  const explicit = new Set(Array.from(explicitFields, (key) => ALIASES[key.trim()] || key.trim()))
  return Object.fromEntries(Object.entries(values).filter(([key]) => !managedKeys.has(key) && !explicit.has(key)))
}
