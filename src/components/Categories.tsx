import * as LucideIcons from "lucide-react";
import { Package, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCategories } from "@/hooks/useCategories";

const Categories = () => {
  const navigate = useNavigate();
  const { primaries, loading } = useCategories();
  const categories = primaries;

  if (loading || categories.length === 0) {
    return null;
  }

  return (
    <section className="py-24 sm:py-32 bg-surface-subtle">
      <div className="container mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-4">
              Categorias
            </p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-foreground text-balance leading-[1.05]">
              Tudo o que você precisa,<br />
              <span className="text-muted-foreground">organizado.</span>
            </h2>
          </div>
          <button
            onClick={() => navigate('/produtos')}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors group"
          >
            Ver todas
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:rotate-45" />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((category, idx) => {
            const IconComponent =
              (category.icon && (LucideIcons as any)[category.icon]) || Package;

            return (
              <button
                key={category.id}
                onClick={() => navigate(`/produtos?category=${encodeURIComponent(category.name)}`)}
                className="group relative aspect-[4/5] sm:aspect-square rounded-3xl bg-card border border-border/60 overflow-hidden hover-lift text-left p-6 sm:p-8 flex flex-col justify-between animate-fade-in-up"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'backwards' }}
              >
                {/* Hover glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Icon */}
                <div className="relative">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500">
                    <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>

                {/* Label */}
                <div className="relative">
                  <h3 className="text-lg sm:text-xl font-display font-semibold text-foreground mb-1 leading-tight">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {category.description}
                    </p>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground absolute -top-1 right-0 opacity-0 -translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile: Ver todas */}
        <div className="mt-8 sm:hidden text-center">
          <button
            onClick={() => navigate('/produtos')}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
          >
            Ver todas as categorias
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default Categories;
