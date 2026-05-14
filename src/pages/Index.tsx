import { Header } from "@/components/Header";
import { lazy, Suspense, useEffect, useState } from "react";

// Componentes desktop só baixam quando lg+ — economiza ~80% do JS no mobile
const TopBenefitsBar = lazy(() => import("@/components/TopBenefitsBar"));
const Hero = lazy(() => import("@/components/Hero"));
const Categories = lazy(() => import("@/components/Categories"));
const FlashDealsCountdown = lazy(() => import("@/components/FlashDealsCountdown"));
const FeaturedProducts = lazy(() => import("@/components/FeaturedProducts"));
const PromoBanner = lazy(() => import("@/components/PromoBanner"));
const Benefits = lazy(() => import("@/components/Benefits"));
const Footer = lazy(() => import("@/components/Footer"));
const MobileHome = lazy(() => import("@/components/mobile/MobileHome"));

const SectionFallback = () => <div className="h-16 sm:h-24" aria-hidden />;

const useIsDesktop = () => {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
};

const Index = () => {
  const isDesktop = useIsDesktop();
  const [showDeferredSections, setShowDeferredSections] = useState(false);

  useEffect(() => {
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

    if ("requestIdleCallback" in window) {
      idleId = (window as Window & { requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number }).requestIdleCallback(
        () => setShowDeferredSections(true),
        { timeout: 800 }
      );
    } else {
      timeoutId = globalThis.setTimeout(() => setShowDeferredSections(true), 250);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div aria-hidden className="h-16 lg:h-[108px]" />

      {!isDesktop && (
        <main>
          <Suspense fallback={<SectionFallback />}>
            <MobileHome />
          </Suspense>
        </main>
      )}

      {isDesktop && (
        <div>
          <Suspense fallback={null}>
            <TopBenefitsBar />
          </Suspense>
          <main>
            <Suspense fallback={<SectionFallback />}>
              <Hero />
            </Suspense>
            <Suspense fallback={<SectionFallback />}>
              <Categories />
            </Suspense>
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
        </div>
      )}

      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
};

export default Index;
