import { toast } from 'svelte-sonner';
import { ApiError, errorMessage } from './api';

/**
 * Basit form durumu: gönderim, alan hataları ve genel hata mesajı.
 *   const form = createForm();
 *   await form.submit(() => api.post(...), { success: 'Kaydedildi' });
 */
export function createForm() {
  let submitting = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state<string | null>(null);

  return {
    get submitting() {
      return submitting;
    },
    get errors() {
      return errors;
    },
    get message() {
      return message;
    },
    error(field: string): string | undefined {
      return errors[field];
    },
    clear() {
      errors = {};
      message = null;
    },
    setError(field: string, msg: string) {
      errors = { ...errors, [field]: msg };
    },
    async submit<T>(
      fn: () => Promise<T>,
      opts: { success?: string; toastErrors?: boolean; onError?: (e: ApiError) => boolean | void } = {},
    ): Promise<T | undefined> {
      if (submitting) return undefined;
      submitting = true;
      errors = {};
      message = null;
      try {
        const result = await fn();
        if (opts.success) toast.success(opts.success);
        return result;
      } catch (e) {
        if (e instanceof ApiError) {
          if (opts.onError?.(e)) return undefined;
          errors = e.fields;
          message = Object.keys(e.fields).length ? (e.message ?? null) : e.message;
          if (opts.toastErrors) toast.error(e.message);
        } else {
          message = errorMessage(e);
          if (opts.toastErrors) toast.error(message);
        }
        return undefined;
      } finally {
        submitting = false;
      }
    },
  };
}

export type Form = ReturnType<typeof createForm>;
