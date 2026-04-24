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

// Prefetch da página /produtos para evitar latência do code-split ao clicar
const prefetchProducts = () => {
  import('@/pages/Products').catch(() => {});
};

const Categories = () => {
  const navigate = useNavigate();
  const { primaries, loading } = useCategories();
  const categories = primaries;

  if (loading || categories.length === 0) {
    return null;
  }

  return (
    <section className="py-8 sm:py-16 bg-surface-subtle">
      <div className="container mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-4 sm:mb-8">
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-primary uppercase tracking-wider mb-1">
              Compre por categoria
            </p>
            <h2 className="text-xl sm:text-3xl md:text-4xl font-display font-black text-foreground leading-tight">
              Tudo o que você precisa
            </h2>
          </div>
          <button
            onClick={() => navigate('/produtos')}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline group"
          >
            Ver todas
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Mobile: scroll horizontal estilo "stories"; Desktop: grid */}
        <div className="-mx-4 sm:mx-0">
          <div
            className="flex sm:grid sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-3 overflow-x-auto sm:overflow-visible px-4 sm:px-0 pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none scrollbar-hide"
          >
            {categories.map((category, idx) => {
              const bgImage = getCategoryImage(category);

              return (
                <button
                  key={category.id}
                  onClick={() => navigate(`/produtos?category=${encodeURIComponent(category.name)}`)}
                  className="group relative flex-shrink-0 w-[120px] sm:w-auto aspect-square rounded-2xl overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left animate-fade-in-up isolate snap-start"
                  style={{ animationDelay: `${idx * 40}ms`, animationFillMode: 'backwards' }}
                >
                  {/* Background image */}
                  <img
                    src={bgImage}
                    alt=""
                    loading="lazy"
                    width={400}
                    height={400}
                    className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
                  />

                  {/* Dark gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />

                  {/* Content */}
                  <div className="relative z-10 h-full p-2.5 sm:p-3 flex items-end">
                    <h3 className="text-sm sm:text-base font-display font-bold text-white leading-tight tracking-tight">
                      {category.name}
                    </h3>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile: Ver todas */}
        <div className="mt-4 sm:hidden text-center">
          <button
            onClick={() => navigate('/produtos')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
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
