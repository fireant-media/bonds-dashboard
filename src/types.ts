export type IndustryType = 'Ngân hàng' | 'Chứng khoán' | 'Bất động sản' | 'Khác' | string;

export interface Enterprise {
  id: string;
  ticker: string;
  name: string;
  internationalName?: string;
  industry: IndustryType;
  bondCount: number;
  issuedValue: number;
  initialDebt: number;
  remainingDebt: number;
}

export interface NewsItem {
  id: string;
  source: string;
  sourceUrl?: string;
  title: string;
  summary: string;
  content: string;
  author: string;
  image: string;
  images?: string[];
  date: string;
  url: string;
  category?: string;
  originalUrl?: string;
}

export interface ExpiringBond {
  id: string;
  code: string;
  ticker?: string;
  maturityDate: string;
  interestRate: number;
  listedVolume: number;
  issuerName?: string;
  term?: string;
  issueDate?: string;
  interestType?: string;
}


export interface Bond {
  id: string;
  code: string;
  enterpriseId: string;
  term: string;
  interestRate: number;
  listedVolume: number;
  issuedValue: number;
  listedValue: number;
  issueDate: string;
  maturityDate: string;
  interestType: string;
  status: string;
  cashFlows?: {
    paymentDate: string;
    interestAmount: number;
    principalAmount: number;
    totalCashflow: number;
    bondRate: number;
  }[];
}
