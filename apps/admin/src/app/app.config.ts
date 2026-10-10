import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth-interceptor';
import { apiBaseUrlInterceptor } from './core/config/api-base-url-interceptor';
import { APP_CONFIG, type AppConfig } from './core/config/app-config';

export function appConfig(config: AppConfig): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      provideRouter(routes),
      // In this order: the token goes by the URL the base URL interceptor makes.
      provideHttpClient(withInterceptors([apiBaseUrlInterceptor, authInterceptor])),
      { provide: APP_CONFIG, useValue: config },
    ],
  };
}
