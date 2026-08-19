import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

const SKIP_401_URLS = ['/api/auth/login', '/api/auth/logout'];

export const taigaAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !SKIP_401_URLS.some((url) => req.url.includes(url))
      ) {
        auth.expireSession();
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl('/login');
        }
      }

      return throwError(() => error);
    }),
  );
};
