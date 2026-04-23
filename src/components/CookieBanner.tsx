import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "cookie-consent-v1";

type Consent = "accepted" | "essential" | null;

export const getCookieConsent = (): Consent => {
  if (typeof window === "undefined") return null;
  return (localStorage.getItem(STORAGE_KEY) as Consent) || null;
};

export const CookieBanner = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!getCookieConsent()) setShow(true);
  }, []);

  const handle = (value: Exclude<Consent, null>) => {
    localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: value }));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-0 inset-x-0 z-50 p-4 md:p-6"
    >
      <div className="max-w-5xl mx-auto bg-card border border-border shadow-2xl rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="rounded-full bg-primary/10 p-2 shrink-0">
              <Cookie className="w-5 h-5 text-primary" />
            </div>
            <div className="text-sm text-foreground">
              <p className="font-semibold mb-1">Sua privacidade é importante</p>
              <p className="text-muted-foreground">
                Usamos cookies essenciais ao funcionamento do site e, com seu consentimento, cookies
                analíticos para melhorar sua experiência. Saiba mais na{" "}
                <Link to="/politica-privacidade" className="text-primary underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 md:shrink-0">
            <Button variant="outline" size="sm" onClick={() => handle("essential")}>
              Apenas essenciais
            </Button>
            <Button size="sm" onClick={() => handle("accepted")}>
              Aceitar todos
            </Button>
            <button
              aria-label="Fechar"
              className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted text-muted-foreground"
              onClick={() => handle("essential")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
