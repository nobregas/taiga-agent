import { CommonModule } from '@angular/common';
import { Component, ElementRef, QueryList, ViewChildren } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatAcceptanceCriteria, parseAcceptanceCriteria } from '../../models/draft.models';

@Component({
  selector: 'app-criterios-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './criterios-editor.component.html',
  styleUrl: './criterios-editor.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: CriteriosEditorComponent,
      multi: true,
    },
  ],
})
export class CriteriosEditorComponent implements ControlValueAccessor {
  @ViewChildren('lineInput') lineInputs?: QueryList<ElementRef<HTMLInputElement>>;

  lines: string[] = [''];
  disabled = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | string[] | null): void {
    const items = parseAcceptanceCriteria(value);
    this.lines = items.length ? items : [''];
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onLineInput(index: number, event: Event): void {
    this.lines[index] = (event.target as HTMLInputElement).value;
    this.emit();
  }

  markTouched(): void {
    this.onTouched();
  }

  onLineKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addLine(index + 1);
      return;
    }

    if (event.key === 'Backspace' && !this.lines[index] && this.lines.length > 1) {
      event.preventDefault();
      this.removeLine(index);
    }
  }

  addLine(index = this.lines.length): void {
    this.lines.splice(index, 0, '');
    this.lines = [...this.lines];
    this.emit();
    queueMicrotask(() => {
      const input = this.lineInputs?.get(index)?.nativeElement;
      input?.focus();
    });
  }

  removeLine(index: number): void {
    if (this.lines.length === 1) {
      this.lines = [''];
      this.emit();
      return;
    }

    this.lines.splice(index, 1);
    this.lines = [...this.lines];
    this.emit();
    queueMicrotask(() => {
      const next = this.lineInputs?.get(Math.max(0, index - 1))?.nativeElement;
      next?.focus();
    });
  }

  private emit(): void {
    this.onTouched();
    this.onChange(formatAcceptanceCriteria(this.lines));
  }
}
