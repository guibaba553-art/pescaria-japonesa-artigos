import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";

// Sessão sempre persistente — o Supabase mantém o token no localStorage e renova
// automaticamente. Não removemos o token em beforeunload pois isso desconectava
// o usuário ao navegar entre páginas e ao fechar o navegador.
if (typeof window !== "undefined") {
  // Limpa flag legada que podia derrubar a sessão em versões anteriores.
  sessionStorage.removeItem("japas:sessionOnly");
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </StrictMode>
);
