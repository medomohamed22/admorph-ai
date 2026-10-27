'use client';
import { useState } from 'react';
import { useMessages } from './workspace';
import { useProviderSession } from './provider-session';
import { CredentialError, encryptCredential, decryptCredential } from '@/lib/security/credentials';
import { validateCustomBase } from '@/lib/ai/providers/custom';

export function CredentialVault() {
  const m = useMessages(); const s = m.vault;
  const session = useProviderSession(); const { provider, configs, vault } = session;
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<keyof typeof s | null>(null);
  const record = vault[provider];
  async function act(action: 'store' | 'unlock' | 'forget') {
    const epoch = session.currentKeyEpoch();
    setBusy(true); setResult(null);
    try {
      if (action === 'forget') {
        if (!await session.forgetKey(provider)) throw new Error('storage');
        setResult('forgotten');
      } else if (action === 'store') {
        if (!configs[provider].apiKey.trim()) { setResult('noKey'); return; }
        const base = provider === 'custom' ? validateCustomBase(configs.custom.baseUrl) : '';
        const encrypted = await encryptCredential(provider, configs[provider].apiKey, passphrase, base);
        if (epoch !== session.currentKeyEpoch()) return;
        if (!await session.storeEncrypted(encrypted)) throw new Error('storage');
        setResult('stored');
      } else if (record) {
        if (provider === 'custom') {
          let currentBase;
          try { currentBase = validateCustomBase(configs.custom.baseUrl); } catch { setResult('endpointChanged'); return; }
          if (currentBase !== record.baseUrl) { setResult('endpointChanged'); return; }
        }
        const apiKey = await decryptCredential(record, passphrase);
        if (epoch !== session.currentKeyEpoch()) return;
        session.setConfigs(previous => ({ ...previous, [provider]: { ...previous[provider], apiKey, consent: false } }));
        setResult('unlocked');
      }
    } catch (error) {
      setResult(error instanceof CredentialError ? error.code === 'passphrase' ? 'passphraseError' : error.code : 'storageError');
    } finally { setPassphrase(''); setBusy(false); }
  }
  return <details className="credential-vault"><summary>{s.title}</summary><p>{s.note}</p>{record && <><p>{s.locked}</p>{record.baseUrl && <p>{s.endpoint}: <bdi>{record.baseUrl}</bdi></p>}</>}
    <label htmlFor="vault-passphrase">{s.passphrase}</label><input id="vault-passphrase" type="password" autoComplete="off" value={passphrase} maxLength={256} disabled={busy} onChange={event => setPassphrase(event.target.value)}/><p className="input-hint">{s.hint}</p>
    <div className="field-actions"><button className="button secondary" disabled={busy || !session.ready} onClick={() => void act('store')}>{s.remember}</button>{record && <><button className="button secondary" disabled={busy} onClick={() => void act('unlock')}>{s.unlock}</button><button className="button secondary" disabled={busy} onClick={() => void act('forget')}>{s.forget}</button></>}</div>
    {busy && <p role="status">{s.busy}</p>}{result && <p role="status" className="vault-result">{s[result]}</p>}
  </details>;
}
