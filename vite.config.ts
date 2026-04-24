import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Mantém o aviso mais alto porque isolamos apenas o que é realmente pesado.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Evita dividir bibliotecas centrais demais em muitos chunks, porque isso
        // pode gerar erros de inicialização no build publicado. Mantemos separado
        // apenas o pacote de IA da remoção de fundo, que é muito pesado.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@huggingface/transformers") || id.includes("onnxruntime")) {
            return "transformers";
          }
        },
      },
    },
  },
}));
