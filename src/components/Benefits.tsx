import { Truck, Shield, CreditCard, Headphones } from "lucide-react";

const benefits = [
  {
    icon: Truck,
    title: "Entrega Rápida",
    description: "Receba em até 48h em todo Brasil"
  },
  {
    icon: Shield,
    title: "Compra Segura",
    description: "Seus dados protegidos"
  },
  {
    icon: CreditCard,
    title: "Parcele em até 12x",
    description: "Sem juros no cartão"
  },
  {
    icon: Headphones,
    title: "Suporte Especializado",
    description: "Tire suas dúvidas com experts"
  }
];

const Benefits = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {benefits.map((benefit, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <benefit.icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">
                {benefit.title}
              </h3>
              <p className="text-primary-foreground/90">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
