import { ProviderError } from './errors';
import type { ModelCapability, ModelInfo, ModelRole, RawModel, ModelSelection } from './schemas';
export function confirmedImage(selection: ModelSelection, model?: ModelInfo | null): boolean {
  return !!(selection.provider === 'meta' && selection.manual && selection.imageCapabilityConfirmed && model?.availability !== 'unavailable' && (model?.capabilityEvidence !== 'metadata' || model.capabilities.includes('image_output')));
}

export function metadataCapabilities(raw: RawModel): ModelCapability[] {
  const input = raw.architecture?.input_modalities ?? raw.input_modalities ?? [];
  const output = raw.architecture?.output_modalities ?? raw.output_modalities ?? [];
  const declared = raw.capabilities ?? [];
  const result: ModelCapability[] = [];
  if (output.includes('text') || declared.includes('text')) result.push('text');
  if (input.includes('image') || declared.includes('vision')) result.push('vision');
  if (output.includes('image') || declared.includes('image_output')) result.push('image_output');
  if (raw.supported_parameters?.includes('structured_outputs') || declared.includes('structured_output')) {
    result.push('structured_output');
  }
  return result;
}

export function canUseRole(model: ModelInfo, role: ModelRole): boolean {
  return model.provider === 'meta' && model.availability !== 'unavailable' && (role === 'image' || ['planner','critic','edit'].includes(role));
}
export function assertRole(model: ModelInfo, role: ModelRole): void {
  if (!canUseRole(model, role)) throw new ProviderError('role_capability');
}
export function filterModels(models: ModelInfo[], search: string, capability: ModelCapability | 'all', availableOnly: boolean) {
  const query = search.trim().toLowerCase();
  return models.filter(model => (!query || `${model.id} ${model.name} ${model.description ?? ''}`.toLowerCase().includes(query)) &&
    (capability === 'all' || model.capabilities.includes(capability)) &&
    (!availableOnly || model.availability === 'available'));
}
