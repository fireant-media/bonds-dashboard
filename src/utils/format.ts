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

/**
 * Định dạng ngày tháng theo chuẩn Việt Nam: dd-mm-yyyy
 */
export const formatDate = (dateString: string | undefined | null): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
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
