import axios from "axios";

import { cleanTokenString, getFireantToken } from "../utils/token";
import { buildAppApiUrl } from "./config";

// Send the user's FireAnt token so the server can verify identity for the access/admin decision
// (same header the AI client uses). Cookies carry the signed session for subsequent admin calls.
const authHeaders = (): Record<string, string> => {
  const token = getFireantToken();
  return token ? { "X-Fireant-Access-Token": cleanTokenString(token) } : {};
};

export interface AuthAccessResult {
  allowed: boolean;
  isAdmin: boolean;
  role: string;
  enforced: boolean;
  email: string;
  verified?: boolean;
}

export interface LoginUserData {
  id: string;
  email: string;
  name: string;
}

export interface AdminUser {
  email: string;
  role: "admin" | "user";
  enabled: boolean;
  locked: boolean;
  addedBy?: string;
  addedAt?: string;
  lastLoginAt?: string;
}

export async function postAuthLogin(userData: LoginUserData): Promise<AuthAccessResult> {
  const { data } = await axios.post<AuthAccessResult>(
    buildAppApiUrl("/api/auth/login"),
    { userData },
    { headers: authHeaders(), withCredentials: true, timeout: 15000 },
  );
  return data;
}

export async function postAuthLogout(): Promise<void> {
  await axios.post(buildAppApiUrl("/api/auth/logout"), {}, { withCredentials: true, timeout: 8000 });
}

export async function fetchSessionAccess(): Promise<AuthAccessResult> {
  const { data } = await axios.get<AuthAccessResult>(buildAppApiUrl("/api/auth/session"), {
    headers: authHeaders(),
    withCredentials: true,
    timeout: 8000,
  });
  return data;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data } = await axios.get<{ users: AdminUser[] }>(buildAppApiUrl("/api/admin/users"), {
    headers: authHeaders(),
    withCredentials: true,
    timeout: 12000,
  });
  return Array.isArray(data?.users) ? data.users : [];
}

export interface SaveAdminUserInput {
  email: string;
  role?: "admin" | "user";
  enabled?: boolean;
}

export async function saveAdminUser(input: SaveAdminUserInput): Promise<AdminUser[]> {
  const { data } = await axios.post<{ users: AdminUser[] }>(buildAppApiUrl("/api/admin/users"), input, {
    headers: authHeaders(),
    withCredentials: true,
    timeout: 12000,
  });
  return Array.isArray(data?.users) ? data.users : [];
}

export async function deleteAdminUser(email: string): Promise<AdminUser[]> {
  const { data } = await axios.delete<{ users: AdminUser[] }>(
    buildAppApiUrl(`/api/admin/users/${encodeURIComponent(email)}`),
    { headers: authHeaders(), withCredentials: true, timeout: 12000 },
  );
  return Array.isArray(data?.users) ? data.users : [];
}
