import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { useGlobalSearch, type SearchSuggestion } from '../hooks/useGlobalSearch';

interface GlobalSearchProps {
  onSearchSelect: (suggestion: SearchSuggestion) => void;
  autoFocus?: boolean;
  showCloseButton?: boolean;
  onClose?: () => void;
  onAfterSelect?: () => void;
}

export default function GlobalSearch({
  onSearchSelect,
  autoFocus = false,
  showCloseButton = false,
  onClose,
  onAfterSelect,
}: GlobalSearchProps) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    searchQuery,
    setSearchQuery,
    suggestions,
    isSearching,
    showDropdown,
    setShowDropdown,
    resetSearch,
  } = useGlobalSearch();

  useEffect(() => {
    if (autoFocus) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [autoFocus]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [setShowDropdown]);

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    resetSearch();
    onSearchSelect(suggestion);
    onAfterSelect?.();
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search className="h-4 w-4 text-text-muted" />
      </div>
      <input
        ref={inputRef}
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        type="text"
        aria-label={t('searchPlaceholder')}
        className="block w-full rounded-lg border border-border-base bg-bg-surface py-2 pl-10 pr-9 text-sm font-medium text-text-base placeholder-text-muted shadow-sm shadow-blue-950/5 transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400/20"
        placeholder={t('searchPlaceholder')}
      />
      {showCloseButton ? (
        <button
          type="button"
          onClick={() => {
            resetSearch();
            onClose?.();
          }}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-muted transition-colors hover:text-blue-600"
          aria-label={t('close')}
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}

      {showDropdown && (suggestions.length > 0 || isSearching) && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-lg border border-border-base bg-surface-bright shadow-xl shadow-blue-950/10 md:max-h-96 dark:shadow-black/30">
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
  );
}
