/** Tiny DOM helpers for the UI layer. */
export interface ElOptions {
  className?: string;
  text?: string;
  testId?: string;
  label?: string;
  style?: Partial<CSSStyleDeclaration>;
  onClick?: () => void;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOptions = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.testId) node.dataset.testid = opts.testId;
  if (opts.label) node.setAttribute('aria-label', opts.label);
  if (opts.style) Object.assign(node.style, opts.style);
  if (opts.onClick) {
    const handler = opts.onClick;
    node.addEventListener('click', (e) => {
      e.stopPropagation();
      handler();
    });
  }
  node.append(...children);
  return node;
}

/** Positions an element in logical stage coordinates. */
export function place<T extends HTMLElement>(
  node: T,
  x: number,
  y: number,
  w: number,
  h: number,
): T {
  Object.assign(node.style, {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
  });
  return node;
}

const ICONS: Record<string, string> = {
  undo: '<path d="M9 7L4 12l5 5M4 12h10a6 6 0 010 12h-2" transform="translate(0 -4)"/>',
  retry: '<path d="M20 12a8 8 0 11-2.3-5.6M20 4v5h-5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  muted: '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.3M12 17h.01"/>',
  book: '<path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  die: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="12" cy="12" r="1.2"/>',
  stats: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
  crown: '<path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z"/>',
};

export function icon(name: keyof typeof ICONS | string): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

export function iconButton(
  name: string,
  label: string,
  onClick: () => void,
  testId = name,
): HTMLButtonElement {
  const b = el('button', { className: 'icon-btn', label, testId, onClick }, [
    icon(name),
    el('span', { text: label }),
  ]);
  b.type = 'button';
  return b;
}
