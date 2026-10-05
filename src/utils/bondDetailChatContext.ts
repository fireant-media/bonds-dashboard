interface BaseBondChatContextSnapshot {
  routePathname: string;
  label: string;
  dataset: Record<string, unknown>;
  updatedAt: string;
}

export interface BondDetailChatContextSnapshot extends BaseBondChatContextSnapshot {
  kind: 'bond-detail';
  bondCode: string;
  issuerSymbol: string;
  issuerName: string;
}

export interface BondComparisonChatContextSnapshot extends BaseBondChatContextSnapshot {
  kind: 'bond-comparison';
  bondCodes: string[];
  issuerSymbols: string[];
}

export type BondChatContextSnapshot =
  | BondDetailChatContextSnapshot
  | BondComparisonChatContextSnapshot;

const BOND_CHAT_CONTEXT_EVENT = 'sentinel:bond-chat-context';

let activeBondChatContext: BondChatContextSnapshot | null = null;

function emitBondChatContext() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(BOND_CHAT_CONTEXT_EVENT, {
      detail: activeBondChatContext,
    }),
  );
}

export function getBondChatContext() {
  return activeBondChatContext;
}

export function setBondChatContext(snapshot: BondChatContextSnapshot) {
  activeBondChatContext = snapshot;
  emitBondChatContext();
}

export function clearBondChatContext(match?: string | string[]) {
  if (!activeBondChatContext) return;

  if (typeof match === 'string') {
    if (activeBondChatContext.kind === 'bond-detail' && activeBondChatContext.bondCode !== match) return;
    if (activeBondChatContext.kind === 'bond-comparison' && !activeBondChatContext.bondCodes.includes(match)) return;
  }

  if (Array.isArray(match) && activeBondChatContext.kind === 'bond-comparison') {
    const currentCodes = [...activeBondChatContext.bondCodes].sort().join('|');
    const matchCodes = [...match].sort().join('|');
    if (currentCodes !== matchCodes) return;
  }

  activeBondChatContext = null;
  emitBondChatContext();
}

export function subscribeBondChatContext(
  listener: (snapshot: BondChatContextSnapshot | null) => void,
) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<BondChatContextSnapshot | null>;
    listener(customEvent.detail ?? null);
  };

  window.addEventListener(BOND_CHAT_CONTEXT_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(BOND_CHAT_CONTEXT_EVENT, handler as EventListener);
  };
}

export function getBondDetailChatContext() {
  const snapshot = getBondChatContext();
  return snapshot?.kind === 'bond-detail' ? snapshot : null;
}

export function setBondDetailChatContext(snapshot: BondDetailChatContextSnapshot) {
  setBondChatContext(snapshot);
}

export function clearBondDetailChatContext(bondCode?: string) {
  clearBondChatContext(bondCode);
}

export function subscribeBondDetailChatContext(
  listener: (snapshot: BondChatContextSnapshot | null) => void,
) {
  return subscribeBondChatContext(listener);
}
