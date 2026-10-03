export type RevealOptions = number | false | { delay?: number; type?: string };

export function reveal(node: HTMLElement, opts: RevealOptions = 0) {
  const o = typeof opts === 'object' && opts ? opts : { delay: typeof opts === 'number' ? opts : 0, type: opts === false ? 'none' : 'up' };
  const type = o.type ?? 'up';
  if (type === 'none' || typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (node.getBoundingClientRect().top < window.innerHeight * 0.92) return;
  node.classList.add('reveal', `reveal-${type}`);
  if (o.delay) node.style.setProperty('--reveal-delay', `${o.delay}ms`);
  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        node.classList.add('reveal-in');
        obs.disconnect();
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  obs.observe(node);
  return { destroy: () => obs.disconnect() };
}
