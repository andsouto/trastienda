import { InjectionToken } from '@angular/core';

/**
 * What changes from one deployment to the next, read from `config.json` next to
 * `index.html` before the app starts: a published build cannot know its
 * identity provider or where its API lives. In development `process-compose up`
 * writes it (apps/api/scripts/provision-idp.ts).
 */
export interface AppConfig {
  /**
  Where the API is served from, with no trailing slash.
  */
  apiBaseUrl: string;
  /**
  The admin's OIDC client ID at the identity provider.
  */
  clientId: string;
  /**
  The identity provider's OIDC issuer URL.
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
    apiBaseUrl: requireString(config, 'apiBaseUrl').replace(/\/+$/, ''),
    clientId: requireString(config, 'clientId'),
    issuer: requireString(config, 'issuer'),
  };
}

function requireString(config: Partial<Record<keyof AppConfig, unknown>>, key: keyof AppConfig): string {
  const value = config[key];

  if (typeof value !== 'string' || value === '') {
    throw new TypeError(`The admin's configuration has no ${key}`);
  }

  return value;
}
