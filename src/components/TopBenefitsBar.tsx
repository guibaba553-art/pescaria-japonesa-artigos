import { Truck, CreditCard, ShieldCheck, RotateCcw } from "lucide-react";

const items = [
  { icon: Truck, label: "Envio rápido", sub: "para todo o Brasil" },
  { icon: CreditCard, label: "Até 10x sem juros", sub: "no cartão" },
  { icon: ShieldCheck, label: "PIX com 5% off", sub: "pagamento na hora" },
  { icon: RotateCcw, label: "Troca garantida", sub: "em até 7 dias" },
];

const TopBenefitsBar = () => {
  return (
    <section className="bg-foreground text-background border-b border-background/10">
      <div className="container mx-auto py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <item.icon className="w-4 h-4 text-primary-glow" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-semibold leading-tight truncate">
                  {item.label}
                </p>
                <p className="text-[10px] sm:text-xs text-background/60 leading-tight truncate">
                  {item.sub}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TopBenefitsBar;
