import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getCookieConsent } from './CookieBanner';

const SESSION_KEY = 'jp_session_id';

function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function detectDevice(ua: string): string {
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  return 'desktop';
}

function shouldTrack(path: string): boolean {
  // Skip admin/internal pages
  const blocked = ['/admin', '/dashboard', '/pdv', '/fechamento-caixa', '/ferramentas-fiscais', '/auth', '/forgot-password', '/reset-password', '/conta', '/remover-fundo-logo', '/meus-dados'];
  return !blocked.some((p) => path.startsWith(p));
}

export function PageViewTracker() {
  const location = useLocation();
  const lastPath = useRef<string>('');
  const [consent, setConsent] = useState(getCookieConsent());
  const { isAdmin, isEmployee, loading: authLoading } = useAuth();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as 'accepted' | 'essential';
      setConsent(detail);
    };
    window.addEventListener('cookie-consent-changed', handler);
    return () => window.removeEventListener('cookie-consent-changed', handler);
  }, []);

  useEffect(() => {
    // LGPD: only track analytics with explicit consent
    if (consent !== 'accepted') return;
    // Wait for auth resolution to avoid counting staff before role is known
    if (authLoading) return;
    // Skip internal users (admin/employee) from analytics
    if (isAdmin || isEmployee) return;

    const path = location.pathname;
    if (path === lastPath.current) return;
    if (!shouldTrack(path)) {
      lastPath.current = path;
      return;
    }
    lastPath.current = path;

    const ua = navigator.userAgent;
    const referrer = document.referrer || null;

    supabase.auth.getUser().then(({ data }) => {
      supabase.from('site_visits').insert({
        path,
        referrer,
        user_agent: ua,
        session_id: getSessionId(),
        user_id: data.user?.id ?? null,
        device_type: detectDevice(ua),
      }).then(() => {
        // ignore errors silently
      });
    });
  }, [location.pathname, consent, isAdmin, isEmployee, authLoading]);

  return null;
}

