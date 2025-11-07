import { Header } from "@/components/Header";
import Footer from "@/components/Footer";
import { StoreSettingsForm } from "@/components/StoreSettingsForm";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const StoreSettings = () => {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Configurações da Loja</h1>
            <p className="text-muted-foreground">
              Personalize as informações e aparência da sua loja
            </p>
          </div>
          <StoreSettingsForm />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default StoreSettings;
