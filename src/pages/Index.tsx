import { Header } from "@/components/Header";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import FeaturedProducts from "@/components/FeaturedProducts";
import Benefits from "@/components/Benefits";
import Footer from "@/components/Footer";
import { SupportChat } from "@/components/SupportChat";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Categories />
      <FeaturedProducts />
      <Benefits />
      <Footer />
      <SupportChat />
    </div>
  );
};

export default Index;
