import { Card, CardContent } from "@/components/ui/card";
import * as LucideIcons from "lucide-react";
import { Package } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCategories } from "@/hooks/useCategories";

const Categories = () => {
  const navigate = useNavigate();
  const { categories, loading } = useCategories();

  if (loading || categories.length === 0) {
    return null;
  }

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

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-6">
          {categories.map((category) => {
            const IconComponent =
              (category.icon && (LucideIcons as any)[category.icon]) || Package;

            return (
              <Card
                key={category.id}
                className="group hover:shadow-glow transition-all duration-300 cursor-pointer border-2 hover:border-primary/50 overflow-hidden"
                onClick={() => navigate(`/produtos?category=${encodeURIComponent(category.name)}`)}
              >
                <CardContent className="p-8 text-center relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary/80 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                  <div className="relative z-10">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <IconComponent className="w-10 h-10 text-primary-foreground" />
                    </div>
                    <h3 className="text-xl font-bold text-foreground mb-2">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Categories;
