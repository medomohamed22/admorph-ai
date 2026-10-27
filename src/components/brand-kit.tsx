'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useMessages, useWorkspace } from './workspace';
import { Logo } from './logo';
import { brandInputSchema, type Brand, type BrandInput } from '@/lib/db/schema';
import { BrandError, MAX_BACKUP_BYTES, parseBrandBackup, makeBrandBackup, downloadBrand, validateLogoDimensions, type BrandErrorCode } from '@/lib/brand/backup';
import { themeColors } from '@/lib/brand/theme';
import {LogoOptions} from './logo-options';
import {defaultLogoPlacement} from '@/lib/editor/logo-placement';
import {BrandExtraction} from './brand-extraction';

export function BrandForm({ previous, onDone }: { previous?: Brand; onDone?: () => void }) {
  const m = useMessages(), s = m.brands; const workspace = useWorkspace(); const router = useRouter();
  const {setPreviewColors, setBrandDraft} = workspace;
  const [name, setName] = useState(previous?.name ?? workspace.brandDraft?.name ?? '');
  const [draftBrand, setDraftBrand] = useState(previous);
  const [description, setDescription] = useState(previous?.description ?? workspace.brandDraft?.description ?? '');
  const [colors, setColors] = useState<BrandInput['colors']>(previous?.colors ?? workspace.brandDraft?.colors ?? ['#d95736', '#dce5bb', '#62547f']);
  const [logoPlacement,setLogoPlacement]=useState(previous?.logoPlacement??workspace.brandDraft?.logoPlacement??defaultLogoPlacement),[logoAspectRatio,setLogoAspectRatio]=useState(previous?.logoAspectRatio??workspace.brandDraft?.logoAspectRatio??1);
  const [identity,setIdentity]=useState({brandTone:previous?.brandTone??workspace.brandDraft?.brandTone??'',shortDescriptionEn:previous?.shortDescriptionEn??workspace.brandDraft?.shortDescriptionEn??'',shortDescriptionAr:previous?.shortDescriptionAr??workspace.brandDraft?.shortDescriptionAr??'',recommendedFontEn:'Inter' as const,recommendedFontAr:'Cairo' as const});
  const [logo, setLogo] = useState<Blob | null>(() => previous ? workspace.assets.find(asset => asset.id === previous.logoAssetId)?.blob ?? null : workspace.brandDraft?.logo ?? null);
  const [busy, setBusy] = useState(false); const [logoBusy, setLogoBusy] = useState(false);
  const [error, setError] = useState<BrandErrorCode | 'storageError' | null>(null);
  const [notice, setNotice] = useState<'saved' | 'savedEphemeral' | 'exported' | null>(null);
  const logoVersion = useRef(0);
  const logoInput = useRef<HTMLInputElement>(null);
  const validColors = colors.every(color => /^#[0-9a-f]{6}$/i.test(color));
  const theme = themeColors(validColors ? colors : ['#d95736', '#dce5bb', '#62547f']);
  useEffect(() => {
    setPreviewColors(colors.every(color => /^#[0-9a-f]{6}$/i.test(color)) ? colors : null);
    return () => setPreviewColors(null);
  }, [colors, setPreviewColors]);
  useEffect(() => () => { logoVersion.current++; }, []);
  useEffect(() => { if (!previous) setBrandDraft({ name, description, colors, logo,logoPlacement,logoAspectRatio,...identity }); }, [name, description, colors, logo,logoPlacement,logoAspectRatio,identity, previous, setBrandDraft]);
  async function chooseLogo(file: File | undefined) {
    if (!file) return;
    const version = ++logoVersion.current; setLogoBusy(true); setError(null);
    try { await validateLogoDimensions(file); if (version === logoVersion.current) setLogo(file); }
    catch (failure) { if (version === logoVersion.current) setError(failure instanceof BrandError ? failure.code : 'invalidLogo'); }
    finally { if (version === logoVersion.current) setLogoBusy(false); }
  }
  function values() {
    const parsed = brandInputSchema.safeParse({ name, description, colors, logoPlacement, logoAspectRatio, ...identity });
    if (!parsed.success) throw new BrandError('invalidBrand');
    return parsed.data;
  }
  async function save() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await workspace.commitBrand(values(), logo, draftBrand);
      setDraftBrand(result.brand);
      setBrandDraft(null);
      setNotice(result.persisted ? 'saved' : 'savedEphemeral');
      if (result.persisted) { if (onDone) onDone(); else router.push('/brands'); }
    } catch (failure) { setError(failure instanceof BrandError ? failure.code : 'storageError'); }
    finally { setBusy(false); }
  }
  async function exportDraft() {
    setError(null); setNotice(null);
    try { downloadBrand(await makeBrandBackup(values(), logo)); setNotice('exported'); }
    catch (failure) { setError(failure instanceof BrandError ? failure.code : 'invalidBrand'); }
  }
  function cancel() { if (onDone) onDone(); else { setBrandDraft(null); router.push('/brands'); } }
  return <section className="brand-page"><div className="page-heading"><span className="eyebrow">{s.eyebrow}</span><h1>{previous ? s.editTitle : s.newTitle}</h1><p>{s.formNote}</p><p className="input-hint">{s.draftNote}</p></div>
    <div className="brand-builder"><form className="brand-fields settings-card" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
      <BrandExtraction onAccept={value=>{setName(value.suggestedName);setDescription(workspace.locale==='ar'?value.shortDescriptionAr:value.shortDescriptionEn);setColors([value.primaryHex,value.secondaryHex,value.accentHex]);setIdentity({brandTone:value.brandTone,shortDescriptionEn:value.shortDescriptionEn,shortDescriptionAr:value.shortDescriptionAr,recommendedFontEn:value.recommendedFontEn,recommendedFontAr:value.recommendedFontAr});}}/>
      <label htmlFor="brand-name">{s.name}</label><input id="brand-name" value={name} maxLength={80} placeholder={s.namePlaceholder} onChange={event => setName(event.target.value)}/>
      <label htmlFor="brand-description">{s.descriptionLabel}</label><textarea id="brand-description" value={description} maxLength={500} rows={4} placeholder={s.descriptionPlaceholder} onChange={event => setDescription(event.target.value)}/>
      <label htmlFor="brand-logo">{s.logo}</label><input ref={logoInput} id="brand-logo" hidden tabIndex={-1} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void chooseLogo(event.target.files?.[0]); event.target.value = ''; }}/><button type="button" className="button secondary" onClick={() => logoInput.current?.click()}>{s.chooseLogo}</button><p className="input-hint">{s.logoHint}</p>
      {logo && <div className="logo-row"><Logo blob={logo} alt={s.logoAlt}/><button type="button" className="text-button" onClick={() => { logoVersion.current++; setLogo(null); setLogoBusy(false); }}>{s.removeLogo}</button></div>}
      <LogoOptions value={logoPlacement} onChange={setLogoPlacement} blob={logo} onAspect={setLogoAspectRatio}/>
      {(['brandTone','shortDescriptionEn','shortDescriptionAr'] as const).map(field=><label key={field}>{m.meta[field]}<textarea maxLength={field==='brandTone'?120:500} value={identity[field]} onChange={e=>setIdentity(current=>({...current,[field]:e.target.value}))}/></label>)}<p>{m.meta.fonts}: Inter / Cairo</p>
      <fieldset className="palette-fields"><legend>{s.palette}</legend>{(['primary', 'secondary', 'accent'] as const).map((key, index) => <div key={key}>
        <label htmlFor={`brand-color-${index}`}>{s[key]}</label><div className="palette-input"><input id={`brand-color-${index}`} type="color" value={/^#[0-9a-f]{6}$/i.test(colors[index]) ? colors[index] : '#000000'} onChange={event => setColors(current => current.map((color, i) => i === index ? event.target.value : color) as BrandInput['colors'])}/><input dir="ltr" aria-label={`${s[key]} ${s.hex}`} value={colors[index]} maxLength={7} onChange={event => setColors(current => current.map((color, i) => i === index ? event.target.value : color) as BrandInput['colors'])}/></div>
      </div>)}</fieldset>
      <div className="field-actions"><button type="submit" className="button primary" disabled={busy || logoBusy || workspace.phase === 'loading'}>{busy ? m.common.saving : previous ? s.update : s.save}</button><button type="button" className="button secondary" disabled={busy || logoBusy} onClick={() => void exportDraft()}>{s.export}</button><button type="button" className="button secondary" disabled={busy} onClick={cancel}>{m.common.cancel}</button></div>
      {logoBusy && <p role="status">{m.common.loading}</p>}{error && <p className="request-error" role="alert">{error === 'storageError' ? m.common.storageError : s.errors[error]}</p>}{notice && <p className="request-status" role="status">{s[notice]}</p>}
    </form><aside className="brand-preview"><span className="eyebrow">{s.preview}</span><div className="theme-preview" style={{ '--preview-primary': theme.primary, '--preview-fg': theme.foreground, '--preview-secondary': theme.secondary, '--preview-secondary-fg': theme.secondaryForeground, '--preview-accent': theme.accent } as React.CSSProperties}>
      <div className="preview-sidebar"><Logo blob={logo} alt={s.logoAlt}/><strong>{name || s.name}</strong><span>{s.previewSide}</span><span className="preview-nav">{s.previewTab}</span></div>
      <div className="preview-content"><span className="eyebrow">{s.previewTab}</span><h2>{s.previewTitle}</h2><p>{description || s.previewNote}</p><span className="preview-button">{s.previewButton} ↗</span><div className="preview-swatches">{colors.map((color, i) => <span key={i} style={{ background: /^#[0-9a-f]{6}$/i.test(color) ? color : '#eeeeee' }}/>)}</div></div>
    </div><p>{s.previewNote}</p><p className="input-hint">{s.scope}</p></aside></div>
  </section>;
}

export function BrandLibrary() {
  const m = useMessages(), s = m.brands; const workspace = useWorkspace();
  const [editing, setEditing] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<'imported' | 'exported' | 'deleted' | 'savedEphemeral' | null>(null);
  const [error, setError] = useState<BrandErrorCode | 'storageError' | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  async function importBrand(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new BrandError('backupSize');
      const parsed = await parseBrandBackup(await file.text());
      if (parsed.logo) await validateLogoDimensions(parsed.logo);
      const result = await workspace.commitBrand(parsed.brand, parsed.logo);
      setNotice(result.persisted ? 'imported' : 'savedEphemeral');
    } catch (failure) { setError(failure instanceof BrandError ? failure.code : 'storageError'); }
    finally { setBusy(false); }
  }
  async function exportBrand(brand: Brand) {
    setError(null); setNotice(null);
    try {
      const input = brandInputSchema.strip().parse(brand);
      const logo = workspace.assets.find(asset => asset.id === brand.logoAssetId)?.blob ?? null;
      downloadBrand(await makeBrandBackup(input, logo)); setNotice('exported');
    } catch (failure) { setError(failure instanceof BrandError ? failure.code : 'storageError'); }
  }
  async function deleteBrand(brand: Brand) {
    if (!window.confirm(s.deleteConfirm)) return;
    setError(null); setNotice(null);
    if (await workspace.deleteBrand(brand)) setNotice('deleted'); else setError('storageError');
  }
  if (editing) return <BrandForm key={editing.id} previous={editing} onDone={() => setEditing(null)}/>;
  return <section className="brand-page"><div className="page-heading"><span className="eyebrow">{s.eyebrow}</span><h1>{s.title}</h1><p>{s.description}</p><div className="field-actions"><Link href="/brands/new" className="button primary">{s.create} ↗</Link><button className="button secondary" disabled={busy || workspace.phase === 'loading'} onClick={() => importInput.current?.click()}>{s.import}</button>{workspace.activeBrand && <button className="button secondary" onClick={() => void workspace.activateBrand(null)}>{s.resetTheme}</button>}</div>
      <input ref={importInput} id="brand-import" aria-label={s.import} type="file" accept="application/json,.json" hidden onChange={event => { void importBrand(event.target.files?.[0]); event.target.value = ''; }}/>
    </div>
    {busy && <p role="status">{m.common.saving}</p>}{error && <p className="request-error" role="alert">{error === 'storageError' ? m.common.storageError : s.errors[error]}</p>}{notice && <p className="request-status" role="status">{s[notice]}</p>}
    {workspace.phase !== 'loading' && !workspace.brands.length && <div className="empty-brands"><span className="shell-art" aria-hidden="true">✳</span><h2>{s.empty}</h2><p>{s.emptyNote}</p></div>}
    <div className="brand-library">{workspace.brands.map(brand => <article className="brand-library-card" key={brand.id} data-testid="brand-card"><div className="brand-card-top"><Logo blob={workspace.assets.find(asset => asset.id === brand.logoAssetId)?.blob ?? null} alt={s.logoAlt}/>{workspace.activeBrand?.id === brand.id && <span className="active-badge">{s.active}</span>}</div><h2>{brand.name}</h2><p>{brand.description}</p><div className="brand-swatches" aria-label={s.colors}>{brand.colors.map((color, i) => <span key={i}><i style={{ background: color }}/><code dir="ltr">{color}</code></span>)}</div><div className="field-actions"><button className="button primary" disabled={workspace.activeBrand?.id === brand.id} onClick={() => void workspace.activateBrand(brand.id)}>{s.activate}</button><button className="button secondary" onClick={() => setEditing(brand)}>{s.edit}</button><button className="button secondary" onClick={() => void exportBrand(brand)}>{s.export}</button><button className="text-button danger" onClick={() => void deleteBrand(brand)}>{s.delete}</button></div></article>)}</div>
    <p className="input-hint">{s.scope}</p>
  </section>;
}
