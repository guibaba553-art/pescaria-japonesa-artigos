import { Header } from "@/components/Header";
import TopBenefitsBar from "@/components/TopBenefitsBar";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import FlashDealsCountdown from "@/components/FlashDealsCountdown";
import FeaturedProducts from "@/components/FeaturedProducts";
import PromoBanner from "@/components/PromoBanner";
import Benefits from "@/components/Benefits";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Spacer to compensate fixed Header height
          Mobile: 64px (main bar only)
          Desktop (lg+): 64px main + 44px categories = 108px */}
      <div aria-hidden className="h-16 lg:h-[108px]" />
      <TopBenefitsBar />
      <main>
        <Hero />
        <Categories />
        <FlashDealsCountdown />
        <FeaturedProducts />
        <PromoBanner />
        <Benefits />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
