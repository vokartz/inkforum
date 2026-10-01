import { t } from '$lib/i18n.svelte';

/**
 * Görseli tarayıcıda kare olarak kırpar ve küçültür (sunucu tarafında ağır görsel işleme gerekmesin diye).
 * GIF'ler animasyonu korumak için olduğu gibi gönderilir.
 */
export async function squareResize(file: File, size: number, focus = { x: 0.5, y: 0.5 }): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = Math.round((bitmap.width - side) * focus.x);
  const sy = Math.round((bitmap.height - side) * focus.y);
  const target = Math.min(size, side);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('Tarayıcı görsel işlemeyi desteklemiyor.'));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  if (blob && blob.type === 'image/webp') return blob;
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error(t('Görsel dönüştürülemedi.'));
  return png;
}
