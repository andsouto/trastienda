import { TestBed } from '@angular/core/testing';
import { type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';

import { Auth } from './auth';
import { authGuard } from './auth-guard';

function guard(isAuthenticated: boolean) {
  const login = vi.fn(() => Promise.resolve());

  TestBed.configureTestingModule({
    providers: [{ provide: Auth, useValue: { isAuthenticated: () => isAuthenticated, login } }],
  });

  const result = TestBed.runInInjectionContext(async () =>
    authGuard({} as ActivatedRouteSnapshot, { url: '/products?page=2' } as RouterStateSnapshot));

  return { login, result };
}

it('opens the route with a session', async () => {
  const { login, result } = guard(true);

  await expect(result).resolves.toBe(true);
  expect(login).not.toHaveBeenCalled();
});

it('without a session, leaves to log in and asks to come back to the route', async () => {
  const { login, result } = guard(false);

  await expect(result).resolves.toBe(false);
  expect(login).toHaveBeenCalledWith('/products?page=2');
});
