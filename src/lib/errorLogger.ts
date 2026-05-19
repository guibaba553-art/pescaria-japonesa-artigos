import { supabase } from "@/integrations/supabase/client";

let installed = false;
const recent = new Map<string, number>();

async function logError(payload: {
  message: string;
  stack?: string | null;
  source?: string;
  severity?: string;
  context?: Record<string, unknown>;
}) {
  try {
    const key = (payload.message || "") + "|" + (payload.stack || "").slice(0, 200);
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < 5000) return;
    recent.set(key, now);
    if (recent.size > 100) {
      const firstKey = recent.keys().next().value;
      if (firstKey) recent.delete(firstKey);
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert([{
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      message: (payload.message || "Unknown error").slice(0, 2000),
      stack: payload.stack ? String(payload.stack).slice(0, 8000) : null,
      source: payload.source ?? null,
      url: typeof window !== "undefined" ? window.location.href : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      severity: payload.severity ?? "error",
      context: (payload.context ?? null) as never,
    }] as never);
  } catch {
    // silent
  }
}

export function installGlobalErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error as Error | undefined;
    logError({
      message: err?.message || event.message || "window.error",
      stack: err?.stack,
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "window.error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const err = reason instanceof Error ? reason : null;
    logError({
      message: err?.message || (typeof reason === "string" ? reason : "Unhandled promise rejection"),
      stack: err?.stack || (reason ? JSON.stringify(reason).slice(0, 4000) : undefined),
      source: "unhandledrejection",
    });
  });

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const first = args[0];
      const err = args.find((a) => a instanceof Error) as Error | undefined;
      const message = err?.message || (typeof first === "string" ? first : JSON.stringify(first));
      logError({
        message: message || "console.error",
        stack: err?.stack,
        source: "console.error",
        severity: "error",
      });
    } catch { /* noop */ }
    origError(...args);
  };
}

export { logError };
