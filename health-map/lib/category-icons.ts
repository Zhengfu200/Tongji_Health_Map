import type { Category } from './model.ts';

// Fixed view boxes keep the symbols centered regardless of the user's fonts.
// The heart, arrow, club and moon outlines are adapted from Lucide (ISC).
export const CATEGORY_ICON_PATHS: Record<Category, readonly string[]> = {
  clinic: ['M4 12h16', 'M12 4v16'],
  counseling: ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'],
  fitness: ['M7 7h10v10', 'M7 17 17 7'],
  dining: ['M17.28 9.05a5.5 5.5 0 1 0-10.56 0A5.5 5.5 0 1 0 12 17.66a5.5 5.5 0 1 0 5.28-8.6Z', 'M12 17.66V22'],
  rest: ['M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'],
  international: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
};

export function createCategoryIcon(category: Category): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) icon.setAttribute(name, value);
  icon.classList.add('category-icon');
  for (const d of CATEGORY_ICON_PATHS[category]) {
    const path = document.createElementNS(namespace, 'path');
    path.setAttribute('d', d);
    icon.appendChild(path);
  }
  return icon;
}
