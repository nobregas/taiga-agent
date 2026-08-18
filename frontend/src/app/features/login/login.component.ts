import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MetaService } from '../../services/meta.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly metaService = inject(MetaService);
  private readonly router = inject(Router);

  submitting = false;
  error = '';

  form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    const lastUsername = this.auth.session().lastUsername;
    if (lastUsername) {
      this.form.patchValue({ username: lastUsername });
    }
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting = true;
    this.error = '';
    const { username, password } = this.form.getRawValue();

    this.auth.login(username, password).subscribe({
      next: () => {
        this.metaService.load().subscribe({ error: () => undefined });
        this.metaService.loadWorkspaces().subscribe({ error: () => undefined });
        this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.error = err?.error?.error ?? 'Nao foi possivel entrar com essa conta Taiga.';
        this.submitting = false;
      },
    });
  }
}
