import { inject } from '@angular/core';
import { type CanActivateFn } from '@angular/router';

import { Auth } from './auth';

/**
Lets a route open with a session; without one, leaves to log in and comes back to it.
*/
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);

  if (auth.isAuthenticated()) {
    return true;
  }

  await auth.login(state.url);

  return false;
};
