import { useEffect, useState } from 'react';

// Retorna uma cópia de `value` que só é atualizada depois que ele fica
// `delay` ms sem mudar. Serve para não disparar uma requisição a cada
// tecla digitada num campo de busca (evita spam de rede e race conditions).
export default function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
