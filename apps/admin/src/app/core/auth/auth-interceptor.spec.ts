import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { APP_CONFIG } from '../config/app-config';
import { apiBaseUrlInterceptor } from '../http/api-base-url-interceptor';
import { Auth } from './auth';
import { authInterceptor } from './auth-interceptor';

const API = 'http://localhost:3000';

function setUp(token: string | null) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([apiBaseUrlInterceptor, authInterceptor])),
      provideHttpClientTesting(),
      { provide: APP_CONFIG, useValue: { apiBaseUrl: API, clientId: 'admin', issuer: 'http://localhost:8080' } },
      { provide: Auth, useValue: { accessToken: () => Promise.resolve(token) } },
    ],
  });

  return { controller: TestBed.inject(HttpTestingController), http: TestBed.inject(HttpClient) };
}

it('sends the generated client\'s paths to the API, with the access token', async () => {
  const { controller, http } = setUp('access-token');

  http.get('/me').subscribe();

  const request = await vi.waitFor(() => controller.expectOne(`${API}/me`));

  expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
});

it.each([
  ['the identity provider', 'http://localhost:8080/oidc/v1/userinfo'],
  ['a host that only starts like the API', 'http://localhost:3000.evil.test/me'],
])('gives no token to %s', async (_case, url) => {
  const { controller, http } = setUp('access-token');

  http.get(url).subscribe();

  const request = await vi.waitFor(() => controller.expectOne(url));

  expect(request.request.headers.has('Authorization')).toBe(false);
});

it('sends an API request without a token when there is no session', async () => {
  const { controller, http } = setUp(null);

  http.get('/me').subscribe();

  const request = await vi.waitFor(() => controller.expectOne(`${API}/me`));

  expect(request.request.headers.has('Authorization')).toBe(false);
});
