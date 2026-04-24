import { MessageCircle, MapPin, Truck, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Banner promocional da home — destaca WhatsApp, loja física e envio.
 * Substitui a antiga propaganda do "PIX 5% OFF".
 */
const PromoBanner = () => {
  const whatsappNumber = "5566996019093"; // Ajuste conforme necessário
  const whatsappMessage = encodeURIComponent(
    "Olá! Vim pelo site e quero tirar uma dúvida sobre um produto."
  );

  return (
    <section className="py-8 sm:py-12 bg-gradient-to-br from-foreground via-foreground to-foreground/95 text-background relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-primary-glow/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-10 items-center">
          {/* Texto principal */}
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 text-primary-glow mb-3">
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">
                Atendimento personalizado
              </span>
            </div>

            <h2 className="text-2xl sm:text-4xl md:text-5xl font-display font-black leading-[1.05] mb-3 sm:mb-4">
              Tem dúvida sobre um produto?{" "}
              <span className="text-primary-glow">
                Fale com a gente no WhatsApp.
              </span>
            </h2>

            <p className="text-sm sm:text-base text-background/75 mb-5 sm:mb-6 max-w-xl">
              Nosso time de pescadores experientes te ajuda a escolher o
              equipamento ideal — da vara ao molinete, passando por iscas, linhas
              e acessórios. Resposta rápida, sem enrolação.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <Button
                asChild
                size="lg"
                className="h-12 px-6 rounded-full text-sm sm:text-base font-black shadow-glow group btn-press w-full sm:w-auto bg-[#25D366] hover:bg-[#20BD5C] text-white"
              >
                <a
                  href={`https://wa.me/${whatsappNumber}?text=${whatsappMessage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Falar no WhatsApp"
                >
                  <MessageCircle className="mr-2 w-4 h-4 sm:w-5 sm:h-5 fill-current" />
                  Chamar no WhatsApp
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 px-6 rounded-full text-sm sm:text-base font-bold bg-background/10 backdrop-blur-md border-background/30 text-background hover:bg-background/20 hover:text-background btn-press w-full sm:w-auto"
              >
                <a href="tel:+5566996019093" aria-label="Ligar para a loja">
                  <Phone className="mr-2 w-4 h-4 sm:w-5 sm:h-5" />
                  Ligar agora
                </a>
              </Button>
            </div>
          </div>

          {/* Cards de destaque */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-background/5 border border-background/10 backdrop-blur-sm">
              <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-primary-glow" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide">
                  Loja física em Sinop/MT
                </p>
                <p className="text-xs text-background/70 mt-0.5 leading-snug">
                  Venha conferir nossos produtos pessoalmente — equipe pronta
                  para te receber.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-background/5 border border-background/10 backdrop-blur-sm">
              <div className="w-10 h-10 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                <Truck className="w-5 h-5 text-primary-glow" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide">
                  Envio rápido para todo Brasil
                </p>
                <p className="text-xs text-background/70 mt-0.5 leading-snug">
                  Pedidos despachados em até 24h úteis. Frete calculado pelos
                  Correios e transportadoras parceiras.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PromoBanner;
