import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCategories } from "@/hooks/useCategories";
import varasImg from "@/assets/category-varas.jpg";
import molinetesImg from "@/assets/category-molinetes.jpg";
import carretilhasImg from "@/assets/category-carretilhas.jpg";
import iscasImg from "@/assets/category-iscas.jpg";
import anzoisImg from "@/assets/category-anzois.jpg";
import linhasImg from "@/assets/category-linhas.jpg";
import acessoriosImg from "@/assets/category-acessorios.jpg";

// Map slug -> background image (extensible via DB icon field fallback to slug)
const CATEGORY_IMAGES: Record<string, string> = {
  varas: varasImg,
  molinetes: molinetesImg,
  carretilhas: carretilhasImg,
  iscas: iscasImg,
  anzois: anzoisImg,
  "anzóis": anzoisImg,
  linhas: linhasImg,
  acessorios: acessoriosImg,
  "acessórios": acessoriosImg,
};

const getCategoryImage = (category: { slug?: string; name?: string }) => {
  const slug = (category.slug || "").toLowerCase();
  const name = (category.name || "").toLowerCase();
  return CATEGORY_IMAGES[slug] || CATEGORY_IMAGES[name] || acessoriosImg;
};

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
            const bgImage = getCategoryImage(category);

            return (
              <button
                key={category.id}
                onClick={() => navigate(`/produtos?category=${encodeURIComponent(category.name)}`)}
                className="group relative aspect-[4/5] sm:aspect-square rounded-3xl overflow-hidden hover-lift text-left animate-fade-in-up isolate"
                style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'backwards' }}
              >
                {/* Background image */}
                <img
                  src={bgImage}
                  alt=""
                  loading="lazy"
                  width={800}
                  height={1024}
                  className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-[1200ms] ease-out"
                />

                {/* Dark gradient overlay for legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

                {/* Subtle orange tint on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Content */}
                <div className="relative z-10 h-full p-6 sm:p-8 flex flex-col justify-between">
                  {/* Top: arrow indicator */}
                  <div className="flex justify-end">
                    <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center opacity-0 -translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">
                      <ArrowUpRight className="w-4 h-4 text-white" />
                    </div>
                  </div>

                  {/* Bottom: label */}
                  <div>
                    <h3 className="text-xl sm:text-2xl font-display font-semibold text-white mb-1 leading-tight tracking-tight">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="text-xs sm:text-sm text-white/70 line-clamp-2">
                        {category.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Border highlight */}
                <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/10 group-hover:ring-white/30 transition-all duration-500 pointer-events-none" />
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
