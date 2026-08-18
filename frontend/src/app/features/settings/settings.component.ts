import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppSettings } from '../../models/settings.models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { MetaService } from '../../services/meta.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(ApiService);
  private readonly metaService = inject(MetaService);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);

  loading = true;
  saving = false;
  settings: AppSettings | null = null;

  form = this.fb.nonNullable.group({
    taigaUrl: ['https://api.taiga.io/api/v1'],
    taigaToken: [''],
    geminiApiKey: [''],
    geminiModel: ['gemini-2.5-flash'],
  });

  ngOnInit(): void {
    this.api.getSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        this.form.patchValue({
          taigaUrl: settings.taigaUrl,
          geminiModel: settings.geminiModel,
        });
        this.loading = false;
      },
      error: (err) => {
        this.toast.show(err?.error?.error ?? 'Falha ao carregar configuracoes.');
        this.loading = false;
      },
    });
  }

  submit(): void {
    this.saving = true;
    const value = this.form.getRawValue();

    this.api
      .updateSettings({
        taigaUrl: value.taigaUrl,
        taigaToken: value.taigaToken || undefined,
        geminiApiKey: value.geminiApiKey || undefined,
        geminiModel: value.geminiModel,
      })
      .subscribe({
        next: (settings) => {
          this.settings = settings;
          this.form.patchValue({ taigaToken: '', geminiApiKey: '' });
          this.metaService.refresh();
          this.auth.reloadSession().subscribe();
          this.toast.show('Configuracoes salvas.', 'info');
          this.saving = false;
        },
        error: (err) => {
          this.toast.show(err?.error?.error ?? 'Falha ao salvar configuracoes.');
          this.saving = false;
        },
      });
  }
}
