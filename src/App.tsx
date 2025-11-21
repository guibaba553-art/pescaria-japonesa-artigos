import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import Account from "./pages/Account";
import Products from "./pages/Products";
import ProductDetails from "./pages/ProductDetails";
import RemoveLogoBackground from "./pages/RemoveLogoBackground";
import PDV from "./pages/PDV";
import Dashboard from "./pages/Dashboard";
import CashRegister from "./pages/CashRegister";
import FiscalTools from "./pages/FiscalTools";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/pdv" element={<PDV />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/fechamento-caixa" element={<CashRegister />} />
          <Route path="/ferramentas-fiscais" element={<FiscalTools />} />
          <Route path="/conta" element={<Account />} />
          <Route path="/produtos" element={<Products />} />
          <Route path="/produto/:id" element={<ProductDetails />} />
          <Route path="/remover-fundo-logo" element={<RemoveLogoBackground />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
