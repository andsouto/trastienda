import { DOCUMENT } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { Auth } from './auth';

/**
Where the identity provider sends the user back after logging in.
*/
@Component({
  selector: 'app-callback',
  template: `
    @if (error(); as message) {
      <p role="alert">Could not log in: {{ message }}</p>
      <button type="button" (click)="retry()">Try again</button>
    } @else {
      <p>Logging in…</p>
    }
  `,
})
export class Callback {
  readonly #auth = inject(Auth);
  readonly #location = inject(DOCUMENT).location;
  readonly #router = inject(Router);

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.#complete();
  }

  async #complete(): Promise<void> {
    try {
      const returnTo = await this.#auth.completeLogin(new URL(this.#location.href));

      await this.#router.navigateByUrl(returnTo, { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected retry(): void {
    void this.#auth.login('/');
  }
}
