import { useCallback, useEffect, useRef } from 'react';

// Atualiza dados quando o usuário volta para o navegador ou reabre uma aba
// interna da aplicação. As telas são mantidas montadas com display:none, então
// apenas visibilitychange não percebe a troca de seção; o IntersectionObserver
// cobre esse segundo caso sem polling permanente.
export default function useRefreshOnFocus(refresh, { minIntervalMs = 1500 } = {}) {
  const refreshRef = useRef(refresh);
  const lastRunRef = useRef(Date.now());
  const wasVisibleRef = useRef(null);
  const observerRef = useRef(null);
  const runRef = useRef(() => {});

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  runRef.current = () => {
    if (document.hidden || Date.now() - lastRunRef.current < minIntervalMs) return;
    lastRunRef.current = Date.now();
    Promise.resolve(refreshRef.current?.()).catch(() => {});
  };

  // Callback ref: continua observando quando uma tela troca o skeleton pelo
  // conteúdo real e, portanto, substitui o nó raiz após a primeira carga.
  const setElementRef = useCallback((node) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    wasVisibleRef.current = null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    observerRef.current = new IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting);
      if (visible && wasVisibleRef.current === false) runRef.current();
      wasVisibleRef.current = visible;
    }, { threshold: 0.01 });
    observerRef.current.observe(node);
  }, []);

  useEffect(() => {
    const onFocus = () => runRef.current();
    const onVisibility = () => { if (!document.hidden) runRef.current(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      observerRef.current?.disconnect();
    };
  }, []);

  return setElementRef;
}
