import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppSettings } from '../../models/settings.models';
import { ApiService } from '../../services/api.service';
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

  loading = true;
  saving = false;
  settings: AppSettings | null = null;

  form = this.fb.nonNullable.group({
    taigaUrl: ['https://api.taiga.io/api/v1'],
    taigaUsername: [''],
    taigaPassword: [''],
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
          taigaUsername: settings.taigaUsername ?? '',
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
        taigaUsername: value.taigaUsername,
        taigaPassword: value.taigaPassword || undefined,
        taigaToken: value.taigaToken || undefined,
        geminiApiKey: value.geminiApiKey || undefined,
        geminiModel: value.geminiModel,
      })
      .subscribe({
        next: (settings) => {
          this.settings = settings;
          this.form.patchValue({ taigaPassword: '', taigaToken: '', geminiApiKey: '' });
          this.metaService.refresh();
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
