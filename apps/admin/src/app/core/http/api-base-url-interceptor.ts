import { type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { APP_CONFIG } from '../config/app-config';

/**
 * Sends the requests of the generated client to the API, wherever the runtime
 * config says it lives: orval emits paths like `/me`, and every relative URL
 * this app requests is the API's.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (request, next) => next(
  request.url.startsWith('/') ? request.clone({ url: `${inject(APP_CONFIG).apiBaseUrl}${request.url}` }) : request,
);
