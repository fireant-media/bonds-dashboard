export type ActivityLogAction = 'login' | 'logout';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: ActivityLogAction;
  location: string;
  device: string;
}

const STORAGE_PREFIX = 'sentinel_activity_log_v1';
const SESSION_LOGIN_MARKER_PREFIX = 'sentinel_activity_login_marker_v1';
const MAX_ACTIVITY_LOGS = 100;

const normalizeUserId = (userId: string) => userId.trim().toLowerCase();

const canUseStorage = () =>
  typeof window !== 'undefined' &&
  typeof window.localStorage !== 'undefined' &&
  typeof window.sessionStorage !== 'undefined';

const getStorageKey = (userId: string) => `${STORAGE_PREFIX}:${normalizeUserId(userId)}`;
const getSessionLoginMarkerKey = (userId: string) => `${SESSION_LOGIN_MARKER_PREFIX}:${normalizeUserId(userId)}`;

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const LOCATION_FALLBACK = 'Unknown';

const formatRegion = (locale: string) => {
  const regionCode = locale.split('-')[1];
  if (!regionCode) return '';

  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(regionCode) || regionCode;
  } catch {
    return regionCode;
  }
};

const getApproximateLocation = () => {
  if (typeof navigator === 'undefined') return LOCATION_FALLBACK;

  const locale = navigator.languages?.[0] || navigator.language || 'en-US';
  const region = formatRegion(locale);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ') || '';

  const locationParts = [city, region].filter(Boolean);
  if (locationParts.length > 0) return locationParts.join(', ');
  if (timeZone) return timeZone.replace(/_/g, ' ');
  return locale || LOCATION_FALLBACK;
};

const resolveBestLocation = async (): Promise<string> => {
  return getApproximateLocation();
};

const detectPlatform = () => {
  if (typeof navigator === 'undefined') return 'Unknown device';

  const userAgent = navigator.userAgent;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';

  if (/iphone/i.test(userAgent)) return 'iPhone';
  if (/ipad/i.test(userAgent)) return 'iPad';
  if (/android/i.test(userAgent)) return 'Android';
  if (/mac/i.test(platform) || /mac os x/i.test(userAgent)) return 'macOS';
  if (/win/i.test(platform) || /windows/i.test(userAgent)) return 'Windows';
  if (/linux/i.test(platform) || /linux/i.test(userAgent)) return 'Linux';

  return 'Desktop';
};

const detectBrowser = () => {
  if (typeof navigator === 'undefined') return 'Unknown browser';

  const userAgent = navigator.userAgent;

  if (/edg/i.test(userAgent)) return 'Edge';
  if (/opr\//i.test(userAgent) || /opera/i.test(userAgent)) return 'Opera';
  if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) return 'Chrome';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/firefox/i.test(userAgent)) return 'Firefox';

  return 'Browser';
};

const getDeviceLabel = () => `${detectBrowser()} / ${detectPlatform()}`;

export const getActivityLogEntries = (userId: string): ActivityLogEntry[] => {
  if (!canUseStorage() || !userId.trim()) return [];
  return parseJson<ActivityLogEntry[]>(window.localStorage.getItem(getStorageKey(userId)), []);
};

const saveActivityLogEntries = (userId: string, entries: ActivityLogEntry[]) => {
  if (!canUseStorage() || !userId.trim()) return;
  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(entries.slice(0, MAX_ACTIVITY_LOGS)));
};

export const appendActivityLogEntry = async (userId: string, action: ActivityLogAction): Promise<ActivityLogEntry[]> => {
  if (!canUseStorage() || !userId.trim()) return [];

  const nextEntry: ActivityLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: new Date().toISOString(),
    action,
    location: await resolveBestLocation(),
    device: getDeviceLabel(),
  };

  const currentEntries = getActivityLogEntries(userId);
  const nextEntries = [nextEntry, ...currentEntries];
  saveActivityLogEntries(userId, nextEntries);
  return nextEntries.slice(0, MAX_ACTIVITY_LOGS);
};

export const recordLoginActivityOncePerSession = async (userId: string) => {
  if (!canUseStorage() || !userId.trim()) return;

  const markerKey = getSessionLoginMarkerKey(userId);
  if (window.sessionStorage.getItem(markerKey) === '1') return;

  await appendActivityLogEntry(userId, 'login');
  window.sessionStorage.setItem(markerKey, '1');
};

export const recordLogoutActivity = async (userId: string) => {
  if (!canUseStorage() || !userId.trim()) return;
  await appendActivityLogEntry(userId, 'logout');
  window.sessionStorage.removeItem(getSessionLoginMarkerKey(userId));
};
