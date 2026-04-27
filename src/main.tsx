import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

// "Lembrar de mim": se o usuário NÃO marcou na tela de login, limpa o token do
// Supabase ao fechar o navegador (a flag é setada em src/pages/Auth.tsx).
if (typeof window !== "undefined") {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const authKey = `sb-${projectId}-auth-token`;
  window.addEventListener("beforeunload", () => {
    if (sessionStorage.getItem("japas:sessionOnly") === "1") {
      localStorage.removeItem(authKey);
    }
  });
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
