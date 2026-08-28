export interface CategoryStyle {
  baseBg: string;
  baseText: string;
  hoverBg: string;
  hoverText: string;
  hoverBorder: string;
  groupHoverText: string;
  iconBg: string;
  groupHoverIconBg: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  agriculteur: {
    baseBg: 'bg-green-50 dark:bg-green-950/40',
    baseText: 'text-green-600 dark:text-green-400',
    hoverBg: 'hover:bg-green-100/40 dark:hover:bg-green-900/40',
    hoverText: 'hover:text-green-700 dark:hover:text-green-300',
    hoverBorder: 'hover:border-green-300 dark:hover:border-green-700',
    groupHoverText: 'group-hover:text-green-700 dark:group-hover:text-green-300',
    iconBg: 'bg-green-100/80 dark:bg-green-900/50',
    groupHoverIconBg: 'group-hover:bg-green-200/80 dark:group-hover:bg-green-800/60',
  },
  pecheur: {
    baseBg: 'bg-blue-50 dark:bg-blue-950/40',
    baseText: 'text-blue-500 dark:text-blue-400',
    hoverBg: 'hover:bg-blue-100/40 dark:hover:bg-blue-900/40',
    hoverText: 'hover:text-blue-700 dark:hover:text-blue-300',
    hoverBorder: 'hover:border-blue-300 dark:hover:border-blue-700',
    groupHoverText: 'group-hover:text-blue-700 dark:group-hover:text-blue-300',
    iconBg: 'bg-blue-100/80 dark:bg-blue-900/50',
    groupHoverIconBg: 'group-hover:bg-blue-200/80 dark:group-hover:bg-blue-800/60',
  },
  eleveur: {
    baseBg: 'bg-orange-50 dark:bg-orange-950/40',
    baseText: 'text-orange-500 dark:text-orange-400',
    hoverBg: 'hover:bg-orange-100/40 dark:hover:bg-orange-900/40',
    hoverText: 'hover:text-orange-700 dark:hover:text-orange-300',
    hoverBorder: 'hover:border-orange-300 dark:hover:border-orange-700',
    groupHoverText: 'group-hover:text-orange-700 dark:group-hover:text-orange-300',
    iconBg: 'bg-orange-100/80 dark:bg-orange-900/50',
    groupHoverIconBg: 'group-hover:bg-orange-200/80 dark:group-hover:bg-orange-800/60',
  },
  forestier: {
    baseBg: 'bg-amber-50 dark:bg-amber-950/40',
    baseText: 'text-amber-700 dark:text-amber-400',
    hoverBg: 'hover:bg-amber-100/40 dark:hover:bg-amber-900/40',
    hoverText: 'hover:text-amber-800 dark:hover:text-amber-300',
    hoverBorder: 'hover:border-amber-300 dark:hover:border-amber-700',
    groupHoverText: 'group-hover:text-amber-800 dark:group-hover:text-amber-300',
    iconBg: 'bg-amber-100/80 dark:bg-amber-900/50',
    groupHoverIconBg: 'group-hover:bg-amber-200/80 dark:group-hover:bg-amber-800/60',
  },
  artisan: {
    baseBg: 'bg-purple-50 dark:bg-purple-950/40',
    baseText: 'text-purple-500 dark:text-purple-400',
    hoverBg: 'hover:bg-purple-100/40 dark:hover:bg-purple-900/40',
    hoverText: 'hover:text-purple-700 dark:hover:text-purple-300',
    hoverBorder: 'hover:border-purple-300 dark:hover:border-purple-700',
    groupHoverText: 'group-hover:text-purple-700 dark:group-hover:text-purple-300',
    iconBg: 'bg-purple-100/80 dark:bg-purple-900/50',
    groupHoverIconBg: 'group-hover:bg-purple-200/80 dark:group-hover:bg-purple-800/60',
  },
};
