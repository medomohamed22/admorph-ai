import type { ProviderId } from './schemas';

export const providers = {
  meta: { name: 'Meta', baseUrl: 'https://api.meta.ai/v1', requiresKey: true },
  gemini: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', requiresKey: true },
  openrouter: { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', requiresKey: false },
  custom: { name: 'Custom', baseUrl: '', requiresKey: false },
} satisfies Record<ProviderId, { name: string; baseUrl: string; requiresKey: boolean }>;
export const providerIds = Object.keys(providers) as ProviderId[];
