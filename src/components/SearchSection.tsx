import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Search, X, ShoppingCart } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { PRODUCT_CATEGORIES } from "@/config/constants";
import { Product } from "@/types/product";
import { useCart } from "@/hooks/useCart";
import { useToast } from "@/hooks/use-toast";

export function SearchSection() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchQuery.trim() || selectedCategory !== "all") {
        performSearch();
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchQuery, selectedCategory]);

  const performSearch = async () => {
    setIsSearching(true);
    setShowResults(true);

    let query = supabase
      .from('products')
      .select('*')
      .gt('stock', 0);

    if (searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery}%`);
    }

    if (selectedCategory !== "all") {
      query = query.eq('category', selectedCategory);
    }

    const { data, error } = await query.order('name', { ascending: true }).limit(6);

    if (!error && data) {
      setSearchResults(data);
    }

    setIsSearching(false);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSearchResults([]);
    setShowResults(false);
  };

  const handleProductClick = (productId: string) => {
    navigate(`/produto/${productId}`);
    clearSearch();
  };

  const handleAddToCart = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    
    const finalPrice = product.on_sale && product.sale_price 
      ? product.sale_price 
      : product.price;

    addItem({
      id: product.id,
      name: product.name,
      price: finalPrice,
      image_url: product.image_url
    }, 1);

    toast({
      title: 'Produto adicionado!',
      description: `${product.name} foi adicionado ao carrinho.`
    });
  };

  return (
    <section className="py-12 px-4 bg-gradient-to-b from-background to-accent/20">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Encontre o que Precisa</h2>
          <p className="text-muted-foreground">
            Pesquise por nome ou categoria
          </p>
        </div>

        <div className="space-y-4">
          {/* Barra de Pesquisa */}
          <div className="flex gap-2 flex-col md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Digite o nome do produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-12 text-base"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[200px] h-12">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Categorias</SelectItem>
                {PRODUCT_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchQuery || selectedCategory !== "all") && (
              <Button variant="outline" onClick={clearSearch} className="h-12">
                Limpar
              </Button>
            )}
          </div>

          {/* Resultados da Pesquisa */}
          {showResults && (
            <Card className="p-4 animate-in fade-in slide-in-from-top-4 duration-300">
              {isSearching ? (
                <p className="text-center text-muted-foreground py-8">
                  Buscando...
                </p>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-sm text-muted-foreground">
                      {searchResults.length} produto(s) encontrado(s)
                    </p>
                    <Button
                      variant="link"
                      onClick={() => navigate('/produtos')}
                      className="text-sm"
                    >
                      Ver todos os produtos →
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {searchResults.map((product) => (
                      <div
                        key={product.id}
                        className="flex gap-4 p-3 rounded-lg hover:bg-accent transition-colors group"
                      >
                        <button
                          onClick={() => handleProductClick(product.id)}
                          className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-muted"
                        >
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                              Sem imagem
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => handleProductClick(product.id)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold truncate">{product.name}</h3>
                            <Badge variant="secondary" className="flex-shrink-0">
                              {product.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {product.short_description || product.description}
                          </p>
                          <div className="flex items-center justify-between">
                            {product.on_sale && product.sale_price ? (
                              <div className="flex items-center gap-2">
                                <span className="text-lg font-bold text-red-600">
                                  R$ {product.sale_price.toFixed(2)}
                                </span>
                                <span className="text-sm line-through text-muted-foreground">
                                  R$ {product.price.toFixed(2)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-lg font-bold text-primary">
                                R$ {product.price.toFixed(2)}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {product.stock} em estoque
                            </span>
                          </div>
                        </button>
                        <Button
                          size="sm"
                          onClick={(e) => handleAddToCart(e, product)}
                          className="self-center opacity-0 group-hover:opacity-100 transition-opacity"
                          disabled={product.stock === 0}
                        >
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-2">
                    Nenhum produto encontrado
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Tente buscar com outros termos ou categorias
                  </p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
