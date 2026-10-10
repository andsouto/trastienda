import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from './auth';

/**
 * Where the identity provider sends the user back after logging in.
 */
@Component({
  selector: 'app-login-callback',
  templateUrl: './login-callback.html',
})
export class LoginCallback {
  readonly #auth = inject(Auth);
  readonly #location = inject(DOCUMENT).location;
  readonly #router = inject(Router);

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.#complete();
  }

  protected retry(): void {
    void this.#auth.login('/');
  }

  async #complete(): Promise<void> {
    try {
      const returnTo = await this.#auth.completeLogin(new URL(this.#location.href));

      await this.#router.navigateByUrl(returnTo, { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
