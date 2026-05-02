/**
 * Định dạng số theo chuẩn Việt Nam:
 * - Dấu ngăn cách hàng nghìn: dấu "."
 * - Dấu ngăn cách phần thập phân: dấu ","
 * - Nếu là số nguyên: không hiển thị phần thập phân
 * - Nếu là số thập phân: hiển thị tối đa 2 chữ số sau dấu phẩy
 */
export const formatNumber = (num: number | undefined | null, decimals: number = 2): string => {
  if (num === undefined || num === null) return '0';
  
  // Kiểm tra nếu là số nguyên
  const isInteger = num % 1 === 0;
  
  return num.toLocaleString('vi-VN', {
    minimumFractionDigits: isInteger ? 0 : 0,
    maximumFractionDigits: isInteger ? 0 : decimals,
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
