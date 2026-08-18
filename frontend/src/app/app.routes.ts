import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/login/login.component';
import { SettingsComponent } from './features/settings/settings.component';
import { WorkspacesComponent } from './features/workspaces/workspaces.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: '', component: HomeComponent, canActivate: [authGuard] },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard] },
  { path: 'workspaces', component: WorkspacesComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
