import type { Language } from '../translations';

const normalizeAscii = (value: unknown) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const getLocalizedBondType = (value: unknown, language: Language) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalized = normalizeAscii(text);

  if (normalized.includes('rieng le') || normalized.includes('private placement')) {
    return language === 'en' ? 'Private placement corporate bond' : 'Trái phiếu doanh nghiệp riêng lẻ';
  }

  if (
    (normalized.includes('doanh nghiep') && normalized.includes('cong chung'))
    || normalized.includes('public corporate')
    || normalized.includes('publicly')
  ) {
    return language === 'en' ? 'Publicly issued corporate bond' : 'Trái phiếu doanh nghiệp phát hành ra công chúng';
  }

  if (normalized.includes('chinh quyen dia phuong') || normalized.includes('local authority')) {
    return language === 'en' ? 'Local authority bond' : 'Trái phiếu chính quyền địa phương';
  }

  if (normalized.includes('duoc chinh phu bao lanh') || normalized.includes('government guaranteed')) {
    return language === 'en' ? 'Government-guaranteed bond' : 'Trái phiếu được Chính phủ bảo lãnh';
  }

  if (normalized.includes('chinh phu') || normalized.includes('government bond')) {
    return language === 'en' ? 'Government bond' : 'Trái phiếu Chính phủ';
  }

  if (normalized.includes('doanh nghiep') || normalized.includes('corporate bond')) {
    return language === 'en' ? 'Corporate bond' : 'Trái phiếu doanh nghiệp';
  }

  return text;
};

export const getLocalizedInterestType = (
  value: unknown,
  t: (key: any, ticker?: string) => string,
) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalized = normalizeAscii(text);

  if (normalized.includes('co dinh') || normalized.includes('fixed')) {
    return t('fixed');
  }

  if (normalized.includes('tha noi') || normalized.includes('floating') || normalized.includes('variable')) {
    return t('floating');
  }

  return text;
};

export const getLocalizedBondStatus = (
  value: unknown,
  language: Language,
  t: (key: any, ticker?: string) => string,
) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalized = normalizeAscii(text);

  if (normalized.includes('hieu luc') || normalized.includes('dang luu hanh') || normalized === 'active') {
    return t('active');
  }

  if (normalized.includes('het hieu luc') || normalized.includes('dao han') || normalized === 'inactive') {
    return t('inactive');
  }

  return language === 'en' ? text : text;
};
