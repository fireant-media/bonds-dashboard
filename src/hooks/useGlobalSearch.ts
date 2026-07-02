import { useEffect, useState } from 'react';
import { useLanguage } from '../LanguageContext';
import { getCache, setCache } from '../utils/cache';
import { ENTERPRISE_LIST_DATA_CACHE_KEY, loadEnterpriseListByIssuerSymbol } from '../services/enterpriseListData';
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

const readEnterpriseCache = (primaryKey: string) => {
  const primary = getCache(primaryKey);
  return Array.isArray(primary) && primary.length > 0 ? primary : null;
};

export function useGlobalSearch() {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const loadSearchCaches = async () => {
      const enterpriseCache = readEnterpriseCache(ENTERPRISE_LIST_DATA_CACHE_KEY);
      const bondCache = getCache('comparison_pool_bonds');

      if (!enterpriseCache) {
        try {
          const mappedEnterprises = await loadEnterpriseListByIssuerSymbol();
          if (Array.isArray(mappedEnterprises)) {
            setCache('enterprise_list', mappedEnterprises);
          }
        } catch (error) {
          console.warn('Global search failed to preload enterprise list', error);
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
          console.warn('Global search failed to preload bond pool', error);
        }
      }
    };
    void loadSearchCaches();
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
            enterpriseName: name,
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
            enterpriseName: String(bond.enterpriseName || bond.enterpriseId || ''),
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

          const isBondType = symbolType.includes('bond') || symbolType === '3';
          const isStockType = symbolType.includes('stock') || symbolType.includes('enterprise') || symbolType === '1';

          if (isBondType || isStockType) {
            const type = isBondType ? 'bond' : 'enterprise';
            const title = isBondType ? symbol : (name || symbol);
            const subtitle = isBondType ? (name || item.symbolType || '') : symbol;

            addSuggestion({
              id: symbol,
              type,
              title,
              subtitle,
              code: isBondType ? symbol : undefined,
              ticker: !isBondType ? symbol : undefined,
              enterpriseName: !isBondType ? name || symbol : undefined,
            });
          }
        });
      } catch (error) {
        console.warn('Global search symbol lookup failed', error);
      }

      const normalizedCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const maybeBond = normalizedCode.length >= 3 && /[0-9]/.test(normalizedCode);
      if (maybeBond && !Array.from(suggestionMap.values()).some((s) => s.type === 'bond' && s.code?.toUpperCase() === normalizedCode)) {
        try {
          const bondData = await loadBondDetail(normalizedCode);
          const issuerName = String(bondData?.issuerName || bondData?.issuerSymbol || '');
          addSuggestion({
            id: normalizedCode,
            type: 'bond',
            title: normalizedCode,
            subtitle: issuerName || t('bond'),
            code: normalizedCode,
            enterpriseName: issuerName,
          });
        } catch (error) {
          console.warn('Global search exact bond lookup failed', error);
        }
      }

      if (!active) return;
      setSuggestions(Array.from(suggestionMap.values()));
      setIsSearching(false);
    };

    const timer = window.setTimeout(loadSuggestions, 240);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, t]);

  const resetSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowDropdown(false);
  };

  return {
    searchQuery,
    setSearchQuery,
    suggestions,
    isSearching,
    showDropdown,
    setShowDropdown,
    resetSearch,
  };
}
