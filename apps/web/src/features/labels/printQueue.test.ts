import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { printQueue, usePrintQueue } from './printQueue';

beforeEach(() => printQueue.clear());

describe('lista de impresión', () => {
  it('agrega sin duplicar y conserva las cantidades ya cargadas', () => {
    printQueue.add([1, 2]);
    printQueue.setQuantity(1, 5);
    expect(printQueue.add([1, 3])).toBe(1);
    const { result } = renderHook(() => usePrintQueue());
    expect(result.current).toEqual([
      { productId: 1, quantity: 5 },
      { productId: 2, quantity: 1 },
      { productId: 3, quantity: 1 },
    ]);
  });

  it('se guarda en el navegador para no perderla al cambiar de pantalla', () => {
    printQueue.add([7]);
    expect(JSON.parse(localStorage.getItem('etiquetas.printQueue.v1')!)).toEqual([{ productId: 7, quantity: 1 }]);
  });

  it('notifica a la pantalla cuando cambia', () => {
    const { result } = renderHook(() => usePrintQueue());
    act(() => {
      printQueue.add([1, 2, 3]);
      printQueue.remove([2]);
      printQueue.setAllQuantities(2);
    });
    expect(result.current).toEqual([
      { productId: 1, quantity: 2 },
      { productId: 3, quantity: 2 },
    ]);
  });
});
