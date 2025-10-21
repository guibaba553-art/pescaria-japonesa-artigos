import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Star } from "lucide-react";

const products = [
  {
    name: "Isca Artificial Premium",
    price: "R$ 89,90",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400",
    rating: 5,
    category: "Iscas"
  },
  {
    name: "Vara Telescópica Pro",
    price: "R$ 299,90",
    image: "https://images.unsplash.com/photo-1535406208535-1429839cfd13?w=400",
    rating: 5,
    category: "Varas"
  },
  {
    name: "Kit Anzóis Profissional",
    price: "R$ 49,90",
    image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400",
    rating: 4,
    category: "Anzóis"
  },
  {
    name: "Linha Multifilamento",
    price: "R$ 129,90",
    image: "https://images.unsplash.com/photo-1535406208535-1429839cfd13?w=400",
    rating: 5,
    category: "Linhas"
  }
];

const FeaturedProducts = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Produtos em Destaque
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Os produtos mais populares entre nossos clientes
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product, index) => (
            <Card 
              key={index} 
              className="group hover:shadow-glow transition-all duration-300 overflow-hidden border-2 hover:border-primary/50"
            >
              <div className="relative overflow-hidden">
                <img 
                  src={product.image} 
                  alt={product.name}
                  className="w-full h-56 object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-bold">
                  {product.category}
                </div>
              </div>
              
              <CardContent className="p-6">
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(product.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                
                <h3 className="text-xl font-bold text-foreground mb-2">
                  {product.name}
                </h3>
                
                <div className="flex items-center justify-between mt-4">
                  <span className="text-2xl font-bold text-primary">
                    {product.price}
                  </span>
                  <Button size="sm" className="bg-primary hover:bg-primary/90">
                    <ShoppingCart className="w-4 h-4 mr-1" />
                    Comprar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="text-center mt-12">
          <Button size="lg" variant="outline" className="border-2 border-primary text-primary hover:bg-primary/10">
            Ver Todos os Produtos
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
