export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Görünüm: uyarı (sarı), tehlike (kırmızı) ya da bilgi; verilmezse destructive'e göre seçilir */
  tone?: 'info' | 'warning' | 'danger';
  /** Metin alanı (gerekçe gibi); promptAction ile kullanılır */
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

/** `if (await confirmAction({ title: 'Silinsin mi?', destructive: true })) …` */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return confirmState.ask(options);
}

/** Metin isteyen onay: vazgeçilirse null, onaylanırsa yazılan metin ('' olabilir) */
export async function promptAction(options: ConfirmOptions & { input?: ConfirmOptions['input'] }): Promise<string | null> {
  const ok = await confirmState.ask({ input: {}, ...options });
  return ok ? confirmState.value.trim() : null;
}
