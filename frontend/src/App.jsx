import "./App.css";
import SmartProxyDashboard from "./LatencyDashboard.jsx";
import { Routes, Route } from "react-router-dom";
import LiveMetrics from "./components/live-metrics";

function App() {
  return (
    <Routes>
      <Route path="/" element={<SmartProxyDashboard />} />
      <Route path="/live-metrics" element={<LiveMetrics />} />
    </Routes>
  );
}

export default App;
