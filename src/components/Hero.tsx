import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import japaLogo from "@/assets/japa-logo.png";
import fishingHeroBg from "@/assets/fishing-hero-bg.jpg";

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      <div 
        className="absolute inset-0 bg-cover bg-center" 
        style={{ backgroundImage: `url(${fishingHeroBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-background" />
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
          <img 
            src={japaLogo} 
            alt="JAPAS - Pesca e Conveniência" 
            className="w-64 h-64 object-contain drop-shadow-2xl"
          />
          
          <h1 className="text-5xl md:text-7xl font-bold text-foreground max-w-4xl">
            Sua Loja Completa de
            <span className="block text-primary mt-2">Artigos de Pesca</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl">
            Equipamentos de qualidade, preços competitivos e atendimento especializado para pescadores de todo o Mato Grosso
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Button 
              size="lg" 
              className="text-lg px-8 py-6 bg-primary hover:bg-primary/90 shadow-glow"
              onClick={() => navigate('/produtos')}
            >
              <ShoppingCart className="mr-2 h-5 w-5" />
              Ver Produtos
            </Button>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
