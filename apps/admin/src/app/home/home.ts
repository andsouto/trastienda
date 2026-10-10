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
  template: `
    <h1>trastienda</h1>

    @if (auth.session(); as session) {
      <p>
        Logged in as {{ session.user.name ?? session.user.email ?? session.user.subject }}.
        @if (session.expiresAt) {
          The access token is valid until {{ session.expiresAt | date: 'mediumTime' }}.
        }
      </p>
    }

    <h2>GET /me</h2>
    @if (me.error(); as error) {
      <p role="alert">{{ error.message }}</p>
    } @else if (me.hasValue()) {
      <pre>{{ me.value() | json }}</pre>
    } @else {
      <p>Loading…</p>
    }

    <button type="button" (click)="me.reload()">Call /me again</button>
    <button type="button" (click)="logout()">Log out</button>
  `,
})
export class Home {
  protected readonly auth = inject(Auth);
  protected readonly me = getMeResource();

  protected logout(): void {
    void this.auth.logout();
  }
}
