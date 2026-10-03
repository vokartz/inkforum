import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import type { Paginated, UserSummary } from '@forum/shared';
import { api } from '$lib/api';

interface MentionItem {
  id: string;
  label: string;
  user: UserSummary;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function mentionSuggestion(): Omit<SuggestionOptions<MentionItem>, 'editor'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    char: '@',
    allowSpaces: false,
    items: async ({ query }) => {
      if (query.length < 1) return [];
      clearTimeout(timer);
      await new Promise((r) => (timer = setTimeout(r, 150)));
      try {
        const res = await api.get<Paginated<{ user: UserSummary }>>(`/api/members?q=${encodeURIComponent(query)}&perPage=6&sort=name&dir=asc`);
        return res.items.map((i) => ({ id: String(i.user.id), label: i.user.displayName, user: i.user }));
      } catch {
        return [];
      }
    },
    render: () => {
      let el: HTMLDivElement | null = null;
      let items: MentionItem[] = [];
      let index = 0;
      let command: ((item: MentionItem) => void) | null = null;

      const paint = () => {
        if (!el) return;
        if (!items.length) {
          el.style.display = 'none';
          return;
        }
        el.style.display = 'block';
        el.innerHTML = items
          .map((it, i) => {
            const avatar = it.user.avatarUrl
              ? `<img src="${escape(it.user.avatarUrl)}" alt="" class="size-5 rounded-full object-cover" />`
              : `<span class="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">${escape(it.label[0] ?? '?')}</span>`;
            return `<button type="button" data-i="${i}" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${i === index ? 'bg-accent text-accent-foreground' : ''}">${avatar}<span class="font-medium" ${it.user.color ? `style="color:${escape(it.user.color)}"` : ''}>${escape(it.label)}</span><span class="text-xs text-muted-foreground">@${escape(it.user.username)}</span></button>`;
          })
          .join('');
      };

      const place = (props: SuggestionProps<MentionItem>) => {
        const rect = props.clientRect?.();
        if (!el || !rect) return;
        el.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
        el.style.top = `${rect.bottom + 6}px`;
      };

      return {
        onStart: (props) => {
          el = document.createElement('div');
          el.className = 'fixed z-[60] w-60 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95';
          el.setAttribute('role', 'listbox');
          el.addEventListener('mousedown', (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
            if (!btn) return;
            e.preventDefault();
            const it = items[Number(btn.dataset.i)];
            if (it && command) command(it);
          });
          document.body.appendChild(el);
          items = props.items;
          index = 0;
          command = (it) => props.command({ id: it.id, label: it.label });
          paint();
          place(props);
        },
        onUpdate: (props) => {
          items = props.items;
          index = Math.min(index, Math.max(0, items.length - 1));
          command = (it) => props.command({ id: it.id, label: it.label });
          paint();
          place(props);
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (!items.length) return false;
          if (props.event.key === 'ArrowDown') {
            index = (index + 1) % items.length;
            paint();
            return true;
          }
          if (props.event.key === 'ArrowUp') {
            index = (index - 1 + items.length) % items.length;
            paint();
            return true;
          }
          if (props.event.key === 'Enter' || props.event.key === 'Tab') {
            const it = items[index];
            if (it && command) command(it);
            return true;
          }
          if (props.event.key === 'Escape') {
            items = [];
            paint();
            return true;
          }
          return false;
        },
        onExit: () => {
          el?.remove();
          el = null;
        },
      };
    },
  };
}
