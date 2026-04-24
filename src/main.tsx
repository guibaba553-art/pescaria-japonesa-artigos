import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

const BootSplash = () => (
  <div className="min-h-screen bg-background flex items-center justify-center px-6">
    <div className="flex flex-col items-center gap-4 text-center animate-fade-in">
      <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      <div>
        <p className="font-display text-xl font-black tracking-tight">
          JAPAS<span className="text-primary">.</span>
        </p>
        <p className="text-sm text-muted-foreground">Carregando loja...</p>
      </div>
    </div>
  </div>
);

root.render(
  <StrictMode>
    <HelmetProvider>
      <BootSplash />
    </HelmetProvider>
  </StrictMode>
);

void import("./App.tsx").then(({ default: App }) => {
  root.render(
    <StrictMode>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </StrictMode>
  );
});
