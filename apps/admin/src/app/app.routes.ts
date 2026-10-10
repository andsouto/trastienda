import { type Routes } from '@angular/router';

import { authGuard } from './core/auth/auth-guard';
import { LoggedOut } from './core/auth/logged-out';
import { LoginCallback } from './core/auth/login-callback';
import { LOGGED_OUT_PATH } from './core/auth/session/session-protocol';
import { Home } from './home/home';

export const routes: Routes = [
  { component: LoginCallback, path: 'auth/callback' },
  { component: LoggedOut, path: LOGGED_OUT_PATH.slice(1) },
  { canActivate: [authGuard], component: Home, path: '' },
  { path: '**', redirectTo: '' },
];
