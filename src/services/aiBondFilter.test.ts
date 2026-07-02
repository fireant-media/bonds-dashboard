import assert from 'node:assert/strict';
import test from 'node:test';

import { filterBondRowsByCriteria, normalizeAIBondRateType } from './aiBondFilter';

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
