import { DatePipe, JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { getMeResource } from '../core/api/system/system.resource';
import { Auth } from '../core/auth/auth';

/**
 * Proof that login works end to end: who the ID token says the user is, and
 * what the API makes of the access token. Calling /me again after the token
 * expires shows the renewal at work.
 */
@Component({
  imports: [DatePipe, JsonPipe],
  selector: 'app-home',
  templateUrl: './home.html',
})
export class Home {
  protected readonly auth = inject(Auth);
  protected readonly me = getMeResource();

  protected logout(): void {
    void this.auth.logout();
  }
}
