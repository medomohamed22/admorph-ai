import { metadataCapabilities } from '../capabilities';
import { openAIListSchema, type ModelInfo, type ProviderId } from '../schemas';

export function parseOpenAIList(data: unknown, provider: ProviderId): ModelInfo[] {
  return openAIListSchema.parse(data).data.map(raw => ({
    id: raw.id, name: raw.name ?? raw.id, provider,
    capabilities: metadataCapabilities(raw),
    capabilityEvidence: metadataCapabilities(raw).length ? 'metadata' : 'unknown',
    description: raw.description ?? undefined, contextWindow: raw.context_length ?? undefined,
    availability: raw.available === true ? 'available' : raw.available === false ? 'unavailable' : 'unknown',
  }));
}
