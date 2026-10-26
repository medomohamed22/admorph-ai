import { encryptedCredentialSchema, type EncryptedCredential } from '../db/schema';
import type { ProviderId } from '../ai/schemas';

export class CredentialError extends Error { constructor(public code: 'passphrase' | 'unlockFailed' | 'cryptoUnavailable') { super(code); } }
async function derive(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  if (!globalThis.crypto?.subtle) throw new CredentialError('cryptoUnavailable');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptCredential(providerId: ProviderId, apiKey: string, passphrase: string, baseUrl = ''): Promise<EncryptedCredential> {
  if (passphrase.length < 12) throw new CredentialError('passphrase');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt);
  // Authenticate the provider identity so a saved entry cannot be reassigned to another provider.
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${providerId}\0${baseUrl}`) }, key, new TextEncoder().encode(apiKey));
  return { providerId, baseUrl, version: 1, iterations: 310000, salt: [...salt], iv: [...iv], ciphertext: [...new Uint8Array(ciphertext)] };
}
export async function decryptCredential(raw: EncryptedCredential, passphrase: string) {
  try {
    const saved = encryptedCredentialSchema.parse(raw);
    const key = await derive(passphrase, new Uint8Array(saved.salt));
    const decoded = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(saved.iv), additionalData: new TextEncoder().encode(`${saved.providerId}\0${saved.baseUrl}`) }, key, new Uint8Array(saved.ciphertext));
    return new TextDecoder().decode(decoded);
  } catch (error) { if (error instanceof CredentialError && error.code === 'cryptoUnavailable') throw error; throw new CredentialError('unlockFailed'); }
}
