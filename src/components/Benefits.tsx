import { Shield, CreditCard, Headphones } from "lucide-react";

const benefits = [
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
    <section className="py-24 bg-gradient-to-br from-primary via-primary-glow to-secondary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-20" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {benefits.map((benefit, index) => (
            <div key={index} className="text-center group hover:scale-105 transition-transform duration-300">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-xl group-hover:bg-white/30 group-hover:shadow-2xl transition-all duration-300 border-2 border-white/30">
                <benefit.icon className="w-10 h-10 text-white drop-shadow-lg" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white drop-shadow-md">
                {benefit.title}
              </h3>
              <p className="text-white/95 text-lg drop-shadow">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent" />
    </section>
  );
};

export default Benefits;
