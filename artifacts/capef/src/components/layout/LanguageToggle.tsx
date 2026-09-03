import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.substring(0, 2).toLowerCase() === 'en' ? 'en' : 'fr';

  const changeLanguage = (lang: string) => {
    i18n.changeLanguage(lang);
    try {
      localStorage.setItem('capef_language', lang);
    } catch {
      // Ignore localStorage errors if blocked
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="Changer de langue / Change language"
        title="Changer de langue / Change language"
        className="inline-flex touch-manipulation h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-muted-foreground shadow-sm transition-[background-color,color,transform,box-shadow] duration-500 ease-out hover:-translate-y-px focus:-translate-y-px hover:bg-accent focus:bg-accent hover:text-accent-foreground focus:text-accent-foreground hover:shadow-md focus:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Languages className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase">{currentLang}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32 bg-card border border-border shadow-lg">
        <DropdownMenuItem
          onClick={() => changeLanguage('fr')}
          className="flex items-center justify-between cursor-pointer font-medium text-sm"
        >
          <span>Français</span>
          {currentLang === 'fr' && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => changeLanguage('en')}
          className="flex items-center justify-between cursor-pointer font-medium text-sm"
        >
          <span>English</span>
          {currentLang === 'en' && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LanguageToggle;
