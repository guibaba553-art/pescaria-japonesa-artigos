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
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-primary/20 to-background/80" />
      
      <div className="container mx-auto px-4 py-20 relative z-10">
        <div className="flex flex-col items-center text-center space-y-8 animate-fade-in">
          <div className="relative">
            <div className="absolute inset-0 blur-3xl opacity-30 bg-gradient-to-r from-primary to-secondary rounded-full" />
            <img 
              src={japaLogo} 
              alt="JAPA - Pesca e Conveniência" 
              className="w-64 h-64 object-contain drop-shadow-2xl relative z-10 hover:scale-105 transition-transform duration-300"
            />
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold text-white max-w-4xl leading-tight">
            Sua Loja Completa de
            <span className="block bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent mt-4 animate-pulse">
              Artigos de Pesca
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-white/90 max-w-2xl font-medium drop-shadow-lg">
            Equipamentos de qualidade, preços competitivos e atendimento especializado para todos os pescadores
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-6">
            <Button 
              size="lg" 
              className="text-lg px-10 py-7 bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-[0_0_30px_rgba(14,165,233,0.5)] hover:shadow-[0_0_50px_rgba(14,165,233,0.7)] border-2 border-primary-glow/50 font-bold transition-all duration-300 hover:scale-105"
              onClick={() => navigate('/produtos')}
            >
              <ShoppingCart className="mr-2 h-6 w-6" />
              Ver Produtos
            </Button>
          </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background via-background/50 to-transparent" />
    </section>
  );
};

export default Hero;
