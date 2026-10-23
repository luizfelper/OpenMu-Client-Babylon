// The public site's VIP page, opened from the in-game system menus.
//
// The URL is baked at build time by the installer (`VITE_SITE_URL`). The derivation below is only
// a fallback for a client built without that argument: play.<domain> -> site.<domain>, and a
// plain client origin -> the site's IP-mode port.

const CONFIGURED = (import.meta.env?.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '');

export function siteUrl(path = '/'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (CONFIGURED) return `${CONFIGURED}${suffix}`;
  if (typeof window === 'undefined') return `http://localhost:3400${suffix}`;
  const { protocol, hostname } = window.location;
  if (hostname.startsWith('play.')) return `${protocol}//site.${hostname.slice('play.'.length)}${suffix}`;
  return `${protocol}//${hostname}:8082${suffix}`;
}

/** Opens the VIP store in a new tab. A blocked popup simply does nothing, like the other menus. */
export function openVipStore(): void {
  const opener = (
    globalThis as {
      open?: (url?: string | URL, target?: string, features?: string) => unknown;
    }
  ).open;
  if (typeof opener === 'function') opener(siteUrl('/vip'), '_blank', 'noopener,noreferrer');
}
