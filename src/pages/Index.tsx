import { lazy, Suspense } from "react";
import { Header } from "@/components/Header";
import TopBenefitsBar from "@/components/TopBenefitsBar";
import Hero from "@/components/Hero";
import Categories from "@/components/Categories";
import Footer from "@/components/Footer";

// Seções abaixo do fold — lazy para acelerar o primeiro paint da home
const FlashDealsCountdown = lazy(() => import("@/components/FlashDealsCountdown"));
const FeaturedProducts = lazy(() => import("@/components/FeaturedProducts"));
const PromoBanner = lazy(() => import("@/components/PromoBanner"));
const Benefits = lazy(() => import("@/components/Benefits"));

const SectionFallback = () => (
  <div className="py-12 flex justify-center">
    <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

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
        <Suspense fallback={<SectionFallback />}>
          <FlashDealsCountdown />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <FeaturedProducts />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <PromoBanner />
        </Suspense>
        <Suspense fallback={<SectionFallback />}>
          <Benefits />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
