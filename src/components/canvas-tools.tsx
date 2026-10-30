'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useMessages } from './workspace';
import { clampOneshotElement, type OneshotCanvasElement } from '@/lib/ai/oneshot';
import { ICONS, iconSvg, iconPng, textOn, type IconId } from '@/lib/oneshot/icons';
import { alignToFrame, moveLayer, type Alignment } from '@/lib/oneshot/snap';
import { BRAND_FONTS } from '@/lib/brand/fonts';

/** The schema's cap on mockup elements; the tools stop adding at this count. */
export const MAX_ELEMENTS = 20;

const ARABIC = /[؀-ۿ]/;
type Badge = 'price' | 'discount' | 'cta';
const BADGE_BOX: Record<Badge, { width: number; height: number; fontSize: number; x: number; y: number }> = {
  price: { width: 320, height: 120, fontSize: 54, x: 680, y: 1020 },
  discount: { width: 230, height: 230, fontSize: 60, x: 790, y: 420 },
  cta: { width: 440, height: 110, fontSize: 46, x: 320, y: 1180 },
};

/**
 * The arrange step's extra tools: layers, the icon library, price/discount/
 * button badges, text styling and alignment. Everything here changes only
 * the local mockup; no tool makes a request.
 */
export function CanvasTools({ elements, setElements, selected, setSelected, colors, disabled, headlineFont, setHeadlineFont, loadFont }: {
  elements: OneshotCanvasElement[]; setElements: Dispatch<SetStateAction<OneshotCanvasElement[]>>;
  selected: string | null; setSelected: (id: string | null) => void; colors: readonly string[]; disabled: boolean;
  headlineFont: string | null; setHeadlineFont: (family: string | null) => void; loadFont: (family: string) => void;
}) {
  const t = useMessages().oneshot;
  const [iconColor, setIconColor] = useState(colors[0] ?? '#16100C');
  const [badgeText, setBadgeText] = useState('');
  const full = elements.length >= MAX_ELEMENTS;
  const current = elements.find(item => item.id === selected) ?? null;
  const isText = !!current && (current.kind === 'text' || current.kind === 'phone');
  const swatches = [...new Set([...colors, '#16100C', '#FFFFFF'].map(color => color.toUpperCase()))];
  const update = (id: string, values: Partial<OneshotCanvasElement>) => setElements(previous => previous.map(item => item.id === id ? { ...item, ...values } : item));
  const add = (element: OneshotCanvasElement) => { if (full) return; setElements(previous => previous.length >= MAX_ELEMENTS ? previous : [...previous, element]); setSelected(element.id); };

  async function addIcon(id: IconId) {
    if (full || disabled) return;
    const blob = await iconPng(id, iconColor);
    add({ id: crypto.randomUUID(), kind: 'icon', x: 60, y: 1140, width: 150, height: 150, blob });
  }
  function addBadge(badge: Badge) {
    const text = badgeText.trim(); if (!text || full) return;
    const fill = colors[0] ?? '#16100C', box = BADGE_BOX[badge];
    add({ id: crypto.randomUUID(), kind: 'text', badge, text, ...box, fill, color: textOn(fill), bold: true });
    setBadgeText('');
  }
  const kindLabel = (item: OneshotCanvasElement) => item.badge ? t[`badge_${item.badge}`] : t[`layer_${item.kind}`];
  const layerName = (item: OneshotCanvasElement) => item.text?.trim() ? `${kindLabel(item)}: ${item.text.trim().slice(0, 28)}` : kindLabel(item);
  const script = current && ARABIC.test(current.text ?? '') ? 'arabic' : 'latin';
  const fontValue = current?.id === 'headline' ? headlineFont ?? '' : current?.fontFamily ?? '';

  return <div className="canvas-tools" data-testid="canvas-tools">
    <section className="tool-block" aria-labelledby="tool-layers">
      <div className="tool-head"><h3 id="tool-layers">{t.layersTitle}</h3><span data-testid="layer-count">{elements.length}/{MAX_ELEMENTS}</span></div>
      <ol className="layer-list" data-testid="layer-list">
        {[...elements].reverse().map((item, index) => <li key={item.id} className={item.id === selected ? 'is-selected' : ''}>
          <button type="button" className="layer-name" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>{layerName(item)}</button>
          <span className="layer-actions">
            <button type="button" aria-label={`${t.layerUp}: ${layerName(item)}`} disabled={disabled || index === 0} onClick={() => setElements(previous => moveLayer(previous, item.id, 'up'))}>↑</button>
            <button type="button" aria-label={`${t.layerDown}: ${layerName(item)}`} disabled={disabled || index === elements.length - 1} onClick={() => setElements(previous => moveLayer(previous, item.id, 'down'))}>↓</button>
            {item.kind !== 'product' && <button type="button" aria-label={`${t.layerDelete}: ${layerName(item)}`} disabled={disabled} onClick={() => { setElements(previous => previous.filter(entry => entry.id !== item.id)); if (selected === item.id) setSelected(null); }}>✕</button>}
          </span>
        </li>)}
      </ol>
      {full && <p className="tool-note" role="status">{t.layersFull}</p>}
    </section>

    {current && <section className="tool-block" aria-labelledby="tool-align">
      <h3 id="tool-align">{t.alignTitle}</h3>
      <div className="tool-row" role="group" aria-label={t.alignTitle}>
        {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as Alignment[]).map(alignment => <button key={alignment} type="button" className="tool-chip" disabled={disabled} onClick={() => update(current.id, clampOneshotElement({ ...current, ...alignToFrame(current, alignment) }))}>{t[`align_${alignment}`]}</button>)}
      </div>
    </section>}

    {isText && current && <section className="tool-block" aria-labelledby="tool-text" data-testid="text-style">
      <h3 id="tool-text">{t.textStyleTitle}</h3>
      <div className="tool-grid">
        <label className="tool-field">{t.textColor}<input type="color" value={/^#[\da-f]{6}$/i.test(current.color ?? '') ? current.color : '#16100C'} disabled={disabled} onChange={event => update(current.id, { color: event.target.value })} /></label>
        {current.badge && <label className="tool-field">{t.badgeColor}<input type="color" value={/^#[\da-f]{6}$/i.test(current.fill ?? '') ? current.fill : '#16100C'} disabled={disabled} onChange={event => update(current.id, { fill: event.target.value, color: textOn(event.target.value) })} /></label>}
        <div className="tool-field tool-wide"><span aria-hidden="true">{t.textSize} <output>{current.fontSize ?? 64}</output></span><input type="range" aria-label={t.textSize} min={20} max={160} step={2} value={current.fontSize ?? 64} disabled={disabled} onChange={event => update(current.id, { fontSize: Number(event.target.value) })} /></div>
        <label className="tool-field tool-wide">{t.textFont}<select value={fontValue} disabled={disabled} onChange={event => {
          const family = event.target.value || null;
          if (family) loadFont(family);
          if (current.id === 'headline') setHeadlineFont(family); else update(current.id, { fontFamily: family ?? undefined });
        }}>
          <option value="">{t.textFontDefault}</option>
          {BRAND_FONTS.filter(font => font.script === script).map(font => <option key={font.family} value={font.family}>{font.family}</option>)}
        </select></label>
      </div>
      <div className="tool-row">
        <button type="button" className="tool-chip" aria-pressed={!!current.bold} disabled={disabled} onClick={() => update(current.id, { bold: !current.bold })}><b>{t.textBold}</b></button>
        {!current.badge && <span className="tool-segment" role="group" aria-label={t.textAlign}>
          {(['left', 'center', 'right'] as const).map(align => <button key={align} type="button" className="tool-chip" aria-pressed={(current.align ?? 'center') === align} disabled={disabled} onClick={() => update(current.id, { align })}>{t[`textAlign_${align}`]}</button>)}
        </span>}
      </div>
    </section>}

    <section className="tool-block" aria-labelledby="tool-badges">
      <h3 id="tool-badges">{t.badgesTitle}</h3>
      <p className="tool-note">{t.badgesHint}</p>
      <input className="tool-input" aria-label={t.badgeText} value={badgeText} maxLength={40} dir="auto" placeholder={t.badgePlaceholder} onChange={event => setBadgeText(event.target.value)} />
      <div className="tool-row">
        {(['price', 'discount', 'cta'] as Badge[]).map(badge => <button key={badge} type="button" className={`tool-chip badge-chip badge-${badge}`} disabled={disabled || full || !badgeText.trim()} onClick={() => addBadge(badge)}>{t[`badgeAdd_${badge}`]}</button>)}
      </div>
    </section>

    <section className="tool-block" aria-labelledby="tool-icons">
      <h3 id="tool-icons">{t.iconsTitle}</h3>
      <div className="tool-row" role="radiogroup" aria-label={t.iconColor}>
        {swatches.map(color => <button key={color} type="button" role="radio" aria-checked={iconColor.toUpperCase() === color} aria-label={color} className="icon-swatch" style={{ background: color }} onClick={() => setIconColor(color)} />)}
      </div>
      <div className="icon-grid">
        {ICONS.map(icon => <button key={icon.id} type="button" className="icon-pick" aria-label={`${t.iconAdd}: ${t[`icon_${icon.id}`]}`} title={t[`icon_${icon.id}`]} disabled={disabled || full} onClick={() => void addIcon(icon.id)}>
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(icon.id, iconColor))}`} alt="" />
        </button>)}
      </div>
    </section>
  </div>;
}
