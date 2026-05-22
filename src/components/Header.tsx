import { Search, LogOut, HelpCircle, UserCircle, Moon, Sun, Languages, X } from 'lucide-react';
import { useState, useEffect, useRef, useId } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { useAuthUser } from '../auth/authStore';
import Logo from './Logo';
import { useTheme } from '../ThemeContext';
import { Language } from '../translations';
import { loadIssuerStatsSummary } from '../services/industryBondData';
import { loadBondDetail, loadMaturingBonds } from '../services/bondData';
import { fireantApi } from '../api/fireant';

const HeaderAppLogo = () => {
  const id = useId();
  const radialId = `${id}-radial`;
  const linearId = `${id}-linear`;
  const linear2Id = `${id}-linear-2`;

  return (
    <svg width="28" height="28" viewBox="0 0 32 32" className="shrink-0" aria-hidden="true">
      <defs>
        <radialGradient id={radialId} cx="36.22" cy="5.33" r="39.36" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#05e6fd" />
          <stop offset="1" stopColor="#157cff" />
        </radialGradient>
        <linearGradient id={linearId} x1="10.43" y1="16.55" x2="13.14" y2="24.88" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="0.17" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.47" stopColor="#fff" stopOpacity="0.63" />
          <stop offset="0.64" stopColor="#fff" stopOpacity="0.79" />
          <stop offset="0.78" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.91" stopColor="#fff" stopOpacity="0.97" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <linearGradient id={linear2Id} x1="15.93" y1="25.47" x2="16.27" y2="8.37" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <rect fill={`url(#${radialId})`} width="32" height="32" rx="5.63" />
      <path fill={`url(#${linearId})`} d="M9,26.16h.92A4.56,4.56,0,0,0,14.4,22L15,15.33h0s-1.19-.9-3.57,2.71-3,4.93-3,5.72c0,.49-.05,1.3-.07,1.84A.54.54,0,0,0,9,26.16Z" />
      <path fill={`url(#${linear2Id})`} d="M17.4,10.83l.92-.16h0c-.39-.35-.8-.69-1.22-1A.35.35,0,0,1,17,9.29a.34.34,0,0,1,.32-.23h.07a18.59,18.59,0,0,1,2.7.81c.32.13.65.26,1,.41a.94.94,0,0,0,.37.07h.07A.87.87,0,0,0,22,9.87h0v0l1.61-3.7h0c-.5-.07-1-.13-1.51-.18-.27,0-.54,0-.82-.06h0c-.64,0-1.28-.07-1.93-.07a29.37,29.37,0,0,0-7.13.87l-.15,0h0A4.21,4.21,0,0,0,9,10.53H9v.27H9l-.11,3.07h0c.32-.18.64-.34,1-.5A29.1,29.1,0,0,1,17.4,10.83Z" />
      <path fill="white" d="M22.18,11.24s0,0,0,0v.05c-.09.28-.19.55-.3.83s-.13.35-.21.52-.25.6-.39.88A18.06,18.06,0,0,1,19,17.13h0a18.36,18.36,0,0,0,.89-4.41h0a18.25,18.25,0,0,0-11,10.73,2,2,0,0,0-.08.22c-.15.39-.28.79-.39,1.19h0l.05-1.32.25-6.91a1.38,1.38,0,0,1,.32-.84l0-.06a11.17,11.17,0,0,1,3.94-2.86,26,26,0,0,1,5.12-1.69,7.11,7.11,0,0,1,1-.13h0c-.19-.19-.38-.38-.58-.56A16.81,16.81,0,0,0,17.3,9.4h0a18.41,18.41,0,0,1,2.65.8,17.47,17.47,0,0,1,2.23,1.05Z" />
    </svg>
  );
};

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
    <header className="relative h-16 shrink-0 bg-surface-bright border-b border-border-base flex items-center gap-3 px-3 md:px-6 sticky top-0 z-50 transition-colors duration-300 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center">
        <div 
          className="flex min-w-0 items-center hover:cursor-pointer select-none group"
          onClick={onLogoClick}
        >
          <div className="flex min-w-0 items-end gap-3 md:gap-6 lg:gap-10">
            <div className="flex shrink-0 items-center gap-2 origin-left">
              <HeaderAppLogo />
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
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border-base bg-surface-container-low text-text-muted transition-all hover:text-blue-600 active:scale-95 md:hidden"
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
            className="block w-full pl-10 pr-3 py-2 border border-border-base rounded-lg bg-surface-container-low text-sm text-text-base placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            placeholder={t('searchPlaceholder')}
          />

          {showDropdown && (suggestions.length > 0 || isSearching) && (
            <div className="absolute left-0 right-0 mt-2 z-50 rounded-lg border border-border-base bg-surface-bright shadow-lg max-h-80 md:max-h-96 overflow-y-auto">
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

        {mobileSearchOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-border-base bg-surface-bright p-3 shadow-lg md:hidden">
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
                className="block w-full pl-10 pr-10 py-3 border border-border-base rounded-lg bg-surface-container-low text-sm text-text-base placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder={t('searchPlaceholder')}
              />
              <button
                type="button"
                onClick={() => {
                  setMobileSearchOpen(false);
                  setShowDropdown(false);
                }}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-muted transition-colors hover:text-blue-600"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {showDropdown && (suggestions.length > 0 || isSearching) && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-lg">
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
          className="p-2 text-text-muted hover:text-blue-600 hover:bg-surface-container-low rounded-lg transition-all active:scale-95 shrink-0"
          title={effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}
        >
          {effectiveTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-2 text-text-muted hover:text-blue-600 hover:bg-surface-container-low rounded-lg transition-all active:scale-95 shrink-0"
          title={t('uiLanguage')}
        >
          <Languages className="h-5 w-5" />
          <span className="text-xs font-bold uppercase">{language}</span>
        </button>

        <div ref={userMenuRef} className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 hover:bg-surface-container-low rounded-lg transition-all active:scale-95 shrink-0"
          >
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-text-base leading-none">{authUser?.profile?.name || 'Admin User'}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold overflow-hidden">
              {getInitials(authUser?.profile?.name || '')}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-surface-bright rounded shadow-lg border border-border-base py-2 z-50">
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
