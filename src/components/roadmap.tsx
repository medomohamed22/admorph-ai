'use client';
import type { CSSProperties, ReactNode } from 'react';
import { useMessages } from './workspace';
import { Button, Card } from './ui';
import { IconChart, IconChat, IconPlug, IconSend, IconVideo } from './ui/icons';

/** The five features built next, in order. Shown on the home page and, as connections, in Settings. */
export const ROADMAP = ['publish', 'whatsapp', 'video', 'insights', 'agents'] as const;
export type RoadmapItem = (typeof ROADMAP)[number];
const ICONS: Record<RoadmapItem, (size: number) => ReactNode> = {
  publish: size => <IconSend size={size} />,
  whatsapp: size => <IconChat size={size} />,
  video: size => <IconVideo size={size} />,
  insights: size => <IconChart size={size} />,
  agents: size => <IconPlug size={size} />,
};

/** Home page: what comes next. Informational only: nothing here is clickable. */
export function RoadmapSection() {
  const r = useMessages().roadmap;
  return <section className="home-roadmap" aria-labelledby="home-roadmap-title" data-testid="home-roadmap">
    <div className="home-roadmap-head">
      <h2 id="home-roadmap-title">{r.title}</h2>
      <p>{r.lead}</p>
    </div>
    <ol>
      {ROADMAP.map((key, index) => <li key={key} data-testid="roadmap-item" data-item={key} style={{ '--i': index } as CSSProperties}>
        <span className="roadmap-icon" aria-hidden="true">{ICONS[key](20)}</span>
        <div>
          <h3>{r.items[key].title}</h3>
          <p>{r.items[key].body}</p>
        </div>
        <span className="soon-badge">{r.badge}</span>
      </li>)}
    </ol>
  </section>;
}

/** Settings: the accounts AdMorph will connect to. Every button is disabled and says it is coming soon. */
export function ConnectionsCard() {
  const r = useMessages().roadmap;
  const items = ['publish', 'whatsapp', 'insights', 'agents'] as const;
  return <Card className="settings-card connections-card" data-testid="connections">
    <h2 className="section-title with-icon"><IconPlug size={18} />{r.connectionsTitle}</h2>
    <p className="section-note">{r.connectionsLead}</p>
    <ul className="connections-list">
      {items.map(key => <li key={key} data-testid="connection" data-item={key}>
        <span className="roadmap-icon" aria-hidden="true">{ICONS[key](18)}</span>
        <div><strong>{r.connections[key].name}</strong><span>{r.connections[key].note}</span></div>
        <Button size="sm" disabled aria-label={`${r.connect} ${r.connections[key].name}: ${r.badge}`}>{r.connect} · {r.badge}</Button>
      </li>)}
    </ul>
  </Card>;
}
