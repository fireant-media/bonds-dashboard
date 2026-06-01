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
      className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold bg-action-accent text-slate-950 transition-colors hover:opacity-95 disabled:opacity-70 whitespace-nowrap shrink-0"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span>{t('exportExcel')}</span>
    </button>
  );
}
