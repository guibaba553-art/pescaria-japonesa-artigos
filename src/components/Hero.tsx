import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import fishingHeroBg from "@/assets/fishing-hero-bg.jpg";

const Hero = () => {
  const navigate = useNavigate();

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden pt-28 pb-20">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-105"
        style={{ backgroundImage: `url(${fishingHeroBg})` }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-hero" />
      <div className="absolute inset-0 gradient-mesh opacity-60" />

      {/* Bottom fade to background */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />

      <div className="container mx-auto relative z-10">
        <div className="max-w-4xl">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8 animate-fade-in-down">
            <Sparkles className="w-3.5 h-3.5 text-primary-glow" />
            <span className="text-xs font-medium text-white/90 tracking-wide uppercase">
              Loja oficial · Sinop, MT
            </span>
          </div>

          {/* Main heading */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold text-white text-balance leading-[1.02] mb-6 animate-fade-in-up">
            Equipamento de
            <br />
            <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              pesca premium.
            </span>
          </h1>

          {/* Subheading */}
          <p
            className="text-lg sm:text-xl text-white/80 max-w-2xl mb-10 text-pretty leading-relaxed animate-fade-in-up"
            style={{ animationDelay: '120ms', animationFillMode: 'backwards' }}
          >
            Varas, carretilhas, iscas e acessórios selecionados para pescadores que
            não abrem mão de qualidade. Frete para todo o Brasil.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-3 animate-fade-in-up"
            style={{ animationDelay: '240ms', animationFillMode: 'backwards' }}
          >
            <Button
              size="lg"
              onClick={() => navigate('/produtos')}
              className="h-14 px-8 rounded-full text-base font-semibold shadow-glow group btn-press"
            >
              Explorar produtos
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate('/produtos?featured=true')}
              className="h-14 px-8 rounded-full text-base font-semibold bg-white/10 backdrop-blur-md border-white/30 text-white hover:bg-white/20 hover:text-white btn-press"
            >
              Ver destaques
            </Button>
          </div>

          {/* Stats */}
          <div
            className="grid grid-cols-3 gap-6 sm:gap-12 mt-16 max-w-2xl animate-fade-in-up"
            style={{ animationDelay: '360ms', animationFillMode: 'backwards' }}
          >
            {[
              { n: '500+', l: 'Produtos' },
              { n: '4.9★', l: 'Avaliação' },
              { n: '24h', l: 'Resposta' },
            ].map((s) => (
              <div key={s.l} className="border-l-2 border-primary/60 pl-4">
                <div className="text-2xl sm:text-3xl font-display font-bold text-white">{s.n}</div>
                <div className="text-xs sm:text-sm text-white/60 mt-1 uppercase tracking-wider">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center gap-2 text-white/50 animate-float">
        <span className="text-[10px] uppercase tracking-[0.2em]">Role para explorar</span>
        <div className="w-px h-10 bg-gradient-to-b from-white/50 to-transparent" />
      </div>
    </section>
  );
};

export default Hero;
