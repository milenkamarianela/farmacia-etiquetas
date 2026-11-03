import { useEffect, useState } from 'react';

/** Devuelve el valor recién cuando dejó de cambiar durante `delayMs` (para no buscar en cada tecla). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
