import { Search, LogOut, HelpCircle, UserCircle, Moon, Sun, Languages, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { useAuthUser } from '../auth/authStore';
import Logo from './Logo';
import { useTheme } from '../ThemeContext';
import { Language } from '../translations';
import { loadIssuerStatsSummary } from '../services/industryBondData';
import { loadBondDetail, loadMaturingBonds } from '../services/bondData';
import { fireantApi } from '../api/fireant';

export type SearchSuggestion = {
  id: string;
  type: 'enterprise' | 'bond';
  title: string;
  subtitle: string;
  code?: string;
  ticker?: string;
  enterpriseName?: string;
};

interface HeaderProps {
  onProfileClick: () => void;
  onHelpClick: () => void;
  onLogoClick: () => void;
  onLogout: () => void;
  onSearchSelect: (suggestion: SearchSuggestion) => void;
}

export default function Header({ onProfileClick, onHelpClick, onLogoClick, onLogout, onSearchSelect }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { t, language, setLanguage } = useLanguage();
  const { setTheme, effectiveTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const authUser = useAuthUser();

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
      const loadSearchCaches = async () => {
      const enterpriseCache = getCache('enterprise_list');
      const bondCache = getCache('comparison_pool_bonds');

      if (!enterpriseCache) {
        try {
            const issuers = await loadIssuerStatsSummary(200);
            if (Array.isArray(issuers)) {
              const mappedEnterprises = issuers.map((issuer: any) => ({
                id: issuer.issuerSymbol,
                ticker: issuer.issuerSymbol,
                name: issuer.issuerName,
                industry: 'N/A',
                bondCount: issuer.bondCount || 0,
                  issuedValue: (issuer.totalIssuedValue || 0) / 1000000000,
                initialDebt: (issuer.totalDebtFull || issuer.totalIssuedValue || 0) / 1000000000,
                remainingDebt: (issuer.totalRemainingDebt || 0) / 1000000000
              }));
                setCache('enterprise_list', mappedEnterprises);
            }
        } catch (error) {
          console.warn('Header failed to preload enterprise list', error);
        }
      }

      if (!bondCache) {
        try {
            const bonds = await loadMaturingBonds(3650);
            if (Array.isArray(bonds)) {
              const mappedBonds = bonds.map((bond: any) => ({
                id: String(bond.bondCode || bond.code || ''),
                code: String(bond.bondCode || bond.code || ''),
                enterpriseId: String(bond.issuerSymbol || bond.companyCode || ''),
                enterpriseName: String(bond.issuerName || bond.companyName || ''),
              })).filter((bond: any) => bond.code);
              if (mappedBonds.length > 0) {
                setCache('comparison_pool_bonds', mappedBonds);
              }
            }
        } catch (error) {
          console.warn('Header failed to preload bond pool', error);
        }
      }
    };
    loadSearchCaches();
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let active = true;
    const loadSuggestions = async () => {
      setIsSearching(true);
      const normalized = trimmed.toLowerCase();

      const suggestionMap = new Map<string, SearchSuggestion>();
      const addSuggestion = (suggestion: SearchSuggestion) => {
        const key = `${suggestion.type}:${suggestion.id}`;
        if (!suggestionMap.has(key)) {
          suggestionMap.set(key, suggestion);
        }
      };

      const cachedEnterprises = (getCache('enterprise_list') || []) as any[];
      cachedEnterprises.forEach((enterprise) => {
        const name = String(enterprise.name || '');
        const ticker = String(enterprise.ticker || enterprise.id || '');
        if (name.toLowerCase().includes(normalized) || ticker.toLowerCase().includes(normalized)) {
          addSuggestion({
            id: ticker,
            type: 'enterprise',
            title: name,
            subtitle: ticker,
            ticker,
            enterpriseName: name
          });
        }
      });

      const cachedBonds = (getCache('comparison_pool_bonds') || []) as any[];
      cachedBonds.forEach((bond) => {
        const code = String(bond.code || bond.id || '');
        if (!code) return;
        if (code.toLowerCase().includes(normalized) || String(bond.enterpriseId || '').toLowerCase().includes(normalized)) {
          addSuggestion({
            id: code,
            type: 'bond',
            title: code,
            subtitle: String(bond.enterpriseName || bond.enterpriseId || t('bond')),
            code,
            enterpriseName: String(bond.enterpriseName || bond.enterpriseId || '')
          });
        }
      });

      try {
          const data = await fireantApi.searchSymbols(trimmed);
          const items = Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : Array.isArray(data?.items)
                ? data.items
                : [];

          items.forEach((item: any) => {
            const symbol = String(item.symbol || item.ticker || '');
            if (!symbol) return;

            const name = String(item.name || item.fullName || item.companyName || item.issuerName || '');
            const symbolType = String(item.symbolType || item?.type || '').toLowerCase();
            
            // Stricter classification to avoid warrants (cw) or other types
            const isBondType = symbolType.includes('bond') || symbolType === '3'; // Type 3 is often bonds in some Fireant APIs
            const isStockType = symbolType.includes('stock') || symbolType.includes('enterprise') || symbolType === '1';
            
            // Only add if it's clearly a bond or enterprise, and avoid warrants
            if (isBondType || isStockType) {
              const type = isBondType ? 'bond' : 'enterprise';
              const title = isBondType ? symbol : (name || symbol);
              const subtitle = isBondType ? (name || item.symbolType || '') : symbol;
              
              const suggestion: SearchSuggestion = {
                id: symbol,
                type: type,
                title,
                subtitle,
                code: isBondType ? symbol : undefined,
                ticker: !isBondType ? symbol : undefined,
                enterpriseName: !isBondType ? name || symbol : undefined
              };
              addSuggestion(suggestion);
            }
          });
      } catch (error) {
        console.warn('Header search symbol lookup failed', error);
      }

      const normalizedCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const maybeBond = normalizedCode.length >= 3 && /[0-9]/.test(normalizedCode);
      if (maybeBond && !Array.from(suggestionMap.values()).some(s => s.type === 'bond' && s.code?.toUpperCase() === normalizedCode)) {
        try {
            const bondData = await loadBondDetail(normalizedCode);
            const issuerName = String(bondData?.issuerName || bondData?.issuerSymbol || '');
            addSuggestion({
              id: normalizedCode,
              type: 'bond',
              title: normalizedCode,
              subtitle: issuerName || t('bond'),
              code: normalizedCode,
              enterpriseName: issuerName
            });
        } catch (error) {
          console.warn('Header exact bond lookup failed', error);
        }
      }

      if (!active) return;
      const results = Array.from(suggestionMap.values());
      setSuggestions(results);
      setIsSearching(false);
    };

    const timer = window.setTimeout(loadSuggestions, 240);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, t]);

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    setMobileSearchOpen(false);
    onSearchSelect(suggestion);
  };

  const toggleTheme = () => {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    setLanguage((language === 'vi' ? 'en' : 'vi') as Language);
  };

  return (
    <header className="relative h-16 shrink-0 bg-surface-bright/95 border-b border-border-base flex items-center gap-3 px-3 md:px-6 sticky top-0 z-50 transition-colors duration-300 shadow-md shadow-blue-950/5 backdrop-blur dark:shadow-black/20">
      <div className="flex min-w-0 flex-1 items-center">
        <div 
          className="flex min-w-0 items-center hover:cursor-pointer select-none group"
          onClick={onLogoClick}
        >
          <div className="flex min-w-0 items-end gap-3 md:gap-6 lg:gap-10">
            <div className="flex shrink-0 items-center gap-2 origin-left">
              <Logo />
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setMobileSearchOpen(true);
            setShowDropdown(true);
            window.setTimeout(() => mobileSearchInputRef.current?.focus(), 0);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-bg-surface text-text-muted transition-all hover:border-text-highlight hover:text-text-highlight active:scale-95 md:hidden"
          aria-label={t('searchPlaceholder')}
          title={t('searchPlaceholder')}
        >
          <Search className="h-5 w-5" />
        </button>

        <div ref={containerRef} className="relative hidden w-full min-w-0 max-w-md md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-text-muted" />
          </div>
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            type="text"
            aria-label={t('searchPlaceholder')}
            className="block w-full rounded-lg border border-border-base bg-bg-surface py-2 pl-10 pr-3 text-sm font-medium text-text-base placeholder-text-muted transition-all focus:border-text-highlight focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
            placeholder={t('searchPlaceholder')}
          />

          {showDropdown && (suggestions.length > 0 || isSearching) && (
            <div className="absolute left-0 right-0 mt-2 z-50 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-xl shadow-blue-950/10 md:max-h-96 dark:shadow-black/30">
              {isSearching && (
                <div className="px-4 py-3 text-sm text-text-muted">{t('loading')}...</div>
              )}
              {!isSearching && suggestions.length === 0 && searchQuery.trim().length > 0 && (
                <div className="px-4 py-3 text-sm text-text-muted">{t('noResults')}</div>
              )}
              {suggestions.map((suggestion) => (
                <button
                  key={`${suggestion.type}:${suggestion.id}`}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-surface-container-low cursor-pointer"
                >
                  <div className="text-sm font-semibold text-text-base">{suggestion.title}</div>
                  <div className="text-xs font-medium text-text-muted">{suggestion.subtitle || (suggestion.type === 'bond' ? t('bond') : t('enterprise'))}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {mobileSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border-base bg-surface-bright p-3 shadow-xl shadow-blue-950/10 md:hidden">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-text-muted" />
              </div>
              <input
                ref={mobileSearchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                type="text"
                aria-label={t('searchPlaceholder')}
                className="block w-full rounded-lg border border-border-base bg-bg-surface py-3 pl-10 pr-10 text-sm font-medium text-text-base placeholder-text-muted transition-all focus:border-text-highlight focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                placeholder={t('searchPlaceholder')}
              />
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setShowDropdown(false);
                }}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted transition-colors hover:text-text-highlight"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {showDropdown && (suggestions.length > 0 || isSearching) && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-xl shadow-blue-950/10">
                {isSearching && (
                  <div className="px-4 py-3 text-sm text-text-muted">{t('loading')}...</div>
                )}
                {!isSearching && suggestions.length === 0 && searchQuery.trim().length > 0 && (
                  <div className="px-4 py-3 text-sm text-text-muted">{t('noResults')}</div>
                )}
                {suggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.type}:${suggestion.id}`}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-text-base">{suggestion.title}</div>
                    <div className="text-xs font-medium text-text-muted">{suggestion.subtitle || (suggestion.type === 'bond' ? t('bond') : t('enterprise'))}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95 shrink-0"
          title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
        >
          {effectiveTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-text-muted transition-all hover:bg-surface-container-low hover:text-text-highlight active:scale-95 shrink-0"
          title={t('uiLanguage')}
        >
          <Languages className="h-5 w-5" />
          <span className="text-xs font-bold uppercase">{language}</span>
        </button>

        <div ref={userMenuRef} className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 rounded-lg p-1.5 transition-all hover:bg-surface-container-low active:scale-95 shrink-0"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-text-base leading-none">{authUser?.profile?.name || 'Admin User'}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-action-accent font-bold text-slate-950 shadow-md shadow-cyan-500/20">
              {getInitials(authUser?.profile?.name || '')}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-border-base bg-surface-bright py-2 shadow-xl shadow-blue-950/10 dark:shadow-black/30">
              <button 
                onClick={() => {
                  onProfileClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <UserCircle className="h-4 w-4" /> {t('profile')}
              </button>
              <button 
                onClick={() => {
                  onHelpClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <HelpCircle className="h-4 w-4" /> {t('help')}
              </button>
              <hr className="my-1 border-border-base" />
              <button 
                onClick={() => {
                  onLogout();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3 transition-colors"
              >
                <LogOut className="h-4 w-4" /> {t('logout')}
              </button>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}
