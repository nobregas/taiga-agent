import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface AppSelectOption {
  value: string | number | null;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './select.component.html',
  styleUrl: './select.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: SelectComponent,
      multi: true,
    },
  ],
})
export class SelectComponent implements ControlValueAccessor {
  private readonly host = inject(ElementRef<HTMLElement>);

  @Input() options: AppSelectOption[] = [];
  @Input() placeholder = 'Selecionar';
  @Input() ariaLabel = '';
  @Input() disabled = false;
  @Input() value: string | number | null = null;
  @Output() valueChange = new EventEmitter<string | number | null>();

  open = false;
  activeIndex = -1;

  private onChange: (value: string | number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get selected(): AppSelectOption | undefined {
    return this.options.find((option) => option.value === this.value);
  }

  get displayLabel(): string {
    return this.selected?.label || this.placeholder;
  }

  writeValue(value: string | number | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: string | number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }

    this.open = !this.open;
    if (this.open) {
      this.activeIndex = Math.max(
        0,
        this.options.findIndex((option) => option.value === this.value),
      );
    }
  }

  close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.onTouched();
  }

  selectOption(option: AppSelectOption): void {
    if (option.disabled) {
      return;
    }

    this.value = option.value;
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.close();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (this.disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open) {
        this.open = true;
        this.activeIndex = Math.max(
          0,
          this.options.findIndex((option) => option.value === this.value),
        );
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        const option = this.options[this.activeIndex];
        if (option) {
          this.selectOption(option);
        }
      }
    }

    if (this.open && event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveActive(1);
    }

    if (this.open && event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveActive(-1);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }

    if (event.key === 'Home' && this.open) {
      event.preventDefault();
      this.activeIndex = 0;
    }

    if (event.key === 'End' && this.open) {
      event.preventDefault();
      this.activeIndex = this.options.length - 1;
    }
  }

  private moveActive(delta: number): void {
    if (!this.options.length) {
      return;
    }
    const next = this.activeIndex + delta;
    this.activeIndex = Math.min(this.options.length - 1, Math.max(0, next));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) {
      return;
    }

    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
