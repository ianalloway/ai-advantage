import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DailyPicks from "./pages/DailyPicks";
import Leaderboard from "./pages/Leaderboard";
import ParlayBuilder from "./pages/ParlayBuilder";
import ApiDocs from "./pages/ApiDocs";
import Profile from "./pages/Profile";
import Simulator from "./pages/Simulator";
import Navbar from "./components/Navbar";

const queryClient = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <Navbar />
      {children}
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout><Index /></Layout>} />
          <Route path="/picks" element={<Layout><DailyPicks /></Layout>} />
          <Route path="/leaderboard" element={<Layout><Leaderboard /></Layout>} />
          <Route path="/parlay" element={<Layout><ParlayBuilder /></Layout>} />
          <Route path="/api-docs" element={<Layout><ApiDocs /></Layout>} />
          <Route path="/profile" element={<Layout><Profile /></Layout>} />
          <Route path="/simulator" element={<Layout><Simulator /></Layout>} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
