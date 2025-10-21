import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Cart } from "@/components/Cart";
import japaLogo from "@/assets/japa-logo.png";

const Hero = () => {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin } = useAuth();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-muted/30">
      <div className="absolute top-6 right-6 z-20">
        <Cart />
      </div>
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1544551763-46a013bb70d5?q=80&w=2070')] bg-cover bg-center opacity-10" />
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
          <img 
            src={japaLogo} 
            alt="JAPA - Pesca e Conveniência" 
            className="w-64 h-64 object-contain drop-shadow-2xl"
          />
          
          <h1 className="text-5xl md:text-7xl font-bold text-foreground max-w-4xl">
            Sua Loja Completa de
            <span className="block text-primary mt-2">Artigos de Pesca</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
            Equipamentos de qualidade, preços competitivos e atendimento especializado para todos os pescadores
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button size="lg" className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 shadow-glow">
              <ShoppingCart className="mr-2 h-5 w-5" />
              Ver Produtos
            </Button>
            {(isEmployee || isAdmin) && (
              <Button 
                size="lg" 
                variant="secondary" 
                className="text-lg px-8 py-6"
                onClick={() => navigate('/admin')}
              >
                Painel Admin
              </Button>
            )}
            {!user && (
              <Button 
                size="lg" 
                variant="outline" 
                className="text-lg px-8 py-6 border-2 border-primary text-primary hover:bg-primary/10"
                onClick={() => navigate('/auth')}
              >
                Entrar / Cadastrar
              </Button>
            )}
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
