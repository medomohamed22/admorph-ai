import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CredentialError, decryptCredential, encryptCredential } from '../../src/lib/security/credentials';

describe('encrypted key vault', () => {
  it('round-trips a key through AES-GCM and rejects a wrong passphrase', async () => {
    const record = await encryptCredential('meta', 'test-only-key-123', 'test-passphrase-1234');
    expect(record.providerId).toBe('meta');
    expect(record.ciphertext).not.toContain('test-only-key-123');
    await expect(decryptCredential(record, 'test-passphrase-1234')).resolves.toBe('test-only-key-123');
    await expect(decryptCredential(record, 'wrong-passphrase-12')).rejects.toBeInstanceOf(CredentialError);
  });

  it('rejects short passphrases and tampered records', async () => {
    await expect(encryptCredential('meta', 'k', 'short')).rejects.toMatchObject({ code: 'passphrase' });
    const record = await encryptCredential('meta', 'test-only-key-123', 'test-passphrase-1234');
    await expect(decryptCredential({ ...record, ciphertext: [...record.ciphertext.slice(0, -1), record.ciphertext.at(-1)! ^ 1] }, 'test-passphrase-1234')).rejects.toBeInstanceOf(CredentialError);
    await expect(decryptCredential({ ...record, providerId: 'custom' }, 'test-passphrase-1234')).rejects.toBeInstanceOf(CredentialError);
  });
});
