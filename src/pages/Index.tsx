import { Header } from "@/components/Header";
import TopBenefitsBar from "@/components/TopBenefitsBar";
import Hero from "@/components/Hero";
import { lazy, Suspense, useEffect, useState } from "react";
import Categories from "@/components/Categories";
import Footer from "@/components/Footer";

const FlashDealsCountdown = lazy(() => import("@/components/FlashDealsCountdown"));
const FeaturedProducts = lazy(() => import("@/components/FeaturedProducts"));
const PromoBanner = lazy(() => import("@/components/PromoBanner"));
const Benefits = lazy(() => import("@/components/Benefits"));

const SectionFallback = () => <div className="h-16 sm:h-24" aria-hidden />;

const Index = () => {
  const [showDeferredSections, setShowDeferredSections] = useState(false);

  useEffect(() => {
    const schedule =
      "requestIdleCallback" in window
        ? (window as Window & { requestIdleCallback: (cb: IdleRequestCallback) => number }).requestIdleCallback(
            () => setShowDeferredSections(true),
            { timeout: 800 }
          )
        : window.setTimeout(() => setShowDeferredSections(true), 250);

    return () => {
      if (typeof schedule === "number") {
        if ("cancelIdleCallback" in window && showDeferredSections === false) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(schedule);
        } else {
          window.clearTimeout(schedule);
        }
      }
    };
  }, [showDeferredSections]);

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
        {showDeferredSections && (
          <>
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
          </>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Index;
