import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { Auth } from './core/auth/auth';
import { authInterceptor } from './core/auth/auth-interceptor';
import { APP_CONFIG, type AppConfig } from './core/config/app-config';
import { apiBaseUrlInterceptor } from './core/http/api-base-url-interceptor';

export function appConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      // In this order: the token goes by the URL the base URL interceptor makes.
      provideHttpClient(withInterceptors([apiBaseUrlInterceptor, authInterceptor])),
      { provide: APP_CONFIG, useValue: config },
      // The first route's guard asks whether there is a session, which only the
      // session's worker knows.
      provideAppInitializer(() => inject(Auth).ready),
    ],
  };
}
