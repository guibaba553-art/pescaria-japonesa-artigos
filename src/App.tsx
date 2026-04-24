import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import AdminCatalog from "./pages/AdminCatalog";
import AdminOrders from "./pages/AdminOrders";
import AdminEmployees from "./pages/AdminEmployees";
import Account from "./pages/Account";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import RemoveLogoBackground from "./pages/RemoveLogoBackground";
import PDV from "./pages/PDV";
import SalesHistory from "./pages/SalesHistory";
import Dashboard from "./pages/Dashboard";
import CashRegister from "./pages/CashRegister";
import FiscalTools from "./pages/FiscalTools";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade";
import TermosUso from "./pages/TermosUso";
import PoliticaTrocas from "./pages/PoliticaTrocas";
import MeusDados from "./pages/MeusDados";
import PickupOrder from "./pages/PickupOrder";
import { PageViewTracker } from "./components/PageViewTracker";
import CookieBanner from "./components/CookieBanner";
import { MobileBottomNav } from "./components/MobileBottomNav";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageViewTracker />
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
          <Route path="/meus-dados" element={<MeusDados />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <MobileBottomNav />
        <CookieBanner />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
