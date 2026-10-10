import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from './auth';

/**
 * Where every tab lands after a logout. It does not log in by itself: the user
 * just logged out, and asks to come back. A login from another tab brings this
 * one back too.
 */
@Component({
  selector: 'app-logged-out',
  templateUrl: './logged-out.html',
})
export class LoggedOut {
  readonly #auth = inject(Auth);
  readonly #router = inject(Router);

  constructor() {
    effect(() => {
      if (this.#auth.isAuthenticated()) {
        void this.#router.navigateByUrl('/', { replaceUrl: true });
      }
    });
  }

  protected login(): void {
    void this.#auth.login('/');
  }
}
