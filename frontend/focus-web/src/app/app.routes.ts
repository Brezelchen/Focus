import { Routes } from '@angular/router';
import { provideEchartsCore } from 'ngx-echarts';
import { authGuard, guestGuard } from './core/auth.service';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Focus',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        title: 'Today · Focus',
        loadComponent: () => import('./features/today/today-page').then((m) => m.TodayPage),
      },
      {
        path: 'focus',
        title: 'Focus mode · Focus',
        loadComponent: () => import('./features/focus-mode/focus-page').then((m) => m.FocusPage),
      },
      {
        path: 'stats',
        title: 'Stats · Focus',
        // ECharts is only downloaded when the stats page is opened.
        providers: [
          provideEchartsCore({ echarts: () => import('./features/stats/echarts-setup') }),
        ],
        loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
