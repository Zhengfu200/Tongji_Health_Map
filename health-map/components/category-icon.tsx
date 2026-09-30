import type { Category } from '@/lib/model';
import { CATEGORY_ICON_PATHS } from '@/lib/category-icons';

export function CategoryIcon({ category, size = 18 }: { category: Category; size?: number }) {
  return <svg className="category-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {CATEGORY_ICON_PATHS[category].map((d, index) => <path key={index} d={d} />)}
  </svg>;
}
