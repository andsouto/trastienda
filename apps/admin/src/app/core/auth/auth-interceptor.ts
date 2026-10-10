import { type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { APP_CONFIG } from '../config/app-config';
import { Auth } from './auth';

/**
 * Puts the access token on requests to the API, and only on those: never on
 * the identity provider's or anyone else's.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const isForApi = request.url.startsWith(`${inject(APP_CONFIG).apiBaseUrl}/`);
  const auth = inject(Auth);

  return isForApi ? from(auth.accessToken()).pipe(switchMap(token => next(withToken(request, token)))) : next(request);
};

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token === null ? request : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
