import { Truck, ShieldCheck, MessageCircle, Award } from "lucide-react";

const benefits = [
  {
    icon: Truck,
    title: "Frete para todo Brasil",
    description: "Envio rápido e seguro pelos Correios e transportadoras parceiras.",
  },
  {
    icon: ShieldCheck,
    title: "Compra protegida",
    description: "Pagamento seguro via Mercado Pago. Seus dados sempre protegidos.",
  },
  {
    icon: MessageCircle,
    title: "Atendimento humano",
    description: "Pescador atende pescador. Tire dúvidas pelo WhatsApp em minutos.",
  },
  {
    icon: Award,
    title: "Marcas selecionadas",
    description: "Trabalhamos apenas com fabricantes reconhecidos no mercado.",
  },
];

const Benefits = () => {
  return (
    <section className="py-24 sm:py-32 bg-foreground text-background relative overflow-hidden">
      {/* Background mesh */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary-glow/20 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto relative">
        <div className="max-w-3xl mb-16 sm:mb-20">
          <p className="text-xs font-semibold text-primary-glow uppercase tracking-[0.2em] mb-4">
            Por que JAPAS
          </p>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-balance leading-[1.05]">
            Mais que uma loja.<br />
            <span className="text-background/50">Um time que entende de pesca.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-background/10 rounded-3xl overflow-hidden border border-background/10">
          {benefits.map((benefit, idx) => (
            <div
              key={idx}
              className="bg-foreground p-8 sm:p-10 flex flex-col gap-5 hover:bg-background/5 transition-colors duration-500"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary-glow">
                <benefit.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-display font-semibold mb-2 leading-tight">
                  {benefit.title}
                </h3>
                <p className="text-sm text-background/60 leading-relaxed">
                  {benefit.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
