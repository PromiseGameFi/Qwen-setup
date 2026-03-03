import type { AppSettings } from '../../types/chat'

export const CURRENT_SCHEMA_VERSION = 1 as const

export function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    provider: {
      ...settings.provider,
      baseUrl: settings.provider.baseUrl.trim(),
      apiKey: settings.provider.apiKey ?? '',
      model: settings.provider.model.trim(),
      stream: true,
    },
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }
}
