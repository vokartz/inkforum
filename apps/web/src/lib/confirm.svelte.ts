export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  tone?: 'info' | 'warning' | 'danger';
  input?: { label?: string; placeholder?: string; multiline?: boolean; maxLength?: number; required?: boolean };
}

class ConfirmState {
  open = $state(false);
  options = $state<ConfirmOptions>({ title: '' });
  value = $state('');
  private resolver: ((value: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    this.resolver?.(false);
    this.options = options;
    this.value = '';
    this.open = true;
    return new Promise((resolve) => (this.resolver = resolve));
  }

  settle(value: boolean): void {
    this.open = false;
    this.resolver?.(value);
    this.resolver = null;
  }
}

export const confirmState = new ConfirmState();

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return confirmState.ask(options);
}

export async function promptAction(options: ConfirmOptions & { input?: ConfirmOptions['input'] }): Promise<string | null> {
  const ok = await confirmState.ask({ input: {}, ...options });
  return ok ? confirmState.value.trim() : null;
}
