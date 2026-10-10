import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadAppConfig } from './app/core/config/app-config';

try {
  await bootstrapApplication(App, appConfig(await loadAppConfig()));
} catch (error) {
  console.error(error);
}
