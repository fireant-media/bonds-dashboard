export interface UserAccount {
  id: string;
  membership: UserMembership;
  profile: UserProfile;
  identityData: UserIdentityData;
  identityVerified: boolean;
  moneyAccount: MoneyAccount;
  hasPinCode: boolean;
}

export interface UserMembership {
  level: number; // 0: Free, 1: Basic, 2: Pro, 3: Premium
  endDate: Date | null;
  applications: SubscribedApplication[];
}

export interface SubscribedApplication {
  id: number; // 0: Web, 1: Mobile, 2: MetaKit, 3: Excel
  version: number; // 0: Free, 1: Basic, 2: Pro, 3: Premium
  endDate: Date | null;
}

export interface UserProfile {
  id: string;
  name: string;
  bio: string;
  address: string;
  website: string;
  totalPosts: number;
  totalLikes: number;
  followers: number;
  following: number;
  followed: boolean;
  isExpert: boolean;
  blocked: boolean;
  beingBlocked: boolean;
  groups: number;
}

export interface UserIdentityData {
  identityName: string;
  identityNumber: string;
  address: string;
  dateOfBirth: Date;
  sex: string;
  hometown: string;
  nationality: string;
  features: string;
  issueDate: Date;
  issueLocation: string;
  phoneNumber: string;
  email: string;
}

export interface MoneyAccount {
  accountID: number;
  totalBalance: number;
  blockedBalance: number;
  availableBalance: number;
  updatedDate: Date;
  mxvInvestorCode: string | null;
  fMarketID: string | null;
  fMarketStatus: string | null;
}
