export interface ViewChatContextSnapshot {
  routePathname: string;
  label: string;
  dataset: Record<string, unknown>;
  updatedAt: string;
}

const VIEW_CHAT_CONTEXT_EVENT = 'sentinel:view-chat-context';

let activeViewChatContext: ViewChatContextSnapshot | null = null;

function normalizePathname(pathname: string) {
  return String(pathname || '').trim();
}

function emitViewChatContext() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(VIEW_CHAT_CONTEXT_EVENT, {
      detail: activeViewChatContext,
    }),
  );
}

export function getViewChatContext(pathname?: string) {
  if (!activeViewChatContext) return null;
  if (!pathname) return activeViewChatContext;

  return normalizePathname(activeViewChatContext.routePathname) === normalizePathname(pathname)
    ? activeViewChatContext
    : null;
}

export function setViewChatContext(snapshot: ViewChatContextSnapshot) {
  activeViewChatContext = snapshot;
  emitViewChatContext();
}

export function clearViewChatContext(match?: string) {
  if (!activeViewChatContext) return;
  if (match && normalizePathname(activeViewChatContext.routePathname) !== normalizePathname(match)) return;

  activeViewChatContext = null;
  emitViewChatContext();
}

export function subscribeViewChatContext(
  listener: (snapshot: ViewChatContextSnapshot | null) => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ViewChatContextSnapshot | null>;
    listener(customEvent.detail ?? null);
  };

  window.addEventListener(VIEW_CHAT_CONTEXT_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(VIEW_CHAT_CONTEXT_EVENT, handler as EventListener);
  };
}
