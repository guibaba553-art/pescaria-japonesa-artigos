import { Header } from "@/components/Header";
import TopBenefitsBar from "@/components/TopBenefitsBar";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import FlashDealsCountdown from "@/components/FlashDealsCountdown";
import FeaturedProducts from "@/components/FeaturedProducts";
import Benefits from "@/components/Benefits";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <TopBenefitsBar />
      <main>
        <Hero />
        <Categories />
        <FlashDealsCountdown />
        <FeaturedProducts />
        <Benefits />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
