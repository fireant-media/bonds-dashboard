import { Loader2, Download } from 'lucide-react';

interface ExportExcelButtonProps {
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function ExportExcelButton({ loading = false, disabled = false, onClick }: ExportExcelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg uppercase tracking-wider transition-all disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span>Xuất Excel</span>
    </button>
  );
}
