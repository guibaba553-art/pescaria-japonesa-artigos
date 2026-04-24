import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index"; // landing — keep eager for fast first paint
import { PageViewTracker } from "./components/PageViewTracker";
import CookieBanner from "./components/CookieBanner";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { AuthProvider } from "./hooks/useAuth";
import { CartProvider } from "./hooks/useCart";

// Lazy-loaded routes — keep the initial bundle small for mobile
const Auth = lazy(() => import("./pages/Auth"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminCatalog = lazy(() => import("./pages/AdminCatalog"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminEmployees = lazy(() => import("./pages/AdminEmployees"));
const Account = lazy(() => import("./pages/Account"));
const Products = lazy(() => import("./pages/Products"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const RemoveLogoBackground = lazy(() => import("./pages/RemoveLogoBackground"));
const PDV = lazy(() => import("./pages/PDV"));
const SalesHistory = lazy(() => import("./pages/SalesHistory"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CashRegister = lazy(() => import("./pages/CashRegister"));
const FiscalTools = lazy(() => import("./pages/FiscalTools"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PoliticaPrivacidade = lazy(() => import("./pages/PoliticaPrivacidade"));
const TermosUso = lazy(() => import("./pages/TermosUso"));
const PoliticaTrocas = lazy(() => import("./pages/PoliticaTrocas"));
const PoliticaFrete = lazy(() => import("./pages/PoliticaFrete"));
const AdminLGPD = lazy(() => import("./pages/AdminLGPD"));
const MeusDados = lazy(() => import("./pages/MeusDados"));
const PickupOrder = lazy(() => import("./pages/PickupOrder"));
const CompletarCadastro = lazy(() => import("./pages/CompletarCadastro"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

const DeferredShell = ({ children, delay = 150 }: { children: ReactNode; delay?: number }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  return mounted ? <>{children}</> : null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <PageViewTracker />
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/admin/catalogo" element={<AdminCatalog />} />
                <Route path="/admin/pedidos" element={<AdminOrders />} />
                <Route path="/admin/funcionarios" element={<AdminEmployees />} />
                <Route path="/pdv" element={<PDV />} />
                <Route path="/pdv/sales-history" element={<SalesHistory />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/fechamento-caixa" element={<CashRegister />} />
                <Route path="/ferramentas-fiscais" element={<FiscalTools />} />
                <Route path="/conta" element={<Account />} />
                <Route path="/produtos" element={<Products />} />
                <Route path="/produto/:id" element={<ProductDetails />} />
                <Route path="/remover-fundo-logo" element={<RemoveLogoBackground />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />
                <Route path="/termos-de-uso" element={<TermosUso />} />
                <Route path="/politica-de-trocas" element={<PoliticaTrocas />} />
                <Route path="/politica-de-frete" element={<PoliticaFrete />} />
                <Route path="/admin/lgpd" element={<AdminLGPD />} />
                <Route path="/meus-dados" element={<MeusDados />} />
                <Route path="/retirada/:id" element={<PickupOrder />} />
                <Route path="/completar-cadastro" element={<CompletarCadastro />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <DeferredShell>
              <MobileBottomNav />
              <CookieBanner />
            </DeferredShell>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
