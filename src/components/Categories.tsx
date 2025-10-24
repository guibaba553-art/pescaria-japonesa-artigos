import { Card, CardContent } from "@/components/ui/card";
import { Fish, Anchor, GitBranch, Wand2, Waves, CircleDot } from "lucide-react";
import { useNavigate } from "react-router-dom";

const categories = [
  {
    icon: Fish,
    title: "Iscas",
    description: "Artificiais, naturais e vivas",
    color: "from-primary to-primary/80",
    category: "Iscas"
  },
  {
    icon: Anchor,
    title: "Anzóis",
    description: "Diversos tamanhos e modelos",
    color: "from-secondary to-secondary/80",
    category: "Anzóis"
  },
  {
    icon: GitBranch,
    title: "Linhas",
    description: "Multifilamento e monofilamento",
    color: "from-primary/80 to-primary",
    category: "Linhas"
  },
  {
    icon: Wand2,
    title: "Varas",
    description: "Telescópicas e resistentes",
    color: "from-secondary/70 to-secondary",
    category: "Varas"
  },
  {
    icon: CircleDot,
    title: "Molinetes e Carretilhas",
    description: "Alta performance e precisão",
    color: "from-primary/70 to-primary/90",
    category: "Molinetes e Carretilhas"
  },
  {
    icon: Waves,
    title: "Acessórios",
    description: "Tudo para sua pescaria",
    color: "from-primary/60 to-primary/80",
    category: "Acessórios"
  }
];

const Categories = () => {
  const navigate = useNavigate();

  return (
    <section className="py-24 bg-gradient-to-br from-muted/30 via-background to-muted/20 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid-pattern opacity-5" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent mb-6">
            Nossas Categorias
          </h2>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            Explore nossa ampla variedade de produtos para todos os tipos de pescaria
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
          {categories.map((category, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-[0_0_40px_rgba(14,165,233,0.3)] transition-all duration-500 cursor-pointer border-2 border-border hover:border-primary/70 overflow-hidden bg-card backdrop-blur-sm hover:-translate-y-2"
              onClick={() => navigate(`/produtos?category=${category.category}`)}
            >
              <CardContent className="p-8 text-center relative">
                <div className={`absolute inset-0 bg-gradient-to-br ${category.color} opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                <div className="relative z-10">
                  <div className="w-20 h-20 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-primary via-primary-glow to-secondary flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg">
                    <category.icon className="w-10 h-10 text-primary-foreground drop-shadow-md" />
                  </div>
                  <h3 className="text-2xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors duration-300">
                    {category.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
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
