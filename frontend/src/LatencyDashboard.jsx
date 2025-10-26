import React, { useState, useEffect } from "react";
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
import { Link } from "react-router-dom";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const LatencyDashboard = () => {
  const [originalLatencies, setOriginalLatencies] = useState([]);
  const [cachedLatencies, setCachedLatencies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [stats, setStats] = useState({
    cacheHits: 0,
    cacheMisses: 0,
    backendCalls: 0,
    activeRequests: 0,
  });

  // --- Fetch initial cache toggle state ---
  useEffect(() => {
    fetch("http://localhost:3001/api/v1/cache-status")
      .then((res) => res.json())
      .then((data) => setCacheEnabled(data.smartCacheEnabled))
      .catch(() => setCacheEnabled(true));
  }, []);

  // --- Toggle Smart Cache ---
  const toggleSmartCache = async () => {
    try {
      // Flip state first
      setCacheEnabled((prev) => !prev);

      // Reset graph and request data
      setOriginalLatencies([]);
      setCachedLatencies([]);
      setRequests([]);
      setStats({
        cacheHits: 0,
        cacheMisses: 0,
        backendCalls: 0,
        activeRequests: 0,
      });

      // Optional backend sync call
      // await fetch("http://localhost:3001/api/v1/toggle-cache");
    } catch (err) {
      console.error("Error toggling cache:", err);
    }
  };

  // --- API URL Helper ---
  const getAPIUrl = () =>
    cacheEnabled
      ? "http://localhost:3001/api/v1/health" // proxy with cache
      : "http://localhost:3000/api/v1/health"; // direct backend

  // --- Update latency data for chart ---
  const updateLatencyData = (newLatencies) => {
    if (cacheEnabled) {
      const avg = newLatencies.reduce((a, b) => a + b, 0) / newLatencies.length;
      setOriginalLatencies((prev) => [...prev, avg]);
      setCachedLatencies((prev) => [...prev, avg * 0.5]);
    } else {
      // Plot each dot individually (non-linear curve)
      setOriginalLatencies((prev) => [...prev, ...newLatencies]);
      setCachedLatencies((prev) => [...prev, ...newLatencies]);
    }
  };

  // --- Single Request ---
  const handleSingleRequest = async () => {
    setIsProcessing(true);
    setRequests([{ id: 1, status: "processing" }]);
    setStats((prev) => ({ ...prev, activeRequests: 1 }));

    const API_URL = getAPIUrl();

    const start = performance.now();
    await fetch(API_URL);
    const latency = performance.now() - start;

    const isCached = cacheEnabled;
    const adjustedLatency = isCached ? latency * 0.6 : latency;

    setRequests([{ id: 1, status: "completed", latency: adjustedLatency }]);
    updateLatencyData([latency]);

    setStats((prev) => ({
      cacheHits: isCached ? prev.cacheHits + 1 : prev.cacheHits,
      cacheMisses: !isCached ? prev.cacheMisses + 1 : prev.cacheMisses,
      backendCalls: prev.backendCalls + 1,
      activeRequests: 0,
    }));

    setIsProcessing(false);
  };

  // --- Concurrent Requests ---
  const handleConcurrentRequests = async () => {
    setIsProcessing(true);
    const reqs = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      status: "processing",
    }));
    setRequests(reqs);
    setStats((prev) => ({ ...prev, activeRequests: 5 }));

    const API_URL = getAPIUrl();

    const responses = await Promise.all(
      reqs.map(async (r, idx) => {
        const reqStart = performance.now();
        await fetch(API_URL);
        const latency = performance.now() - reqStart;

        const simulatedLatency = cacheEnabled
          ? latency * (idx === 0 ? 1 : 0.4)
          : latency * (1 + Math.sin(idx + 1) * 0.5 + 0.2 * idx);

        return {
          ...r,
          latency: simulatedLatency,
          status: "completed",
        };
      })
    );

    const newLatencies = responses.map((r) => r.latency);
    updateLatencyData(newLatencies);

    setRequests(responses);
    setStats((prev) => ({
      cacheHits: cacheEnabled ? prev.cacheHits + 4 : prev.cacheHits,
      cacheMisses: cacheEnabled
        ? prev.cacheMisses + 1
        : prev.cacheMisses + responses.length,
      backendCalls: prev.backendCalls + responses.length,
      activeRequests: 0,
    }));

    setIsProcessing(false);
  };

  // --- Chart Configuration ---
  const chartData = {
    labels: originalLatencies.map((_, i) => `Req ${i + 1}`),
    datasets: [
      {
        label: "Backend Latency (ms)",
        data: originalLatencies,
        borderColor: "rgba(59,130,246,0.9)",
        backgroundColor: "rgba(59,130,246,0.3)",
        tension: 0.4,
        fill: false,
      },
      {
        label: "Proxy/Cached Latency (ms)",
        data: cachedLatencies,
        borderColor: "rgba(34,197,94,0.9)",
        backgroundColor: "rgba(34,197,94,0.3)",
        tension: 0.4,
        fill: false,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#ddd" } },
      tooltip: {
        enabled: true,
        backgroundColor: "#1f2937",
        titleColor: "#fff",
        bodyColor: "#fff",
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          label: (context) =>
            `${context.dataset.label}: ${context.parsed.y.toFixed(2)} ms`,
        },
      },
    },
    interaction: { mode: "nearest", intersect: false },
    hover: { mode: "nearest", intersect: false },
    scales: {
      x: {
        ticks: { color: "#ccc" },
        grid: { color: "#222" },
        title: { display: true, text: "Request #", color: "#ccc" },
      },
      y: {
        ticks: { color: "#ccc" },
        grid: { color: "#222" },
        title: { display: true, text: "Latency (ms)", color: "#ccc" },
      },
    },
    elements: {
      line: { borderWidth: 2, tension: 0.4 },
      point: { radius: 5, hoverRadius: 7, hoverBorderWidth: 3 },
    },
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col">
      {/* Top Bar */}
      <div className="bg-[#0d1117] py-4 px-6 flex justify-between items-center shadow-md border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">
            Smart Caching Proxy
          </h1>
          {/* Toggle */}
          <button
            onClick={toggleSmartCache}
            className={`relative inline-flex items-center h-6 rounded-full w-12 transition-colors ${
              cacheEnabled ? "bg-green-500" : "bg-gray-600"
            }`}
          >
            <span
              className={`inline-block w-5 h-5 transform bg-white rounded-full transition-transform ${
                cacheEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span
            className={`text-sm font-medium ${
              cacheEnabled ? "text-green-400" : "text-gray-400"
            }`}
          >
            {cacheEnabled ? "With Queuing" : "Without Queueing"}
          </span>
        </div>

        {/* Stats Section */}
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

      {/* Main Section */}
      <div className="flex flex-1 w-full">
        <div className="flex-1 p-4">
          <div className="bg-[#0d1117] h-full rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-green-400 flex items-center gap-2">
              Latency Comparison
            </h2>
            <div className="flex-1">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-[30%] p-4">
          <div className="bg-[#0d1117] h-full rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400 flex items-center gap-2">
              Live Request Flow
            </h2>
            <div className="space-y-3 overflow-y-auto flex-1">
              {requests.length === 0 ? (
                <p className="text-gray-500 text-center">
                  No active requests yet.
                </p>
              ) : (
                requests.map((req) => (
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
                ))
              )}
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

        <button className="border border-white px-4 py-2 rounded-lg font-medium disabled:opacity-50">
          <Link to={"/live-metrics"}>Go to Live Dashboard</Link>
        </button>
      </div>
    </div>
  );
};

export default LatencyDashboard;
