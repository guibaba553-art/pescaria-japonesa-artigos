import { Card, CardContent } from "@/components/ui/card";
import { Fish, Anchor, Package, Waves } from "lucide-react";

const categories = [
  {
    icon: Fish,
    title: "Iscas",
    description: "Artificiais, naturais e vivas",
    color: "from-primary to-primary/80"
  },
  {
    icon: Anchor,
    title: "Anzóis",
    description: "Diversos tamanhos e modelos",
    color: "from-secondary to-secondary/80"
  },
  {
    icon: Package,
    title: "Linhas e Varas",
    description: "Equipamentos profissionais",
    color: "from-primary/80 to-primary"
  },
  {
    icon: Waves,
    title: "Acessórios",
    description: "Tudo para sua pescaria",
    color: "from-secondary/80 to-secondary"
  }
];

const Categories = () => {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Nossas Categorias
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explore nossa ampla variedade de produtos para todos os tipos de pescaria
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((category, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-glow transition-all duration-300 cursor-pointer border-2 hover:border-primary/50 overflow-hidden"
            >
              <CardContent className="p-8 text-center relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
                <div className="relative z-10">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <category.icon className="w-10 h-10 text-primary-foreground" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2">
                    {category.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {category.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Categories;
