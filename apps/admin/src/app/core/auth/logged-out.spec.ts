import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Auth } from './auth';
import { LoggedOut } from './logged-out';

async function open() {
  const isAuthenticated = signal(false);
  const auth = { isAuthenticated, login: vi.fn(() => Promise.resolve()) };

  TestBed.configureTestingModule({
    imports: [LoggedOut],
    providers: [provideRouter([]), { provide: Auth, useValue: auth }],
  });

  const fixture = TestBed.createComponent(LoggedOut);
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

  await fixture.whenStable();

  return { auth, fixture, isAuthenticated, navigate };
}

it('logs in again only when asked', async () => {
  const { auth, fixture } = await open();

  expect(auth.login).not.toHaveBeenCalled();

  (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

  expect(auth.login).toHaveBeenCalledWith('/');
});

it('goes back to the app when another tab logs in', async () => {
  const { fixture, isAuthenticated, navigate } = await open();

  isAuthenticated.set(true);
  await fixture.whenStable();

  expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
});
