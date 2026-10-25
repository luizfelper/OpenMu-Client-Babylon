import './style.less';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AppState, UIState } from '@/controllers/interface/uiState';
import { Session } from '@/modules/session';
import { Servers } from '@/modules/servers';
import { ServerConfig } from '@/modules/servers/serverConfig';
import { siteUrl } from '@/modules/site/site';
import { t } from '@/i18n';

/**
 * Ours: the server-information card shown once after a login, at the character
 * screen, in the spirit of Open.MU's welcome window. The public site owns the
 * words and numbers (`/api/site`); the client only draws them, with the active
 * profile and the selected channel as the fallback when the site is offline.
 */

type SiteFact = { label: string; value: string };

type SiteInfo = {
  site: {
    name: string;
    tagline: string;
  };
  server: {
    name: string;
    description: string;
    version: string;
    rates: { exp: string; drop: string; master: string };
    facts: SiteFact[];
  };
  social: { discord: string; instagram: string; youtube: string; whatsapp: string };
};

const EMPTY: SiteInfo = {
  site: { name: '', tagline: '' },
  server: {
    name: '',
    description: '',
    version: '',
    rates: { exp: '', drop: '', master: '' },
    facts: [],
  },
  social: { discord: '', instagram: '', youtube: '', whatsapp: '' },
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

function asFacts(value: unknown): SiteFact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asRecord)
    .map(fact => ({ label: asText(fact.label), value: asText(fact.value) }))
    .filter(fact => fact.label || fact.value)
    .slice(0, 6);
}

function parseSiteInfo(raw: unknown): SiteInfo {
  const root = asRecord(raw);
  const site = asRecord(root.site);
  const server = asRecord(root.server);
  const rates = asRecord(server.rates);
  const social = asRecord(root.social);

  return {
    site: {
      name: asText(site.name),
      tagline: asText(site.tagline),
    },
    server: {
      name: asText(server.name),
      description: asText(server.description),
      version: asText(server.version),
      rates: {
        exp: asText(rates.exp),
        drop: asText(rates.drop),
        master: asText(rates.master),
      },
      facts: asFacts(server.facts),
    },
    social: {
      discord: asText(social.discord),
      instagram: asText(social.instagram),
      youtube: asText(social.youtube),
      whatsapp: asText(social.whatsapp),
    },
  };
}

async function fetchSiteInfo(): Promise<SiteInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(siteUrl('/api/site'), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return EMPTY;
    return parseSiteInfo(await response.json());
  } catch {
    return EMPTY;
  } finally {
    clearTimeout(timeout);
  }
}

/** A new login flow gets the card again; a reconnect inside the world does not. */
let shownForLogin = false;

export const ServerWelcome = observer(() => {
  const state = AppState.uiState;
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<SiteInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state !== UIState.Characters) {
      // A new login flow gets the card again; leaving the character screen
      // (a reconnect, the world) closes it rather than floating over the game.
      if (state === UIState.Preloader || state === UIState.Login) shownForLogin = false;
      setOpen(false);
      return;
    }

    if (shownForLogin || Session.isOffline) return;

    shownForLogin = true;
    setOpen(true);
    setInfo(null);
    setLoading(true);
    void fetchSiteInfo().then(data => {
      setInfo(data);
      setLoading(false);
    });
  }, [state]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  const profile = ServerConfig.active;
  const serverName =
    info?.server.name || profile?.name || t('serverWelcome.defaultServer');
  const version =
    info?.server.version || profile?.version || t('serverWelcome.unknown');
  const channel =
    Servers.selectedServer?.channelName ||
    Servers.selectedServer?.name ||
    '';
  const siteName = info?.site.name || 'MUCURA';
  const tagline = info?.site.tagline || t('serverWelcome.eyebrow');
  const description = info?.server.description;
  const rates = info?.server.rates;
  const facts = info?.server.facts ?? [];
  const hasRates = !!(rates?.exp || rates?.drop || rates?.master);
  const discord = info?.social.discord;
  const website = siteUrl('/');

  return (
    <div
      className="server-welcome"
      role="dialog"
      aria-modal="true"
      aria-labelledby="server-welcome-title"
      onMouseDown={event => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="server-welcome-panel">
        <div className="server-welcome-eyebrow">
          {siteName}
          {tagline ? <span>{tagline}</span> : null}
        </div>

        <h2 id="server-welcome-title" className="server-welcome-title">
          {t('serverWelcome.title', { server: serverName })}
        </h2>
        <p className="server-welcome-subtitle">
          {t('serverWelcome.subtitle')}
        </p>

        <div className="server-welcome-chips">
          <div className="server-welcome-chip">
            <span>{t('serverWelcome.version')}</span>
            <strong>{version}</strong>
          </div>
          {channel ? (
            <div className="server-welcome-chip">
              <span>{t('serverWelcome.channel')}</span>
              <strong>{channel}</strong>
            </div>
          ) : null}
        </div>

        {hasRates ? (
          <div className="server-welcome-rates">
            <div>
              <span>{t('serverWelcome.exp')}</span>
              <strong>{rates?.exp || '—'}</strong>
            </div>
            <div>
              <span>{t('serverWelcome.drop')}</span>
              <strong>{rates?.drop || '—'}</strong>
            </div>
            <div>
              <span>{t('serverWelcome.master')}</span>
              <strong>{rates?.master || '—'}</strong>
            </div>
          </div>
        ) : null}

        {description ? (
          <p className="server-welcome-text">{description}</p>
        ) : null}

        {facts.length ? (
          <ul className="server-welcome-facts">
            {facts.map((fact, index) => (
              <li key={`${fact.label}-${index}`}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </li>
            ))}
          </ul>
        ) : null}

        {loading ? (
          <div className="server-welcome-loading">
            {t('serverWelcome.loading')}
          </div>
        ) : null}

        <div className="server-welcome-actions">
          <button
            type="button"
            className="is-primary"
            onClick={() => setOpen(false)}
          >
            {t('serverWelcome.enter')}
          </button>
          <a href={website} target="_blank" rel="noreferrer">
            {t('serverWelcome.site')}
          </a>
          {discord ? (
            <a href={discord} target="_blank" rel="noreferrer">
              {t('serverWelcome.discord')}
            </a>
          ) : null}
        </div>

        <button
          type="button"
          className="server-welcome-close"
          aria-label={t('serverWelcome.close')}
          title={t('serverWelcome.close')}
          onClick={() => setOpen(false)}
        >
          ×
        </button>
      </div>
    </div>
  );
});
