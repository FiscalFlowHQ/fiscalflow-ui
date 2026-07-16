import type { RunStatus } from "../types/api";
import { SESSIONS_STORAGE_KEY, type LocalSession } from "../types/session";

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readRaw(): LocalSession[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isLocalSession);
  } catch {
    return [];
  }
}

function isLocalSession(value: unknown): value is LocalSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.threadId === "string" &&
    typeof s.title === "string" &&
    typeof s.createdAt === "string" &&
    typeof s.lastOpenedAt === "string"
  );
}

function writeRaw(sessions: LocalSession[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

/** Sort newest activity first (`lastOpenedAt` desc). */
export function sortSessions(sessions: LocalSession[]): LocalSession[] {
  return [...sessions].sort(
    (a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime()
  );
}

export function loadSessions(): LocalSession[] {
  return sortSessions(readRaw());
}

export function saveSessions(sessions: LocalSession[]): void {
  writeRaw(sortSessions(sessions));
}

export function defaultSessionTitle(threadId: string): string {
  return `FDD run · ${threadId.slice(0, 8)}`;
}

export function createLocalSession(threadId: string, title?: string): LocalSession {
  const now = new Date().toISOString();
  return {
    threadId,
    title: title ?? defaultSessionTitle(threadId),
    createdAt: now,
    lastOpenedAt: now,
  };
}

/** Insert or replace a session; returns the updated list. */
export function upsertSession(session: LocalSession): LocalSession[] {
  const next = readRaw().filter((s) => s.threadId !== session.threadId);
  next.push(session);
  const sorted = sortSessions(next);
  writeRaw(sorted);
  return sorted;
}

export function removeSession(threadId: string): LocalSession[] {
  const sorted = sortSessions(readRaw().filter((s) => s.threadId !== threadId));
  writeRaw(sorted);
  return sorted;
}

export function touchOpened(threadId: string): LocalSession[] {
  const now = new Date().toISOString();
  const next = readRaw().map((s) =>
    s.threadId === threadId ? { ...s, lastOpenedAt: now } : s
  );
  const sorted = sortSessions(next);
  writeRaw(sorted);
  return sorted;
}

export function patchSession(
  threadId: string,
  patch: Partial<
    Pick<LocalSession, "title" | "documentRef" | "lastRunStatus" | "paused" | "lastOpenedAt">
  >
): LocalSession[] {
  const next = readRaw().map((s) => (s.threadId === threadId ? { ...s, ...patch } : s));
  const sorted = sortSessions(next);
  writeRaw(sorted);
  return sorted;
}

export function clearSessionsForTests(): void {
  if (canUseStorage()) localStorage.removeItem(SESSIONS_STORAGE_KEY);
}

export type { RunStatus };
