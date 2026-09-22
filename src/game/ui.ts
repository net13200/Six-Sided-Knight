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
