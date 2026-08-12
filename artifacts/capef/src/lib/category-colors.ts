export interface CategoryStyle {
  baseBg: string;
  baseText: string;
  hoverBg: string;
  hoverText: string;
  hoverBorder: string;
  groupHoverText: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  agriculteur: {
    baseBg: 'bg-green-50',
    baseText: 'text-green-600',
    hoverBg: 'hover:bg-green-50/70',
    hoverText: 'hover:text-green-700',
    hoverBorder: 'hover:border-green-300',
    groupHoverText: 'group-hover:text-green-700',
  },
  pecheur: {
    baseBg: 'bg-blue-50',
    baseText: 'text-blue-500',
    hoverBg: 'hover:bg-blue-50/70',
    hoverText: 'hover:text-blue-700',
    hoverBorder: 'hover:border-blue-300',
    groupHoverText: 'group-hover:text-blue-700',
  },
  eleveur: {
    baseBg: 'bg-orange-50',
    baseText: 'text-orange-500',
    hoverBg: 'hover:bg-orange-50/70',
    hoverText: 'hover:text-orange-700',
    hoverBorder: 'hover:border-orange-300',
    groupHoverText: 'group-hover:text-orange-700',
  },
  forestier: {
    baseBg: 'bg-amber-50',
    baseText: 'text-amber-700',
    hoverBg: 'hover:bg-amber-50/70',
    hoverText: 'hover:text-amber-800',
    hoverBorder: 'hover:border-amber-300',
    groupHoverText: 'group-hover:text-amber-800',
  },
  artisan: {
    baseBg: 'bg-purple-50',
    baseText: 'text-purple-500',
    hoverBg: 'hover:bg-purple-50/70',
    hoverText: 'hover:text-purple-700',
    hoverBorder: 'hover:border-purple-300',
    groupHoverText: 'group-hover:text-purple-700',
  },
};
