import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import FeaturedProducts from "@/components/FeaturedProducts";
import Benefits from "@/components/Benefits";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <Categories />
      <FeaturedProducts />
      <Benefits />
      <Footer />
    </div>
  );
};

export default Index;
