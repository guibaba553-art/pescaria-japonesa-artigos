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
    // Sobe o limite de aviso para esconder ruído (ainda otimizamos com manualChunks)
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Separa vendors pesados em chunks próprios — assim a home não precisa
        // baixar tudo de uma vez e o cache do navegador é melhor aproveitado
        // entre páginas/visitas.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (id.includes("@huggingface/transformers") || id.includes("onnxruntime")) {
            return "transformers";
          }
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }
          if (id.includes("@supabase")) {
            return "supabase";
          }
          if (id.includes("react-router")) {
            return "router";
          }
          if (id.includes("@radix-ui")) {
            return "radix";
          }
          if (
            id.includes("react-dom") ||
            id.includes("scheduler") ||
            (id.includes("/react/") && !id.includes("react-router"))
          ) {
            return "react";
          }
          if (id.includes("@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("lucide-react")) {
            return "icons";
          }
          if (id.includes("date-fns")) {
            return "date-fns";
          }
        },
      },
    },
  },
}));
