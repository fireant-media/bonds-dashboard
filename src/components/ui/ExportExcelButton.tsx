import { Loader2, Download } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';

interface ExportExcelButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ExportExcelButton({ loading = false, disabled = false, onClick }: ExportExcelButtonProps) {
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-lg bg-action-accent px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-950 transition-all hover:opacity-90 disabled:opacity-70 whitespace-nowrap shrink-0"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span>{t('exportExcel')}</span>
    </button>
  );
}
