import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { SettingsComponent } from './features/settings/settings.component';
import { WorkspacesComponent } from './features/workspaces/workspaces.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'workspaces', component: WorkspacesComponent },
];
