import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class.error]="toast.type === 'error'" [class.info]="toast.type === 'info'">
          <span>{{ toast.message }}</span>
          <button type="button" (click)="toastService.dismiss(toast.id)" aria-label="Fechar">×</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-stack {
        position: fixed;
        top: 1rem;
        right: 1rem;
        z-index: 1000;
        display: grid;
        gap: 0.5rem;
        width: min(360px, calc(100vw - 2rem));
        pointer-events: none;
      }

      .toast {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.75rem 0.85rem;
        border-radius: 10px;
        border: 1px solid #d4d4d4;
        background: #fff;
        color: #171717;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        font-size: 0.8125rem;
        line-height: 1.45;
        animation: slide-in 0.2s ease;
      }

      .toast.error {
        border-color: #171717;
      }

      .toast button {
        border: 0;
        background: transparent;
        color: #737373;
        font-size: 1.125rem;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        flex-shrink: 0;
      }

      .toast button:hover {
        color: #171717;
      }

      @keyframes slide-in {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);
}
