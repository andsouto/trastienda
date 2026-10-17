import { type Routes } from '@angular/router';

import { authGuard } from './core/auth/auth-guard';
import { Callback } from './core/auth/callback';
import { Home } from './home/home';

export const routes: Routes = [
  { component: Callback, path: 'auth/callback' },
  { canActivate: [authGuard], component: Home, path: '' },
  { path: '**', redirectTo: '' },
];
