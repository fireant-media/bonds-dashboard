import { Search, Bell, LogOut, Settings, HelpCircle, UserCircle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { getFireantToken, cleanTokenString } from '../utils/token';
import { useAuthUser } from '../auth/authStore';
import Logo from './Logo';

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
  onSettingsClick: () => void;
  onHelpClick: () => void;
  onLogoClick: () => void;
  onLogout: () => void;
  onSearchSelect: (suggestion: SearchSuggestion) => void;
}

export default function Header({ onProfileClick, onSettingsClick, onHelpClick, onLogoClick, onLogout, onSearchSelect }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const authUser = useAuthUser();

  const getInitials = (name: string) => {
    if (!name) return 'A';
    return name.charAt(0).toUpperCase();
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const loadSearchCaches = async () => {
      const enterpriseCache = getCache('enterprise_list');
      const bondCache = getCache('comparison_pool_bonds');
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      const token = getFireantToken();
      const cleanToken = token ? cleanTokenString(token) : undefined;
      if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

      if (!enterpriseCache) {
        try {
          const enterpriseRes = await fetch('/api/fireant/bonds/stats/issuers/top-debt?top=200', {
            headers
          });
          if (enterpriseRes.ok) {
            const issuers = await enterpriseRes.json();
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
          }
        } catch (error) {
          console.warn('Header failed to preload enterprise list', error);
        }
      }

      if (!bondCache) {
        try {
          const bondsRes = await fetch('/api/fireant/bonds/stats/bonds/maturing-soon?days=3650', {
            headers
          });
          if (bondsRes.ok) {
            const bonds = await bondsRes.json();
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
      const headers: Record<string, string> = {
        'Accept': 'application/json'
      };
      const token = getFireantToken();
      const cleanToken = token ? cleanTokenString(token) : undefined;
      if (cleanToken) headers['Authorization'] = `Bearer ${cleanToken}`;

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
        const response = await fetch(`/api/fireant/symbols/search?q=${encodeURIComponent(trimmed)}`, {
          headers
        });

        if (response.ok) {
          const data = await response.json();
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
        }
      } catch (error) {
        console.warn('Header search symbol lookup failed', error);
      }

      const normalizedCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const maybeBond = normalizedCode.length >= 3 && /[0-9]/.test(normalizedCode);
      if (maybeBond && !Array.from(suggestionMap.values()).some(s => s.type === 'bond' && s.code?.toUpperCase() === normalizedCode)) {
        try {
          const response = await fetch(`/api/fireant/bonds/${encodeURIComponent(normalizedCode)}`, {
            headers
          });
          if (response.ok) {
            const bondData = await response.json();
            const issuerName = String(bondData?.issuerName || bondData?.issuerSymbol || '');
            addSuggestion({
              id: normalizedCode,
              type: 'bond',
              title: normalizedCode,
              subtitle: issuerName || t('bond'),
              code: normalizedCode,
              enterpriseName: issuerName
            });
          }
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
    onSearchSelect(suggestion);
  };

  return (
    <header className="h-16 bg-bg-surface border-b border-border-base flex items-center justify-between gap-2 px-3 md:px-6 sticky top-0 z-50 transition-colors duration-300">
      <div className="flex items-center shrink-0">
        <div 
          className="flex items-center hover:cursor-pointer select-none group"
          onClick={onLogoClick}
        >
          <div className="flex items-end gap-6 md:gap-10">
            <div className="scale-110 md:scale-125 origin-left">
              <Logo />
            </div>
            <h1 className="text-base md:text-lg font-bold text-text-highlight tracking-tight transition-colors hidden lg:block uppercase leading-none relative">
              Bonds Dashboard
            </h1>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-w-0 items-center justify-end gap-2 md:gap-4">
        <div ref={containerRef} className="relative flex-1 min-w-0 md:flex-none md:w-96 md:mr-4">
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
            className="block w-full pl-10 pr-3 py-2 border border-border-base rounded-lg bg-bg-base text-sm text-text-base placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-text-highlight focus:border-transparent transition-all"
            placeholder={t('searchPlaceholder')}
          />

          {showDropdown && (suggestions.length > 0 || isSearching) && (
            <div className="absolute left-0 right-0 mt-2 z-50 rounded-2xl border border-border-base bg-bg-surface shadow-xl max-h-80 md:max-h-96 overflow-y-auto">
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
                  className="w-full text-left px-4 py-3 hover:bg-bg-base transition-colors"
                >
                  <div className="text-sm font-semibold text-text-base">{suggestion.title}</div>
                  <div className="text-xs text-text-muted">{suggestion.subtitle || (suggestion.type === 'bond' ? t('bond') : t('enterprise'))}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => setShowNotifications(!showNotifications)}
          className="p-2 text-text-muted hover:bg-bg-base rounded-full relative transition-colors shrink-0"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full border-2 border-bg-surface"></span>
        </button>

        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-3 p-1.5 hover:bg-bg-base rounded-lg transition-colors shrink-0"
          >
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-text-base leading-none">{authUser?.profile?.name || 'Admin User'}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold overflow-hidden">
              {getInitials(authUser?.profile?.name || '')}
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-bg-surface rounded-xl shadow-xl border border-border-base py-2 z-50">
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
                  onSettingsClick();
                  setShowUserMenu(false);
                }}
                className="w-full px-4 py-2 text-sm text-text-base hover:bg-bg-base flex items-center gap-3 transition-colors"
              >
                <Settings className="h-4 w-4" /> {t('settings')}
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