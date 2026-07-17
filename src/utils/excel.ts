import * as XLSX from 'xlsx';

export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export interface ExcelExportColumn<T> {
  header: string;
  value: (row: T, index: number) => ExcelCellValue;
}

export interface ExcelExportOptions<T> {
  fileNameBase: string;
  sheetName: string;
  columns: ExcelExportColumn<T>[];
  rows: T[];
}

const pad = (value: number) => String(value).padStart(2, '0');

export const formatExportTimestamp = (date = new Date()) => {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

export const sanitizeFileName = (value: string) => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_');
};

const sanitizeSheetName = (value: string) => {
  const trimmed = value.replace(/[\\/?*\[\]:]/g, ' ').trim();
  return trimmed.slice(0, 31) || 'Sheet1';
};

const cellToText = (value: ExcelCellValue) => {
  if (value == null) return '';
  if (value instanceof Date) return value.toLocaleDateString('vi-VN');
  return String(value);
};

export const exportRowsToExcel = <T,>({
  fileNameBase,
  sheetName,
  columns,
  rows,
}: ExcelExportOptions<T>) => {
  const headerRow = columns.map((column) => column.header);
  const dataRows = rows.map((row, rowIndex) => columns.map((column) => column.value(row, rowIndex)));
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  const widths = columns.map((column, columnIndex) => {
    const values: ExcelCellValue[] = [column.header, ...dataRows.map((row) => row[columnIndex])];
    const maxLength = values.reduce<number>((max, value) => {
      const text = cellToText(value);
      return Math.max(max, text.length);
    }, 0);

    return { wch: Math.min(Math.max(maxLength + 2, 12), 40) };
  });
  worksheet['!cols'] = widths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheetName));

  XLSX.writeFile(workbook, `${sanitizeFileName(fileNameBase)}_${formatExportTimestamp()}.xlsx`);
};
