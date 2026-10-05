import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterBondRowsByCriteria,
  getTodayIsoForBondFilter,
  inferHeuristicBondFilterCriteria,
  isBondFilterIntent,
  normalizeAIBondRateType,
} from './aiBondFilter';

test('normalizeAIBondRateType handles Vietnamese fixed and floating values', () => {
  assert.equal(normalizeAIBondRateType('Cố định'), 'fixed');
  assert.equal(normalizeAIBondRateType('Thả nổi'), 'floating');
  assert.equal(normalizeAIBondRateType('Fixed'), 'fixed');
  assert.equal(normalizeAIBondRateType('Floating'), 'floating');
});

test('filterBondRowsByCriteria matches Vietnamese interest types', () => {
  const rows = [
    {
      bondCode: 'A',
      issuerName: '',
      issuerSymbol: '',
      bondType: '',
      industry: '',
      issueDate: '',
      maturityDate: '',
      tenorPeriod: 12,
      bondRate: 8,
      bondRateType: 'Cố định',
      currentListedVolume: 0,
      currentListedValue: 0,
      totalIssuedValue: 0,
      totalRemainingDebt: 0,
      totalDebtFull: 0,
      status: '',
      bondInfos: {},
      raw: {},
    },
    {
      bondCode: 'B',
      issuerName: '',
      issuerSymbol: '',
      bondType: '',
      industry: '',
      issueDate: '',
      maturityDate: '',
      tenorPeriod: 12,
      bondRate: 8,
      bondRateType: 'Thả nổi',
      currentListedVolume: 0,
      currentListedValue: 0,
      totalIssuedValue: 0,
      totalRemainingDebt: 0,
      totalDebtFull: 0,
      status: '',
      bondInfos: {},
      raw: {},
    },
  ];

  assert.equal(filterBondRowsByCriteria(rows as any, { bondRateType: 'fixed' } as any).length, 1);
  assert.equal(filterBondRowsByCriteria(rows as any, { bondRateType: 'floating' } as any).length, 1);
});

const makeRow = (overrides: Record<string, unknown>) => ({
  bondCode: '',
  issuerName: '',
  issuerSymbol: '',
  bondType: '',
  industry: '',
  issueDate: '',
  maturityDate: '',
  tenorPeriod: 12,
  bondRate: 8,
  bondRateType: 'Cố định',
  currentListedVolume: 0,
  currentListedValue: 0,
  totalIssuedValue: 0,
  totalRemainingDebt: 0,
  totalDebtFull: 0,
  status: '',
  bondInfos: {},
  raw: {},
  ...overrides,
});

// "Danh sách mã trái phiếu ACB" resolves even when the extracted issuer is a TICKER and the row's
// issuerSymbol is blank: the ticker is found in the bond code (VN bond codes start with the ticker).
test('filterBondRowsByCriteria matches an issuer ticker via bond code / symbol / name', () => {
  const rows = [
    makeRow({ bondCode: 'ACB12203', issuerName: 'Ngân hàng TMCP Á Châu', issuerSymbol: '' }),
    makeRow({ bondCode: 'TCB12102', issuerName: 'Ngân hàng TMCP Kỹ Thương Việt Nam', issuerSymbol: 'TCB' }),
    makeRow({ bondCode: 'VIC12001', issuerName: 'Tập đoàn Vingroup', issuerSymbol: 'VIC' }),
  ];

  // Ticker via bond code prefix, even with empty issuerSymbol.
  assert.equal(filterBondRowsByCriteria(rows as any, { issuer: 'ACB' } as any).length, 1);
  assert.equal(filterBondRowsByCriteria(rows as any, { issuer: 'ACB' } as any)[0].bondCode, 'ACB12203');
  // Ticker via issuerSymbol.
  assert.equal(filterBondRowsByCriteria(rows as any, { issuer: 'TCB' } as any).length, 1);
  // Token-subset name match (different word order / spacing).
  assert.equal(filterBondRowsByCriteria(rows as any, { issuer: 'Vingroup' } as any).length, 1);
  // Unknown issuer returns nothing.
  assert.equal(filterBondRowsByCriteria(rows as any, { issuer: 'XYZ' } as any).length, 0);
});

// The remaining-term criterion must narrow the market-bond list / chat rows too. Those rows carry
// no precomputed `daysLeft`, so the filter now derives it live from `maturityDate`. Uses dates
// relative to today (never a hard-coded date) with wide margins so a timezone wobble can't flip it.
test('filterBondRowsByCriteria applies remaining days by deriving daysLeft from maturityDate', () => {
  const isoOffsetFromToday = (days: number) => {
    const base = new Date();
    const utcMidnight = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
    return new Date(utcMidnight + days * 86_400_000).toISOString().split('T')[0];
  };

  const rows = [
    makeRow({ bondCode: 'SOON', maturityDate: isoOffsetFromToday(3) }),
    makeRow({ bondCode: 'LATER', maturityDate: isoOffsetFromToday(40) }),
  ];

  // "đáo hạn trong vòng 1 tuần" → remainingDaysMax 7: only the bond maturing in ~3 days survives.
  const withinWeek = filterBondRowsByCriteria(rows as any, { remainingDaysMax: 7 } as any);
  assert.equal(withinWeek.length, 1);
  assert.equal(withinWeek[0].bondCode, 'SOON');

  // A precomputed daysLeft is still honored when present.
  const preComputed = [makeRow({ bondCode: 'X', maturityDate: '', daysLeft: 5 })];
  assert.equal(filterBondRowsByCriteria(preComputed as any, { remainingDaysMax: 7 } as any).length, 1);
  assert.equal(filterBondRowsByCriteria(preComputed as any, { remainingDaysMax: 3 } as any).length, 0);
});

// "đáo hạn trong vòng X ..." must become a concrete maturity-date window anchored on TODAY (never a
// stale hard-coded date) and expressed as maturityDateFrom/To — the field the market filter renders
// and can filter on — not remainingDays. Weeks/months/years are supported, not just days.
test('inferHeuristicBondFilterCriteria maps maturity windows to a maturityDate range from today', () => {
  const today = getTodayIsoForBondFilter();
  const shift = (base: string, { days = 0, months = 0, years = 0 }) => {
    const [y, m, d] = base.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCFullYear(dt.getUTCFullYear() + years);
    dt.setUTCMonth(dt.getUTCMonth() + months);
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().split('T')[0];
  };

  const week = inferHeuristicBondFilterCriteria('danh sách trái phiếu đáo hạn trong vòng 1 tuần');
  assert.equal(week.maturityDateFrom, today);
  assert.equal(week.maturityDateTo, shift(today, { days: 7 }));

  const days30 = inferHeuristicBondFilterCriteria('trái phiếu đáo hạn trong 30 ngày');
  assert.equal(days30.maturityDateTo, shift(today, { days: 30 }));

  const months3 = inferHeuristicBondFilterCriteria('đáo hạn 3 tháng tới');
  assert.equal(months3.maturityDateTo, shift(today, { months: 3 }));

  const year1 = inferHeuristicBondFilterCriteria('trái phiếu đáo hạn trong vòng 1 năm');
  assert.equal(year1.maturityDateTo, shift(today, { years: 1 }));

  // A tenor phrase ("kỳ hạn 3 tháng") without a maturity cue must NOT become a maturity window.
  const tenor = inferHeuristicBondFilterCriteria('trái phiếu kỳ hạn 3 tháng');
  assert.equal(tenor.maturityDateFrom, undefined);
  assert.equal(tenor.maturityDateTo, undefined);
});

// Every numeric-range criterion must parse deterministically from Vietnamese phrasing so a filter
// request narrows on it even without the LLM: coupon rate (%), tenor (months, years→×12), issued /
// listed value (tỷ, "nghìn tỷ"→×1000) and listed volume. Covers trên/dưới/từ…đến/trở lên phrasings.
test('inferHeuristicBondFilterCriteria parses each numeric range from text', () => {
  const rateAbove = inferHeuristicBondFilterCriteria('trái phiếu lãi suất trên 8%');
  assert.equal(rateAbove.minBondRate, 8);
  assert.equal(rateAbove.maxBondRate, undefined);

  const rateBetween = inferHeuristicBondFilterCriteria('lãi suất từ 8% đến 10,5%');
  assert.equal(rateBetween.minBondRate, 8);
  assert.equal(rateBetween.maxBondRate, 10.5);

  const rateBelow = inferHeuristicBondFilterCriteria('lãi suất dưới 7%');
  assert.equal(rateBelow.maxBondRate, 7);
  assert.equal(rateBelow.minBondRate, undefined);

  const rateUpward = inferHeuristicBondFilterCriteria('lãi suất 9% trở lên');
  assert.equal(rateUpward.minBondRate, 9);

  const tenorBetween = inferHeuristicBondFilterCriteria('kỳ hạn từ 12 đến 36 tháng');
  assert.equal(tenorBetween.minTenorMonths, 12);
  assert.equal(tenorBetween.maxTenorMonths, 36);

  const tenorYears = inferHeuristicBondFilterCriteria('kỳ hạn trên 2 năm');
  assert.equal(tenorYears.minTenorMonths, 24);

  const issued = inferHeuristicBondFilterCriteria('giá trị phát hành trên 1.000 tỷ');
  assert.equal(issued.minIssuedValueBillion, 1000);

  const issuedThousand = inferHeuristicBondFilterCriteria('giá trị phát hành trên 1 nghìn tỷ');
  assert.equal(issuedThousand.minIssuedValueBillion, 1000);

  const listedValue = inferHeuristicBondFilterCriteria('giá trị niêm yết dưới 500 tỷ');
  assert.equal(listedValue.maxListedValueBillion, 500);

  const listedVolume = inferHeuristicBondFilterCriteria('khối lượng niêm yết trên 1000000');
  assert.equal(listedVolume.minListedVolume, 1000000);
});

// A single request combining many criteria must yield ALL of them at once — the market filter ANDs
// them together — and must not confuse a tenor with a remaining-term or maturity-window phrase.
test('inferHeuristicBondFilterCriteria handles multiple criteria at once', () => {
  const c = inferHeuristicBondFilterCriteria(
    'trái phiếu lãi suất cố định lãi suất trên 8% kỳ hạn dưới 24 tháng giá trị phát hành trên 1000 tỷ',
  );
  assert.equal(c.bondRateType, 'fixed');
  assert.equal(c.minBondRate, 8);
  assert.equal(c.maxTenorMonths, 24);
  assert.equal(c.minIssuedValueBillion, 1000);

  // "kỳ hạn còn lại" is remaining term, never tenor; "đáo hạn trong vòng 1 tuần" is a maturity window.
  const remaining = inferHeuristicBondFilterCriteria('trái phiếu kỳ hạn còn lại dưới 7 ngày');
  assert.equal(remaining.remainingDaysMax, 7);
  assert.equal(remaining.maxTenorMonths, undefined);
  assert.equal(remaining.minTenorMonths, undefined);

  const maturity = inferHeuristicBondFilterCriteria('trái phiếu đáo hạn trong vòng 1 tuần');
  assert.equal(maturity.maxTenorMonths, undefined);
  assert.ok(maturity.maturityDateFrom && maturity.maturityDateTo);
});

// Analytical / aggregate questions must route to grounded Q&A (isBondFilterIntent === false),
// never to the bond-list filter — which can only return individual bonds and would otherwise
// answer every one of them with the same off-topic list. Regression guard for the suggested
// questions and their typed variants.
test('isBondFilterIntent routes analytical questions to Q&A, not the filter', () => {
  const qaQuestions = [
    // Reported suggested questions that were being misrouted to the filter.
    'Top tổ chức phát hành theo dư nợ hiện nay là ai?',
    'Top tổ chức phát hành trong nhóm ngân hàng là ai?',
    'Tóm tắt nhanh danh sách tổ chức phát hành đang được lọc hiện tại.',
    'Nhóm tổ chức phát hành nào đang nổi bật nhất trong kết quả lọc này?',
    'Hiện có bao nhiêu mã trái phiếu trong danh sách toàn thị trường?',
    // Other curated suggestions about the current page / filtered set.
    'Trong kết quả đang lọc, mã nào có lãi suất cao nhất?',
    'Tóm tắt nhanh danh sách trái phiếu theo bộ lọc hiện tại.',
    'Bộ lọc hiện tại đang loại ra những nhóm tổ chức nào?',
    'Mã nào đang có lãi suất cao nhất trên danh sách này?',
    'Tổng quy mô và điểm nổi bật của thị trường trái phiếu hiện tại là gì?',
    'Ngành nào đang có khối lượng trái phiếu lớn nhất?',
    'Lãi suất phát hành của nhóm ngân hàng có điểm gì đáng chú ý?',
  ];

  for (const question of qaQuestions) {
    assert.equal(isBondFilterIntent(question), false, `expected Q&A for: ${question}`);
  }
});

// A question naming a specific bond code (which contains 4+ digits) must not be mistaken for a
// numeric-range filter: the digits inside "CVT12102" previously tripped the `\d{4}` year signal
// and flipped these bond-detail questions into the market-wide filter.
test('isBondFilterIntent does not treat a bond code as a numeric range', () => {
  const qaQuestions = [
    'Lãi suất, kỳ hạn và điểm cần theo dõi của CVT12102 là gì?',
    'Lịch thanh toán và áp lực đáo hạn của CVT12102 hiện ra sao?',
  ];

  for (const question of qaQuestions) {
    assert.equal(isBondFilterIntent(question), false, `expected Q&A for: ${question}`);
  }
});

// Genuine list / sort / criteria commands must still be handled by the filter (=== true),
// so the analytical-question guards above don't over-capture real filter requests.
test('isBondFilterIntent still routes genuine filter commands to the filter', () => {
  const filterCommands = [
    'Lọc trái phiếu lãi suất trên 10%',
    'Liệt kê trái phiếu ngành ngân hàng đáo hạn trong 12 tháng tới',
    'Top trái phiếu lãi suất cao nhất',
    'Trái phiếu lãi suất cố định kỳ hạn từ 12 đến 36 tháng',
    'Sắp xếp theo lãi suất giảm dần',
    'Trái phiếu phát hành trong năm 2024',
    'Có bao nhiêu trái phiếu lãi suất trên 10%?',
  ];

  for (const command of filterCommands) {
    assert.equal(isBondFilterIntent(command), true, `expected filter for: ${command}`);
  }
});
