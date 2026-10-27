'use client';
import { useProviderSession } from './provider-session';
import { useMessages } from './workspace';
export function SessionPrivacy() {
  const session = useProviderSession(), s = useMessages().publicMode;
  const unlocked = Object.values(session.configs).some(config => !!config.apiKey.trim());
  return <section className="session-privacy" aria-labelledby="privacy-title"><h2 id="privacy-title">{s.title}</h2><p>{s.help}</p><p>{s.storage}</p>
    <p role="status" data-testid="session-key-status">{unlocked ? s.unlocked : s.locked}</p><p>{s.cancelLimit}</p><p>{s.noRemote}</p>
  </section>;
}
