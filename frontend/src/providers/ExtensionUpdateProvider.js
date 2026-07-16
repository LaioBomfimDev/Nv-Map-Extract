import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRequestId,
  deriveUpdateStatus,
  readUpdateMetadataCache,
  sanitizeUpdateMetadata,
  UPDATE_STATUS,
  writeUpdateMetadataCache,
} from '../utils/extensionUpdates';

const ExtensionUpdateContext = createContext(null);
const DETECTION_TIMEOUT_MS = 2200;
const OPEN_EXTENSIONS_TIMEOUT_MS = 3500;
const FETCH_TIMEOUT_MS = 8000;

function getPageOrigin() {
  return window.location.origin;
}

function getMetadataUrl() {
  const publicPath = String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${publicPath}/updates.json`;
}

function readExtensionMarker() {
  const root = document.documentElement;
  const installed = root.getAttribute('data-fm-extension') === '1';
  return {
    installed,
    version: installed ? (root.getAttribute('data-fm-extension-version') || '') : '',
    name: installed ? (root.getAttribute('data-fm-extension-name') || 'Friendly Miner Extractor') : '',
  };
}

export function ExtensionUpdateProvider({ children }) {
  const [metadata, setMetadata] = useState(null);
  const [metadataPhase, setMetadataPhase] = useState('checking');
  const [metadataError, setMetadataError] = useState('');
  const [metadataCachedAt, setMetadataCachedAt] = useState(null);
  const [extension, setExtension] = useState({ installed: false, version: '', name: '' });
  const [extensionPhase, setExtensionPhase] = useState('checking');
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const detectionTimerRef = useRef(null);
  const pendingRequestsRef = useRef(new Map());
  const mountedRef = useRef(true);

  const settleExtension = useCallback((nextExtension) => {
    if (!mountedRef.current) return;
    clearTimeout(detectionTimerRef.current);
    setExtension(nextExtension);
    setExtensionPhase(nextExtension.installed ? 'ready' : 'missing');
    setLastCheckedAt(Date.now());
  }, []);

  const detectExtension = useCallback(() => {
    clearTimeout(detectionTimerRef.current);
    setExtensionPhase('checking');

    const marker = readExtensionMarker();
    if (marker.installed) {
      settleExtension(marker);
    }

    const requestId = createRequestId('status');
    window.postMessage({ __fm: 'site', action: 'getExtensionStatus', requestId }, getPageOrigin());
    detectionTimerRef.current = setTimeout(() => {
      const latestMarker = readExtensionMarker();
      settleExtension(latestMarker.installed
        ? latestMarker
        : { installed: false, version: '', name: '' });
    }, DETECTION_TIMEOUT_MS);
  }, [settleExtension]);

  const loadMetadata = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    const baseUrl = window.location.href;
    const cache = readUpdateMetadataCache(window.localStorage, now, baseUrl);

    if (!force && cache?.isFresh) {
      setMetadata(cache.metadata);
      setMetadataCachedAt(cache.cachedAt);
      setMetadataError('');
      setMetadataPhase('ready');
      setLastCheckedAt(now);
      return cache.metadata;
    }

    if (cache?.metadata) {
      setMetadata(cache.metadata);
      setMetadataCachedAt(cache.cachedAt);
    }
    setMetadataPhase('checking');
    setMetadataError('');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const separator = getMetadataUrl().includes('?') ? '&' : '?';
      const response = await fetch(`${getMetadataUrl()}${separator}ts=${now}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`O catálogo respondeu com o código ${response.status}.`);
      const nextMetadata = sanitizeUpdateMetadata(await response.json(), baseUrl);
      if (!mountedRef.current) return null;

      setMetadata(nextMetadata);
      setMetadataCachedAt(now);
      setMetadataError('');
      setMetadataPhase('ready');
      setLastCheckedAt(Date.now());
      writeUpdateMetadataCache(window.localStorage, nextMetadata, now);
      return nextMetadata;
    } catch (error) {
      if (!mountedRef.current) return null;
      const message = error?.name === 'AbortError'
        ? 'A verificação demorou demais. Confira sua conexão e tente novamente.'
        : (error?.message || 'Não foi possível carregar o catálogo de atualizações.');
      setMetadataError(message);
      setMetadataPhase('error');
      setLastCheckedAt(Date.now());
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const checkNow = useCallback(async () => {
    detectExtension();
    return loadMetadata({ force: true });
  }, [detectExtension, loadMetadata]);

  const openExtensionsPage = useCallback(() => new Promise((resolve) => {
    const requestId = createRequestId('open-extensions');
    const timeout = setTimeout(() => {
      pendingRequestsRef.current.delete(requestId);
      resolve({
        ok: false,
        reason: 'timeout',
        message: 'A extensão não confirmou a abertura. Use o botão “Copiar endereço”.',
      });
    }, OPEN_EXTENSIONS_TIMEOUT_MS);

    pendingRequestsRef.current.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
    window.postMessage({ __fm: 'site', action: 'openExtensionsPage', requestId }, getPageOrigin());
  }), []);

  useEffect(() => {
    mountedRef.current = true;
    const pendingRequests = pendingRequestsRef.current;

    function onMessage(event) {
      if (event.source !== window || event.origin !== getPageOrigin()) return;
      const data = event.data || {};
      if (data.__fm !== 'extension') return;

      if (data.action === 'status' && data.installed) {
        settleExtension({
          installed: true,
          version: typeof data.version === 'string' ? data.version : '',
          name: typeof data.name === 'string' ? data.name : 'Friendly Miner Extractor',
        });
        return;
      }

      if (data.action === 'openExtensionsPageAck' && data.requestId) {
        const settle = pendingRequestsRef.current.get(data.requestId);
        if (!settle) return;
        pendingRequestsRef.current.delete(data.requestId);
        settle({
          ok: data.ok === true,
          reason: data.ok === true ? 'opened' : 'extensionError',
          message: data.ok === true
            ? 'A página de extensões foi aberta em uma nova aba.'
            : (data.error || 'O Chrome não permitiu abrir a página de extensões.'),
        });
      }
    }

    window.addEventListener('message', onMessage);
    detectExtension();
    loadMetadata();

    function recheckWhenVisible() {
      if (!document.hidden) detectExtension();
    }
    document.addEventListener('visibilitychange', recheckWhenVisible);

    return () => {
      mountedRef.current = false;
      clearTimeout(detectionTimerRef.current);
      pendingRequests.forEach(settle => settle({
        ok: false,
        reason: 'unmounted',
        message: 'A verificação foi interrompida.',
      }));
      pendingRequests.clear();
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', recheckWhenVisible);
    };
  }, [detectExtension, loadMetadata, settleExtension]);

  const latest = metadata?.latest || null;
  const status = deriveUpdateStatus({
    extensionPhase,
    metadataPhase,
    installed: extension.installed,
    installedVersion: extension.version,
    latestVersion: latest?.version || '',
    minimumSupportedVersion: latest?.minimumSupportedVersion || '0.0.0',
  });

  const value = useMemo(() => ({
    status,
    isChecking: status === UPDATE_STATUS.CHECKING,
    hasUpdate: [UPDATE_STATUS.OUTDATED, UPDATE_STATUS.INCOMPATIBLE].includes(status),
    isBlocking: status === UPDATE_STATUS.INCOMPATIBLE,
    extension,
    metadata,
    latest,
    history: metadata?.history || [],
    metadataError,
    metadataCachedAt,
    lastCheckedAt,
    checkNow,
    openExtensionsPage,
  }), [
    checkNow,
    extension,
    latest,
    lastCheckedAt,
    metadata,
    metadataCachedAt,
    metadataError,
    openExtensionsPage,
    status,
  ]);

  return (
    <ExtensionUpdateContext.Provider value={value}>
      {children}
    </ExtensionUpdateContext.Provider>
  );
}

export function useExtensionUpdates() {
  const context = useContext(ExtensionUpdateContext);
  if (!context) {
    throw new Error('useExtensionUpdates deve ser usado dentro de ExtensionUpdateProvider.');
  }
  return context;
}

export function useOptionalExtensionUpdates() {
  return useContext(ExtensionUpdateContext);
}
