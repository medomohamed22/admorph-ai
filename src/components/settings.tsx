'use client';

import { useEffect, useRef, useState } from 'react';
import {useMessages, useWorkspace} from './workspace';
import {CredentialVault} from './credential-vault';
import {StorageControls} from './storage-controls';
import { useProviderSession, type ProviderConfig } from './provider-session';
import { providers, providerIds } from '@/lib/ai/registry';
import { canUseRole, assertRole, filterModels } from '@/lib/ai/capabilities';
import { fetchCatalog, manualSelection } from '@/lib/ai/client';
import { ProviderError, errorCode, type ErrorCode } from '@/lib/ai/errors';
import { roles as roleIds, type ModelCapability, type ModelRole, type ProviderId, type ModelSelection } from '@/lib/ai/schemas';

export function Settings() {
  const m = useMessages();
  const workspace = useWorkspace();
  const session = useProviderSession();
  const providerName = (id: ProviderId) => id === 'custom' ? m.settings.customProvider : providers[id].name;
  const { provider, setProvider, configs, setConfigs, catalogs, setCatalogs, roles, setRoles, savedRoles, setSavedRoles } = session;
  const s = m.settings;
  const config = configs[provider];
  const catalog = catalogs[provider];
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [notice, setNotice] = useState<'' | 'fetched' | 'manualAdded' | 'saved' | 'savedEphemeral' | 'cleared' | 'cancelled'>('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [feedbackArea, setFeedbackArea] = useState<'provider' | 'roles'>('provider');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ModelCapability | 'all'>('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [quickModel, setQuickModel] = useState('');
  const [roleProviders, setRoleProviders] = useState<Partial<Record<ModelRole, ProviderId>>>({});
  const [manualId, setManualId] = useState('');
  const [manualRole, setManualRole] = useState<ModelRole>('planner');
  const [manualAck, setManualAck] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const lastAction = useRef<'models' | 'test'>('models');

  useEffect(() => { const timer = setTimeout(() => setQuery(search), 200); return () => clearTimeout(timer); }, [search]);
  useEffect(() => () => controller.current?.abort(), []);

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
  }
  function switchProvider(next: ProviderId) {
    cancel(); setProvider(next); setShowKey(false); setError(null); setNotice('');
    setSearch(''); setQuery(''); setFilter('all'); setAvailableOnly(false); setVisibleCount(30);
    setQuickModel(''); setManualId(''); setManualAck(false);
  }
  function updateConfig(patch: Partial<ProviderConfig>, clear = false) {
    cancel(); setError(null); setNotice(''); setFeedbackArea('provider');
    setConfigs(previous => ({ ...previous, [provider]: { ...previous[provider], ...patch } }));
    if ('baseUrl' in patch) {
      setCatalogs(previous => { const copy = { ...previous }; delete copy[provider]; return copy; });
      setRoles(previous => Object.fromEntries(roleIds.map(role => [role, previous[role]?.provider === provider ? null : previous[role]])) as typeof roles);
      setSavedRoles(null); setQuickModel('');
    } else if ('apiKey' in patch || clear) {
      setCatalogs(previous => previous[provider] ? {...previous,[provider]:{...previous[provider]!,credentialStatus:'not_tested',cached:true}} : previous);
    }
  }
  async function run(action: 'models' | 'test') {
    cancel(); setError(null); setNotice(''); setFeedbackArea('provider'); lastAction.current = action;
    const active = new AbortController(); controller.current = active;
    setBusy(true);
    try {
      if ((providers[provider].requiresKey || (provider === 'openrouter' && action === 'test')) && !config.apiKey.trim()) throw new ProviderError('missing_key');
      const result = await fetchCatalog({ providerId: provider, ...config }, action, active.signal);
      if (controller.current !== active || active.signal.aborted) return;
      setCatalogs(previous => ({ ...previous, [provider]: result }));
      void session.rememberCatalog(provider, result);
      // A refreshed catalog can revoke capabilities or remove IDs. Keep only still-valid catalog selections.
      setRoles(previous => Object.fromEntries(roleIds.map(role => {
        const selection = previous[role];
        if (!selection || selection.provider !== provider) return [role, selection];
        const model = result.models.find(model => model.id === selection.modelId);
        if (selection.manual && role !== 'image' && (!model || (!model.capabilities.length && model.availability !== 'unavailable'))) return [role, selection];
        return [role, model && canUseRole(model, role) ? selection : null];
      })) as typeof roles);
      setSavedRoles(null); setQuickModel(''); setVisibleCount(30);
      setNotice('fetched');
    } catch (failure) {
      if (controller.current !== active || active.signal.aborted) return;
      setError(failure instanceof TypeError ? 'network' : errorCode(failure));
    } finally {
      if (controller.current === active) { setBusy(false); controller.current = null; }
    }
  }
  function assign(role: ModelRole, selection: ModelSelection | null) {
    setError(null); setNotice(''); setFeedbackArea('roles');
    if (selection && !selection.manual) {
      const model = catalogs[selection.provider]?.models.find(item => item.id === selection.modelId);
      if (!model || !canUseRole(model, role)) { setError('role_capability'); return; }
    }
    setRoles(previous => ({ ...previous, [role]: selection })); setSavedRoles(null);
  }
  function useQuickModel() {
    setFeedbackArea('roles');
    const model = catalog?.models.find(item => item.id === quickModel);
    if (!model || !canUseRole(model, 'planner')) { setError('role_capability'); return; }
    const selection = { provider, modelId: model.id };
    setRoles(previous => ({ ...previous, planner: selection, critic: selection, edit: selection }));
    setRoleProviders(previous => ({ ...previous, planner: provider, critic: provider, edit: provider }));
    setSavedRoles(null); setError(null); setNotice('');
  }
  function assignManual() {
    setFeedbackArea('roles');
    try {
      const selection = manualSelection(provider, manualRole, manualId, manualAck, catalog?.models ?? []);
      assign(manualRole, selection); setRoleProviders(previous => ({ ...previous, [manualRole]: provider })); setNotice('manualAdded');
    } catch (failure) { setError(errorCode(failure)); setNotice(''); }
  }
  async function save() {
    setSavingSettings(true);
    setFeedbackArea('roles');
    try {
      if (!roles.planner || !roles.critic || !roles.edit) throw new ProviderError('incomplete_roles');
      for (const role of roleIds) {
        const selection = roles[role];
        if (!selection) continue;
        if (selection.manual) {
          if (role === 'image') throw new ProviderError('role_capability');
        } else {
          const model = catalogs[selection.provider]?.models.find(item => item.id === selection.modelId);
          if (!model) throw new ProviderError('role_capability');
          assertRole(model, role);
        }
      }
      const persisted = await session.persistSettings(structuredClone(roles));
      setSavedRoles(structuredClone(roles)); setNotice(persisted ? 'saved' : 'savedEphemeral'); setError(null);
    } catch (failure) { setError(errorCode(failure)); setNotice(''); }
    finally {setSavingSettings(false);}
  }

  const matching = filterModels(catalog?.models ?? [], query, filter, availableOnly);
  const sections = [s.language, s.providers, s.roles, s.storage, s.protection, s.about];
  const roleLabel = (role: ModelRole) => s[role];

  return <div className="settings-page">
    <div className="page-heading"><span className="eyebrow">{s.eyebrow}</span><h1>{s.title}</h1><p>{s.description}</p></div>
    <div className="settings-grid">
      <nav className="settings-nav" aria-label={s.title}>{sections.map((title, i) => <a href={`#setting-${i}`} key={title}>{title}<span>↗</span></a>)}</nav>
      <div className="settings-sections">
        <section id="setting-0" className="settings-card"><h2>{s.language}</h2><label htmlFor="language">{s.language}</label><select id="language" disabled={workspace.phase === 'loading'} value={workspace.locale} onChange={event=>workspace.setLocale(event.target.value as 'en'|'ar')}><option value="en">{s.english}</option><option value="ar">{s.arabic}</option></select><p>{s.languageNote}</p></section>
        <section id="setting-1" className="settings-card" aria-busy={busy}>
          <h2>{s.providers}</h2><p>{s.providerNote}</p>
          <div className="provider-tabs" role="group" aria-label={s.providers}>{providerIds.map(id => <button key={id} disabled={!session.ready} aria-pressed={id === provider} onClick={() => switchProvider(id)}>{providerName(id)}</button>)}</div>
          <div className="connection-status"><span className="dot"/>{error && feedbackArea === 'provider' ? s.connectionFailed : catalog?.cached ? s.cached : catalog ? s[catalog.credentialStatus === 'accepted' ? 'accepted' : catalog.credentialStatus === 'endpoint_only' ? 'endpointOnly' : 'notTested'] : s.status}</div>
          <label htmlFor="api-key">{s.key}</label>
          <div className="key-field"><input id="api-key" dir="ltr" disabled={!session.ready} autoComplete="off" autoCapitalize="none" spellCheck={false} type={showKey ? 'text' : 'password'} value={config.apiKey} maxLength={4096} placeholder={s.keyPlaceholder} onChange={event => updateConfig({ apiKey: event.target.value })}/><button type="button" aria-pressed={showKey} onClick={() => setShowKey(value => !value)}>{showKey ? s.hide : s.show}</button></div>
          <p className="input-hint">{s.session}</p>
          <p className="input-hint">{providers[provider].requiresKey ? s.noKey : provider === 'openrouter' ? s.optionalKey : s.customKey}</p>
          <label htmlFor="base-url">{s.base}</label><input id="base-url" dir="ltr" value={provider === 'custom' ? config.baseUrl : providers[provider].baseUrl} readOnly={provider !== 'custom'} placeholder={s.customPlaceholder} onChange={event => updateConfig({ baseUrl: event.target.value, consent: false })}/>
          {provider === 'custom' && <p className="custom-warning">{s.customNote}</p>}
          <label className="check-label" htmlFor="request-consent"><input id="request-consent" type="checkbox" checked={config.consent} onChange={event => updateConfig({ consent: event.target.checked })}/><span>{s.consent}</span></label>
          <div className="field-actions">
            <button className="button primary" disabled={busy} onClick={() => void run('test')}>{s.connection}</button>
            <button className="button secondary" disabled={busy} onClick={() => void run('models')}>{s.fetch}</button>
            <button className="button secondary" disabled={!config.apiKey && !session.vault[provider]} onClick={async () => { cancel(); setFeedbackArea('provider'); const cleared=await session.forgetKey(provider); setShowKey(false); if(cleared){setError(null);setNotice('cleared');}else{setError('storage_error');setNotice('');} }}>{s.clear}</button>
            {busy && <button className="button secondary" onClick={() => { cancel(); setNotice('cancelled'); }}>{s.cancel}</button>}
          </div>
          {busy && <p className="request-status" role="status">{s.loading}</p>}
          {error && feedbackArea === 'provider' && <div className="request-error" role="alert"><p>{s.errors[error]}</p>{['network', 'timeout', 'rate_limit', 'quota', 'cors', 'upstream', 'invalid_response', 'unauthorized', 'forbidden'].includes(error) && <button className="button secondary" disabled={busy} onClick={() => void run(lastAction.current)}>{s.retry}</button>}</div>}
          {notice && feedbackArea === 'provider' && <p className="request-status" role="status">{s[notice]}</p>}
          {catalog && <div className="catalog-summary"><strong>{catalog.models.length} {s.modelCount}</strong><span>{s.lastSuccess}</span><span>{s.loadedAt}: <time dateTime={catalog.fetchedAt}>{new Date(catalog.fetchedAt).toLocaleString(workspace.locale === 'ar' ? 'ar-EG' : 'en-US')}</time></span><span>{s.generationUntested}</span></div>}
          <label htmlFor="model-search">{s.search}</label><input id="model-search" type="search" value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(30); }}/>
          <label htmlFor="capability">{s.filter}</label><select id="capability" value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setVisibleCount(30); }}><option value="all">{s.all}</option><option value="text">{s.text}</option><option value="vision">{s.vision}</option><option value="image_output">{s.images}</option></select>
          <label className="check-label" htmlFor="available-only"><input id="available-only" type="checkbox" checked={availableOnly} onChange={event => { setAvailableOnly(event.target.checked); setVisibleCount(30); }}/><span>{s.availableOnly}</span></label><p className="input-hint">{s.availabilityNote}</p>
          {!matching.length ? <div className="empty-catalog">{catalog ? s.noMatches : s.empty}</div> : <><p className="input-hint" aria-live="polite">{matching.length} {s.results}</p><ul className="model-list" aria-label={s.catalogLabel} tabIndex={0}>{matching.slice(0, visibleCount).map(model => <li key={model.id} data-testid="model-card"><strong>{model.name}</strong><code>{model.id}</code><div className="capability-badges">{model.capabilities.length ? model.capabilities.map(capability => <span key={capability}>{capability === 'text' && model.capabilityEvidence === 'method_only' ? s.textCandidate : s.capabilities[capability]}</span>) : <span>{s.unknownCapabilities}</span>}</div><small>{model.availability === 'available' ? s.available : model.availability === 'unavailable' ? s.unavailableModel : s.unknownAvailability}</small>{model.description && <p>{model.description}</p>}</li>)}</ul>{matching.length > visibleCount && <button className="button secondary" onClick={() => setVisibleCount(value => value + 30)}>{s.showMore}</button>}</>}
          <p className="input-hint">{s.catalogNote}</p>
          <CredentialVault key={provider}/>
        </section>
        <section id="setting-2" className="settings-card"><h2>{s.roles}</h2><p>{s.roleNote}</p><p className="input-hint">{s.methodNote}</p>
          <h3 className="settings-subtitle">{s.quickSetup} · {providerName(provider)}</h3><label htmlFor="quick-model">{s.quickLabel}</label><select id="quick-model" value={quickModel} onChange={event => setQuickModel(event.target.value)}><option value="">{s.noSelection}</option>{catalog?.models.filter(model => canUseRole(model, 'planner')).map(model => <option key={model.id} value={model.id}>{model.name} — {model.id}</option>)}</select><button className="button secondary role-action" disabled={!quickModel} onClick={useQuickModel}>{s.useText}</button>
          <details className="advanced-roles"><summary>{s.advanced}</summary><div className="role-grid">{roleIds.map(role => {
            const roleProvider = roles[role]?.provider ?? roleProviders[role] ?? provider;
            const selection = roles[role];
            const models = catalogs[roleProvider]?.models ?? [];
            return <div className="role-card" key={role}><h3>{roleLabel(role)}</h3><label htmlFor={`role-provider-${role}`}>{roleLabel(role)} {s.roleProvider}</label><select id={`role-provider-${role}`} value={roleProvider} onChange={event => { const next = event.target.value as ProviderId; setRoleProviders(previous => ({ ...previous, [role]: next })); assign(role, null); }}>
              {providerIds.map(id => <option key={id} value={id}>{providerName(id)}</option>)}</select><label htmlFor={`role-${role}`}>{roleLabel(role)} {s.model}</label><select id={`role-${role}`} value={selection?.modelId ?? ''} onChange={event => assign(role, event.target.value ? { provider: roleProvider, modelId: event.target.value } : null)}><option value="">{s.noSelection}</option>{selection && !selection.manual && !models.some(model=>model.id===selection.modelId) && <option value={selection.modelId}>{selection.modelId} · {s.savedOnly}</option>}{selection?.manual && <option value={selection.modelId}>{selection.modelId} · {s.manualBadge}</option>}{models.map(model => <option key={model.id} value={model.id} disabled={!canUseRole(model, role)}>{model.name}{!canUseRole(model, role) ? ` · ${s.notSupported}` : ''}</option>)}</select></div>;
          })}</div></details>
          <p className="input-hint">{s.imageOptional}</p>
          <details className="manual-fallback"><summary>{s.manualTitle}</summary><p>{s.manualNote}</p><label htmlFor="manual-id">{s.manualId} · {providerName(provider)}</label><input id="manual-id" dir="ltr" value={manualId} maxLength={240} autoComplete="off" spellCheck={false} onChange={event => setManualId(event.target.value)}/><label htmlFor="manual-role">{s.manualRole}</label><select id="manual-role" value={manualRole} onChange={event => setManualRole(event.target.value as ModelRole)}>{roleIds.filter(role => role !== 'image').map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}</select><label className="check-label" htmlFor="manual-ack"><input id="manual-ack" type="checkbox" checked={manualAck} onChange={event => setManualAck(event.target.checked)}/><span>{s.manualAck}</span></label><button className="button secondary" onClick={assignManual}>{s.manualAssign}</button></details>
          <p>{s.saveNote}</p><button className="button primary" disabled={savingSettings || !session.ready} onClick={()=>void save()}>{savingSettings ? m.common.saving : s.save}</button>
          {error && feedbackArea === 'roles' && <div className="request-error" role="alert"><p>{s.errors[error]}</p></div>}
          {notice && feedbackArea === 'roles' && <p className="request-status" role="status">{s[notice]}</p>}
          {savedRoles && <div className="saved-summary"><h3>{s.savedSummary}</h3>{roleIds.map(role => <p key={role}><b>{roleLabel(role)}:</b> {savedRoles[role] ? `${providerName(savedRoles[role]!.provider)} / ${savedRoles[role]!.modelId}` : s.noSelection}</p>)}</div>}
        </section>
        <StorageControls/>
        <section id="setting-4" className="settings-card"><h2>{s.protection}</h2><p>{s.protectionNote}</p></section>
        <section id="setting-5" className="settings-card"><h2>{s.about}</h2><p>{s.aboutNote}</p></section>
      </div>
    </div>
  </div>;
}
