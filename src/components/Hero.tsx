import { Button } from "@/components/ui/button";
import { ArrowRight, Tag, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import fishingHeroBg from "@/assets/fishing-hero-bg.jpg";

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="relative overflow-hidden">
      {/* Main banner */}
      <div className="relative min-h-[380px] sm:min-h-[480px] md:min-h-[560px] flex items-center pt-6 pb-8 sm:pt-8 sm:pb-12">
        {/* Background image with strong dark overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${fishingHeroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-foreground/95 via-foreground/85 to-foreground/40 sm:from-foreground/95 sm:via-foreground/85 sm:to-foreground/40" />

        <div className="container mx-auto relative z-10">
          <div className="max-w-2xl">
            {/* Heading */}
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-black text-background leading-[1.05] mb-3 sm:mb-4 animate-fade-in-up">
              O melhor da pesca,<br />
              <span className="text-primary-glow">pelo menor preço.</span>
            </h1>

            {/* Subheading with key value props */}
            <p
              className="text-sm sm:text-lg text-background/85 mb-5 sm:mb-6 leading-relaxed animate-fade-in-up max-w-xl"
              style={{ animationDelay: "100ms", animationFillMode: "backwards" }}
            >
              Mais de 500 produtos com preços imbatíveis.
              <span className="font-bold text-background"> 10x sem juros</span> e
              <span className="font-bold text-background"> frete</span> para todo Brasil.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 animate-fade-in-up"
              style={{ animationDelay: "200ms", animationFillMode: "backwards" }}
            >
              <Button
                size="lg"
                onClick={() => navigate("/produtos?on_sale=true")}
                className="h-12 sm:h-13 px-6 sm:px-7 rounded-full text-sm sm:text-base font-black shadow-glow group btn-press w-full sm:w-auto"
              >
                <Tag className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />
                Ver ofertas
                <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/produtos")}
                className="h-12 sm:h-13 px-6 sm:px-7 rounded-full text-sm sm:text-base font-bold bg-background/10 backdrop-blur-md border-background/30 text-background hover:bg-background/20 hover:text-background btn-press w-full sm:w-auto"
              >
                Ver catálogo completo
              </Button>
            </div>


          </div>
        </div>
      </div>

      {/* Promo strip below hero */}
      <div className="bg-primary text-primary-foreground py-2 sm:py-2.5 overflow-hidden">
        <div className="container mx-auto">
          <div className="flex items-center justify-center gap-2 text-[11px] sm:text-sm font-bold uppercase tracking-wider text-center px-2">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current animate-pulse shrink-0" />
            <span className="line-clamp-1">Frete para todo Brasil · 10x sem juros · Troca grátis em 7 dias</span>
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current animate-pulse shrink-0" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
