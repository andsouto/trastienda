import { InjectionToken } from '@angular/core';

/**
 * The deployment's settings, read from `config.json` before the app starts.
 */
export interface AppConfig {
  /**
   * Where the API is served from, with no trailing slash.
   */
  apiBaseUrl: string;

  /**
   * The admin's OIDC client ID at the identity provider.
   */
  clientId: string;

  /**
   * The identity provider's OIDC issuer URL.
   */
  issuer: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');

export async function loadAppConfig(url = 'config.json'): Promise<AppConfig> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`The admin's configuration did not load from ${url}: HTTP ${String(response.status)}`);
  }

  const config = await response.json() as Partial<Record<keyof AppConfig, unknown>>;

  return {
    apiBaseUrl: requireHttpUrl(config, 'apiBaseUrl').replace(/\/+$/, ''),
    clientId: requireString(config, 'clientId'),
    issuer: requireHttpUrl(config, 'issuer'),
  };
}

/**
 * Checked here rather than where it is used: the session worker builds its
 * owner from the issuer, and fails there without a word to the tabs. No query
 * or fragment either: the API's paths are appended to the base URL, and OpenID
 * Connect allows neither in an issuer.
 */
function requireHttpUrl(config: Partial<Record<keyof AppConfig, unknown>>, key: keyof AppConfig): string {
  const value = requireString(config, key);
  const url = URL.parse(value);

  if ((url?.protocol !== 'http:' && url?.protocol !== 'https:') || url.search !== '' || url.hash !== '') {
    throw new TypeError(`The admin's configuration has ${key} ${JSON.stringify(value)}, not an http(s) URL without query or fragment`);
  }

  return value;
}

function requireString(config: Partial<Record<keyof AppConfig, unknown>>, key: keyof AppConfig): string {
  const value = config[key];

  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`The admin's configuration has no ${key}`);
  }

  return value;
}
