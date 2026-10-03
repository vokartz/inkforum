import { api } from './api';

export async function previewBBCode(bbcode: string, kind: 'post' | 'short' = 'post'): Promise<string> {
  const res = await api.post<{ html: string }>('/api/bbcode/preview', { bbcode, kind });
  return res.html;
}
