import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import PlatformOverview from "@/components/PlatformOverview";
import TechStack from "@/components/TechStack";
import HowItWorks from "@/components/HowItWorks";
import Security from "@/components/Security";
import CyberAgents from "@/components/CyberAgents";
import Stats from "@/components/Stats";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import CyberBackground from "@/components/CyberBackground";

export default function Home() {
  return (
    <>
      <CyberBackground />
      <Navbar />
      <main>
        <Hero />
        <PlatformOverview />
        <TechStack />
        <HowItWorks />
        <Security />
        <CyberAgents />
        <Stats />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
