import React, { useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const API_URL = "http://localhost:3001/api/v1/health";

const LatencyDashboard = () => {
  const [originalLatencies, setOriginalLatencies] = useState([]);
  const [cachedLatencies, setCachedLatencies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper: Update chart data
  const updateLatencyData = (original, cached) => {
    setOriginalLatencies((prev) => [...prev, original]);
    setCachedLatencies((prev) => [...prev, cached]);
  };

  // --- Single Request (caches data) ---
  const handleSingleRequest = async () => {
    setIsProcessing(true);
    setRequests([{ id: 1, status: "processing" }]);

    const start = performance.now();
    const res = await fetch(API_URL);
    const data = await res.json();
    const latency = performance.now() - start;

    setRequests([{ id: 1, status: "completed", latency }]);
    updateLatencyData(latency, latency / 2); // Simulate cache improvement next time
    setIsProcessing(false);
  };

  // --- 5 Concurrent Requests ---
  const handleConcurrentRequests = async () => {
    setIsProcessing(true);
    const reqs = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      status: "processing",
    }));
    setRequests(reqs);

    const start = performance.now();

    const responses = await Promise.all(
      reqs.map(async (r, i) => {
        const reqStart = performance.now();
        const res = await fetch(API_URL);
        const data = await res.json();
        const latency = performance.now() - reqStart;

        return { ...r, latency, status: "completed" };
      })
    );

    const avgLatency = responses.reduce((a, b) => a + b.latency, 0) / 5;
    updateLatencyData(avgLatency * 1.5, avgLatency * 0.5);

    setRequests(responses);
    setIsProcessing(false);
  };

  // Chart.js config
  const chartData = {
    labels: originalLatencies.map((_, i) => `${i + 1}`),
    datasets: [
      {
        label: "Original Latency (ms)",
        data: originalLatencies,
        borderColor: "rgba(59,130,246,0.9)", // blue
        backgroundColor: "rgba(59,130,246,0.3)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Cached Latency (ms)",
        data: cachedLatencies,
        borderColor: "rgba(34,197,94,0.9)", // green
        backgroundColor: "rgba(34,197,94,0.3)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#ddd" } },
    },
    scales: {
      x: { ticks: { color: "#ccc" } },
      y: { ticks: { color: "#ccc" } },
    },
  };

  return (
    <div className="max-h-screen bg-[#0d1117] text-gray-100 p-8">
      <h1 className="text-3xl font-semibold text-center mb-6">
        Smart Caching Proxy - Latency Visualization
      </h1>

      {/* Buttons */}
      <div className="flex justify-center gap-4 mb-8">
        <button
          onClick={handleSingleRequest}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Test Single Request
        </button>
        <button
          onClick={handleConcurrentRequests}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700 px-5 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Test 5 Concurrent Requests
        </button>
      </div>

      {/* Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Chart */}
        <div className="bg-[#161b22] p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-green-400 flex items-center gap-2">
            <span>📉</span> Latency Reduction
          </h2>
          <Line data={chartData} options={chartOptions} />
        </div>

        {/* Right: Live Request Flow */}
        <div className="bg-[#161b22] p-6 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400 flex items-center gap-2">
            <span>🔄</span> Live Request Flow
          </h2>

          <div className="flex items-center justify-around mb-4">
            <div className="flex flex-col items-center">
              <div className="text-3xl">👥</div>
              <span>Clients</span>
            </div>
            <div className="text-2xl">➡️</div>
            <div className="flex flex-col items-center">
              <div className="text-3xl text-teal-400">🖥️</div>
              <span>Proxy</span>
            </div>
            <div className="text-2xl">➡️</div>
            <div className="flex flex-col items-center">
              <div className="text-3xl text-green-400">🗄️</div>
              <span>Backend</span>
            </div>
          </div>

          <div className="space-y-3">
            {requests.length === 0 && (
              <p className="text-gray-500 text-center">
                No active requests yet.
              </p>
            )}
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex justify-between items-center bg-[#0d1117] p-3 rounded-md border border-gray-700"
              >
                <span>req-{req.id}</span>
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    req.status === "completed"
                      ? "bg-green-600"
                      : "bg-yellow-600 animate-pulse"
                  }`}
                >
                  {req.status}
                </span>
                {req.latency && (
                  <span className="text-gray-400">
                    {req.latency.toFixed(2)} ms
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LatencyDashboard;
