import fs from "node:fs";
import path from "node:path";

import { ADMIN_FIREANT_EMAILS } from "./config";

// =============================================================================
// Access control store (allowlist of FireAnt accounts allowed to use the app).
//
// Source of truth is a JSON file on disk managed by the Express server. There is
// no database in this project, so a file store fits the localhost/self-host target.
// Emails in ADMIN_FIREANT (env) are ROOT admins: always allowed, always admin, and
// cannot be edited/removed via the API (their `locked` flag is derived at runtime).
// =============================================================================

export type AccessRole = "admin" | "user";

export interface AccessUser {
  email: string;
  role: AccessRole;
  enabled: boolean;
  addedBy?: string;
  addedAt?: string;
  lastLoginAt?: string;
}

/** A store user plus the runtime-derived `locked` flag (true = defined via ADMIN_FIREANT env). */
export interface AccessUserView extends AccessUser {
  locked: boolean;
}

export interface AccessDecision {
  allowed: boolean;
  role: AccessRole;
  isAdmin: boolean;
  /** True when access control is active (at least one admin exists). */
  enforced: boolean;
}

interface StoreShape {
  users: AccessUser[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "access-control.json");

const normalizeEmail = (email: unknown): string =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const isEnvAdmin = (email: string): boolean => ADMIN_FIREANT_EMAILS.includes(normalizeEmail(email));

let cache: StoreShape | null = null;

const readStore = (): StoreShape => {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const users = Array.isArray(parsed?.users) ? parsed.users : [];
    cache = {
      users: users
        .filter((u: any) => u && typeof u.email === "string")
        .map((u: any) => ({
          email: normalizeEmail(u.email),
          role: u.role === "admin" ? "admin" : "user",
          enabled: u.enabled !== false,
          addedBy: typeof u.addedBy === "string" ? u.addedBy : undefined,
          addedAt: typeof u.addedAt === "string" ? u.addedAt : undefined,
          lastLoginAt: typeof u.lastLoginAt === "string" ? u.lastLoginAt : undefined,
        })),
    };
  } catch {
    // Missing/corrupt file -> start empty.
    cache = { users: [] };
  }
  return cache;
};

const writeStore = (store: StoreShape): void => {
  cache = store;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (error) {
    console.error("[AccessControl] Failed to persist store:", (error as Error).message);
  }
};

const findUser = (store: StoreShape, email: string): AccessUser | undefined =>
  store.users.find((u) => u.email === normalizeEmail(email));

/**
 * Enforcement is ON as soon as at least one admin exists (from env or promoted in the store).
 * When OFF (no admin configured yet) the app stays open — any FireAnt login is allowed — so an
 * un-configured deployment is never bricked. A warning is logged so operators set ADMIN_FIREANT.
 */
export const isEnforcementEnabled = (): boolean => {
  if (ADMIN_FIREANT_EMAILS.length > 0) return true;
  return readStore().users.some((u) => u.role === "admin" && u.enabled);
};

export const getAccessForEmail = (rawEmail: string): AccessDecision => {
  const email = normalizeEmail(rawEmail);
  const enforced = isEnforcementEnabled();

  if (!email) {
    return { allowed: !enforced, role: "user", isAdmin: false, enforced };
  }

  if (isEnvAdmin(email)) {
    return { allowed: true, role: "admin", isAdmin: true, enforced };
  }

  const entry = findUser(readStore(), email);
  if (entry) {
    if (!entry.enabled) return { allowed: false, role: entry.role, isAdmin: false, enforced };
    return { allowed: true, role: entry.role, isAdmin: entry.role === "admin", enforced };
  }

  // Not on the list: denied when enforcing, allowed (as plain user) in open mode.
  if (!enforced) {
    console.warn(
      "[AccessControl] No admin configured (ADMIN_FIREANT empty) — running in OPEN mode; set ADMIN_FIREANT to enable access control.",
    );
    return { allowed: true, role: "user", isAdmin: false, enforced };
  }
  return { allowed: false, role: "user", isAdmin: false, enforced };
};

/** Merged view: env admins (locked) + stored users. Sorted admins-first then by email. */
export const listUsers = (): AccessUserView[] => {
  const store = readStore();
  const byEmail = new Map<string, AccessUserView>();

  for (const u of store.users) {
    byEmail.set(u.email, { ...u, locked: false });
  }

  // Env admins always appear as locked admins (env overrides any stored role/enabled).
  for (const email of ADMIN_FIREANT_EMAILS) {
    const existing = byEmail.get(email);
    byEmail.set(email, {
      email,
      role: "admin",
      enabled: true,
      locked: true,
      addedBy: existing?.addedBy ?? "env",
      addedAt: existing?.addedAt,
      lastLoginAt: existing?.lastLoginAt,
    });
  }

  return Array.from(byEmail.values()).sort((a, b) => {
    if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
    return a.email.localeCompare(b.email);
  });
};

export interface UpsertInput {
  email: string;
  role?: AccessRole;
  enabled?: boolean;
  addedBy?: string;
}

export interface UpsertResult {
  ok: boolean;
  user?: AccessUserView;
  error?: string;
}

export const upsertUser = (input: UpsertInput): UpsertResult => {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Email không hợp lệ." };
  }
  if (isEnvAdmin(email)) {
    return { ok: false, error: "Tài khoản admin cấu hình trong .env, không thể chỉnh sửa tại đây." };
  }

  const store = readStore();
  const existing = findUser(store, email);
  const role: AccessRole = input.role === "admin" ? "admin" : input.role === "user" ? "user" : existing?.role ?? "user";
  const enabled = typeof input.enabled === "boolean" ? input.enabled : existing?.enabled ?? true;

  const next: AccessUser = {
    email,
    role,
    enabled,
    addedBy: existing?.addedBy ?? input.addedBy,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastLoginAt: existing?.lastLoginAt,
  };

  const users = existing
    ? store.users.map((u) => (u.email === email ? next : u))
    : [...store.users, next];
  writeStore({ users });
  return { ok: true, user: { ...next, locked: false } };
};

export const removeUser = (rawEmail: string): UpsertResult => {
  const email = normalizeEmail(rawEmail);
  if (isEnvAdmin(email)) {
    return { ok: false, error: "Tài khoản admin cấu hình trong .env, không thể xóa tại đây." };
  }
  const store = readStore();
  const existing = findUser(store, email);
  if (!existing) return { ok: false, error: "Không tìm thấy tài khoản." };
  writeStore({ users: store.users.filter((u) => u.email !== email) });
  return { ok: true, user: { ...existing, locked: false } };
};

/** Stamp last-login time for an allowed account (creates a locked-admin entry for env admins). */
export const recordLogin = (rawEmail: string): void => {
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  const store = readStore();
  const existing = findUser(store, email);
  const now = new Date().toISOString();

  if (existing) {
    writeStore({
      users: store.users.map((u) => (u.email === email ? { ...u, lastLoginAt: now } : u)),
    });
    return;
  }

  // Persist env admins on first login so /admin shows their last-login; skip unknown accounts.
  if (isEnvAdmin(email)) {
    writeStore({
      users: [...store.users, { email, role: "admin", enabled: true, addedBy: "env", addedAt: now, lastLoginAt: now }],
    });
  }
};
