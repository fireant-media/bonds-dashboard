/**
 * Định dạng số theo chuẩn Việt Nam:
 * - Dấu ngăn cách hàng nghìn: dấu "."
 * - Dấu ngăn cách phần thập phân: dấu ","
 * - Nếu là số nguyên: không hiển thị phần thập phân
 * - Nếu là số thập phân: hiển thị tối đa 2 chữ số sau dấu phẩy
 */
export const formatNumber = (num: number | string | undefined | null, decimals: number = 2): string => {
  if (num === undefined || num === null) return '0';
  
  const numberValue = Number(num);
  if (!Number.isFinite(numberValue)) return '0';
  
  return numberValue.toLocaleString('vi-VN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(0, decimals),
  });
};

export const formatBondVolumeByThreshold = (num: number | string | undefined | null) => {
  if (num === undefined || num === null) {
    return { value: '0', unitScale: 'thousand' as const };
  }

  const numberValue = Number(num);
  if (!Number.isFinite(numberValue)) {
    return { value: '0', unitScale: 'thousand' as const };
  }

  if (Math.abs(numberValue) >= 1_000_000) {
    return {
      value: formatNumber(numberValue / 1_000_000, 2),
      unitScale: 'million' as const,
    };
  }

  return {
    value: formatNumber(numberValue / 1_000, 2),
    unitScale: 'thousand' as const,
  };
};

export const parseDateToTimestamp = (dateValue: string | undefined | null): number | null => {
  if (!dateValue) return null;

  const raw = String(dateValue).trim();
  if (!raw) return null;

  const ddMmYyyy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyy) {
    const [, day, month, year] = ddMmYyyy;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  const yyyyMmDd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyyMmDd) {
    const [, year, month, day] = yyyyMmDd;
    const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  const parsed = new Date(raw);
  const timestamp = parsed.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

/**
 * Định dạng ngày tháng theo chuẩn Việt Nam: dd-mm-yyyy
 */
export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'N/A';
  try {
    const timestamp = parseDateToTimestamp(dateString);
    if (timestamp === null) return dateString;
    const date = new Date(timestamp);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  } catch (e) {
    return dateString;
  }
};

/**
 * Định dạng lãi suất: 
 * - Sử dụng định dạng số chuẩn Việt Nam
 */
export const formatInterestRate = (rate: number | undefined | null): string => {
  return formatNumber(rate, 2);
};

export const normalizeInterestType = (rawInterestType: any, paymentMethod: any = '', cashFlows: any[] = []): string => {
  const rawValue = rawInterestType ?? '';
  const rawType = String(rawValue).trim();
  const normalizedRawType = rawType.toLowerCase();

  if (rawType && !/^(n\/a|na|unknown|undefined|null|\-)$/.test(normalizedRawType)) {
    return rawType;
  }

  const method = String(paymentMethod || '').toLowerCase();
  const asciiMethod = method.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cashFlowRates = Array.isArray(cashFlows)
    ? cashFlows.map((cf: any) => cf?.bondRate).filter((rate: any) => rate !== undefined && rate !== null)
    : [];
  const hasCashFlowRate = cashFlowRates.length > 0;
  const hasConstantCashRate = cashFlowRates.length > 1 && cashFlowRates.every((rate: any) => rate === cashFlowRates[0]);
  const hasVariableCashRate = cashFlowRates.length > 1 && cashFlowRates.some((rate: any) => rate !== cashFlowRates[0]);

  if (/thả nổi|floating|variable|linh hoạt|flo/i.test(method) || /tha noi|floating|variable|linh hoat|flo/.test(asciiMethod) || hasVariableCashRate) {
    return 'Floating';
  }
  if (
    /cố định|fixed|fixed rate|định/i.test(method) ||
    /co dinh|fixed|fixed rate|dinh ky|tra sau|thanh toan/.test(asciiMethod) ||
    hasConstantCashRate ||
    hasCashFlowRate
  ) {
    return 'Fixed';
  }

  return '';
};
