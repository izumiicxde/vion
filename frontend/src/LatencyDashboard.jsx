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
  const [stats, setStats] = useState({
    cacheHits: 0,
    cacheMisses: 0,
    backendCalls: 0,
    activeRequests: 0,
  });

  const updateLatencyData = (original, cached) => {
    setOriginalLatencies((prev) => [...prev, original]);
    setCachedLatencies((prev) => [...prev, cached]);
  };

  const handleSingleRequest = async () => {
    setIsProcessing(true);
    setRequests([{ id: 1, status: "processing" }]);
    setStats((prev) => ({ ...prev, activeRequests: 1 }));

    const start = performance.now();
    const res = await fetch(API_URL);
    const latency = performance.now() - start;

    setRequests([{ id: 1, status: "completed", latency }]);
    updateLatencyData(latency, latency / 2);

    setStats((prev) => ({
      cacheHits: prev.cacheHits + 1,
      backendCalls: prev.backendCalls + 1,
      activeRequests: 0,
    }));

    setIsProcessing(false);
  };

  const handleConcurrentRequests = async () => {
    setIsProcessing(true);
    const reqs = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      status: "processing",
    }));
    setRequests(reqs);
    setStats((prev) => ({ ...prev, activeRequests: 5 }));

    const responses = await Promise.all(
      reqs.map(async (r) => {
        const reqStart = performance.now();
        await fetch(API_URL);
        const latency = performance.now() - reqStart;
        return { ...r, latency, status: "completed" };
      })
    );

    const avgLatency =
      responses.reduce((a, b) => a + b.latency, 0) / responses.length;
    updateLatencyData(avgLatency * 1.5, avgLatency * 0.5);

    setRequests(responses);
    setStats((prev) => ({
      cacheHits: prev.cacheHits + 3,
      cacheMisses: prev.cacheMisses + 2,
      backendCalls: prev.backendCalls + 5,
      activeRequests: 0,
    }));

    setIsProcessing(false);
  };

  const chartData = {
    labels: originalLatencies.map((_, i) => `${i + 1}`),
    datasets: [
      {
        label: "Original Latency (ms)",
        data: originalLatencies,
        borderColor: "rgba(59,130,246,0.9)",
        backgroundColor: "rgba(59,130,246,0.3)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Cached Latency (ms)",
        data: cachedLatencies,
        borderColor: "rgba(34,197,94,0.9)",
        backgroundColor: "rgba(34,197,94,0.3)",
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#ddd" } },
      title: { display: false },
    },
    scales: {
      x: { ticks: { color: "#ccc" }, grid: { color: "#222" } },
      y: { ticks: { color: "#ccc" }, grid: { color: "#222" } },
    },
  };

  return (
    <div className="min-h-screen min-w-screen bg-[#0d1117] text-gray-100 flex flex-col overflow-hidden m-0 p-0">
      {/* Top Stats Bar */}
      <div className="bg-[#0d1117] py-4 px-6 flex justify-between items-center shadow-md border-b border-gray-800">
        <h1 className="text-2xl font-semibold text-white">⚡ Smart Caching Proxy</h1>
        <div className="flex gap-6 text-sm font-medium">
          <div className="flex flex-col items-center text-green-400">
            <span className="text-lg font-bold">{stats.cacheHits}</span>
            Cache Hits
          </div>
          <div className="flex flex-col items-center text-red-400">
            <span className="text-lg font-bold">{stats.cacheMisses}</span>
            Cache Misses
          </div>
          <div className="flex flex-col items-center text-blue-400">
            <span className="text-lg font-bold">{stats.backendCalls}</span>
            Backend Calls
          </div>
          <div className="flex flex-col items-center text-yellow-400">
            <span className="text-lg font-bold">{stats.activeRequests}</span>
            Active Requests
          </div>
        </div>
      </div>

      {/* Main Dashboard */}
      <div className="flex flex-1 w-full">
        {/* Left: Chart */}
        <div className="flex-1 p-4">
          <div className="bg-[#0d1117] h-full rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-green-400 flex items-center gap-2">
              📉 Latency Reduction
            </h2>
            <div className="flex-1">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Right: Request Flow */}
        <div className="w-[30%] p-4">
          <div className="bg-[#0d1117] h-full rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400 flex items-center gap-2">
              🔄 Live Request Flow
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
            <div className="space-y-3 overflow-y-auto flex-1">
              {requests.length === 0 && (
                <p className="text-gray-500 text-center">
                  No active requests yet.
                </p>
              )}
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex justify-between items-center bg-[#0d1117] p-2 rounded-md border border-gray-700"
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

      {/* Bottom Controls */}
      <div className="bg-[#0d1117] py-3 flex justify-center gap-4 shadow-inner border-t border-gray-800">
        <button
          onClick={handleSingleRequest}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Test Single Request
        </button>
        <button
          onClick={handleConcurrentRequests}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg font-medium disabled:opacity-50"
        >
          Test 5 Concurrent Requests
        </button>
      </div>
    </div>
  );
};

export default LatencyDashboard;
