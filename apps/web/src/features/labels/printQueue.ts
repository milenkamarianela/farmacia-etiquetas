import { useSyncExternalStore } from 'react';

/**
 * Lista de productos a imprimir. Se guarda en el navegador para no perderla al cambiar de pantalla
 * o recargar. Solo guarda ids y cantidades: los datos y precios se leen siempre frescos del servidor.
 */
export interface QueueItem {
  productId: number;
  quantity: number;
}

const STORAGE_KEY = 'etiquetas.printQueue.v1';
const listeners = new Set<() => void>();

function load(): QueueItem[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueueItem =>
        Number.isInteger(item?.productId) && Number.isInteger(item?.quantity) && item.quantity > 0,
    );
  } catch {
    return [];
  }
}

let current: QueueItem[] = load();

function save(next: QueueItem[]) {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Sin almacenamiento (modo privado): la lista dura mientras la pestaña esté abierta.
  }
  for (const listener of listeners) listener();
}

export const printQueue = {
  /** Agrega productos al final (los que ya estaban conservan su cantidad). */
  add(ids: number[]) {
    const present = new Set(current.map((item) => item.productId));
    const added = ids.filter((id) => !present.has(id)).map((productId) => ({ productId, quantity: 1 }));
    if (added.length > 0) save([...current, ...added]);
    return added.length;
  },
  setQuantity(productId: number, quantity: number) {
    save(current.map((item) => (item.productId === productId ? { ...item, quantity } : item)));
  },
  setAllQuantities(quantity: number) {
    save(current.map((item) => ({ ...item, quantity })));
  },
  remove(productIds: number[]) {
    const removed = new Set(productIds);
    save(current.filter((item) => !removed.has(item.productId)));
  },
  clear() {
    save([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrintQueue(): QueueItem[] {
  return useSyncExternalStore(subscribe, () => current);
}
