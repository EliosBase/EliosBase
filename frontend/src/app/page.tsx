import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import LiveFeed from "@/components/LiveFeed";
import TopAgentsStrip from "@/components/TopAgentsStrip";
import PlatformOverview from "@/components/PlatformOverview";
import TechStack from "@/components/TechStack";
import HowItWorks from "@/components/HowItWorks";
import Security from "@/components/Security";
import CyberAgents from "@/components/CyberAgents";
import Stats from "@/components/Stats";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";
import CyberBackground from "@/components/CyberBackground";

// Revalidate the homepage every 60 seconds so the server-rendered
// TopAgentsStrip picks up fresh leaderboard data without requiring a full
// redeploy. The underlying getLeaderboard() call is also Upstash-cached,
// so this revalidate window is effectively a cache-bust hint for Vercel's
// CDN rather than a database hit.
export const revalidate = 60;

export default function Home() {
  return (
    <>
      <CyberBackground />
      <Navbar />
      <main>
        <Hero />
        <LiveFeed />
        <TopAgentsStrip />
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
