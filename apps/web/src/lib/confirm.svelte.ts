export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

class ConfirmState {
  open = $state(false);
  options = $state<ConfirmOptions>({ title: '' });
  private resolver: ((value: boolean) => void) | null = null;

  ask(options: ConfirmOptions): Promise<boolean> {
    this.resolver?.(false);
    this.options = options;
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

/** `if (await confirmAction({ title: 'Silinsin mi?', destructive: true })) …` */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return confirmState.ask(options);
}
