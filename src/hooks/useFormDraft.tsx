import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Salva o conteúdo de um formulário automaticamente no localStorage para
 * evitar perda de dados se a aba fechar / travar / der refresh antes do salvamento.
 *
 * - Auto-save com debounce (800ms)
 * - Aviso "beforeunload" enquanto houver rascunho
 * - API simples para restaurar / descartar
 */
export function useFormDraft<T extends Record<string, any>>(
  key: string,
  data: T,
  options: { enabled?: boolean; debounceMs?: number } = {}
) {
  const { enabled = true, debounceMs = 800 } = options;
  const storageKey = `lovable-draft:${key}`;
  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem(storageKey);
    } catch {
      return false;
    }
  });
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.__savedAt ?? null;
    } catch {
      return null;
    }
  });
  const timeoutRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  // Auto-save com debounce
  useEffect(() => {
    if (!enabled) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      try {
        const payload = { ...data, __savedAt: Date.now() };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setHasDraft(true);
        setDraftSavedAt(payload.__savedAt);
        dirtyRef.current = true;
      } catch {
        // localStorage cheio ou indisponível: ignorar silenciosamente
      }
    }, debounceMs);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [data, enabled, debounceMs, storageKey]);

  // Aviso ao fechar aba se houver rascunho não confirmado
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled]);

  const getDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      delete parsed.__savedAt;
      return parsed as T;
    } catch {
      return null;
    }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setHasDraft(false);
    setDraftSavedAt(null);
    dirtyRef.current = false;
  }, [storageKey]);

  return { hasDraft, draftSavedAt, getDraft, clearDraft };
}
