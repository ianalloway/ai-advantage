import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import DailyPicks from "./pages/DailyPicks";
import Leaderboard from "./pages/Leaderboard";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/daily-picks" element={<DailyPicks />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
