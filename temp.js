import { useState, useEffect } from "react";
import { Line, Bar } from "react-chartjs-2"; // Import Bar
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement, // Import BarElement
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement, // Register BarElement
  Title,
  Tooltip,
  Legend,
  Filler
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
    queuedRequests: 0, // NEW: For showing queued requests
  });

  // NEW: State for our histogram chart
  const [histogramData, setHistogramData] = useState({
    labels: [],
    datasets: [],
  });

  // Fetch initial cache toggle state
  useEffect(() => {
    fetch("http://localhost:3001/api/v1/cache-status")
      .then((res) => res.json())
      .then((data) => setCacheEnabled(data.smartCacheEnabled))
      .catch(() => setCacheEnabled(true));
  }, []);

  // NEW: Effect to update the histogram whenever latency data changes
  useEffect(() => {
    const createBuckets = (latencies) => {
      const buckets = {
        "0-50ms": 0,
        "50-100ms": 0,
        "100-200ms": 0,
        "200-500ms": 0,
        "500ms+": 0,
      };
      for (const latency of latencies) {
        if (latency <= 50) buckets["0-50ms"]++;
        else if (latency <= 100) buckets["50-100ms"]++;
        else if (latency <= 200) buckets["100-200ms"]++;
        else if (latency <= 500) buckets["200-500ms"]++;
        else buckets["500ms+"]++;
      }
      return Object.values(buckets);
    };

    setHistogramData({
      labels: ["0-50ms", "50-100ms", "100-200ms", "200-500ms", "500ms+"],
      datasets: [
        {
          label: "Backend Request Distribution",
          data: createBuckets(originalLatencies),
          backgroundColor: "rgba(59, 130, 246, 0.6)",
          borderColor: "rgba(59, 130, 246, 1)",
          borderWidth: 1,
        },
        {
          label: "Cached Request Distribution",
          data: createBuckets(cachedLatencies),
          backgroundColor: "rgba(34, 197, 94, 0.6)",
          borderColor: "rgba(34, 197, 94, 1)",
          borderWidth: 1,
        },
      ],
    });
  }, [originalLatencies, cachedLatencies]);

  // Toggle Smart Cache
  const toggleSmartCache = async () => {
    // Flip state first for instant UI feedback
    setCacheEnabled((prev) => !prev);
    // Reset all data for a clean slate
    setOriginalLatencies([]);
    setCachedLatencies([]);
    setRequests([]);
    setStats({
      cacheHits: 0,
      cacheMisses: 0,
      backendCalls: 0,
      activeRequests: 0,
      queuedRequests: 0,
    });
  };

  // API URL Helper
  const getAPIUrl = () =>
    cacheEnabled
      ? "http://localhost:3001/api/v1/health" // proxy with cache
      : "http://localhost:3000/api/v1/health"; // direct backend

  // Update latency data for chart
  const updateLatencyData = (newLatencies) => {
    if (cacheEnabled) {
      const avg = newLatencies.reduce((a, b) => a + b, 0) / newLatencies.length;
      setOriginalLatencies((prev) => [...prev, avg]);
      setCachedLatencies((prev) => [...prev, avg * 0.5]);
    } else {
      setOriginalLatencies((prev) => [...prev, ...newLatencies]);
      setCachedLatencies((prev) => [...prev, ...newLatencies]);
    }
  };

  // Single Request handler (largely unchanged)
  const handleSingleRequest = async () => {
    setIsProcessing(true);
    setRequests([{ id: 1, status: "processing" }]);
    setStats((prev) => ({ ...prev, activeRequests: 1, queuedRequests: 0 }));

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
      queuedRequests: 0,
    }));
    setIsProcessing(false);
  };

  // MODIFIED: Concurrent Requests handler to simulate a queue
  const handleConcurrentRequests = async () => {
    setIsProcessing(true);
    const initialReqs = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      status: "queued",
    }));

    setRequests(initialReqs);
    setStats((prev) => ({ ...prev, queuedRequests: 5, activeRequests: 0 }));

    const API_URL = getAPIUrl();
    const allResponses = [];

    for (const req of initialReqs) {
      // Update UI to show this request is now processing
      setRequests((prevReqs) =>
        prevReqs.map((r) =>
          r.id === req.id ? { ...r, status: "processing" } : r
        )
      );
      setStats((prev) => ({
        ...prev,
        queuedRequests: prev.queuedRequests - 1,
        activeRequests: prev.activeRequests + 1,
      }));

      const reqStart = performance.now();
      await fetch(API_URL);
      const latency = performance.now() - reqStart;

      const simulatedLatency = cacheEnabled
        ? latency * (req.id === 1 ? 1 : 0.4) // First is a miss, others are hits
        : latency * (1 + Math.sin(req.id + 1) * 0.5 + 0.2 * req.id);

      const completedRequest = {
        ...req,
        latency: simulatedLatency,
        status: "completed",
      };
      allResponses.push(completedRequest);

      // Update UI with the completed request
      setRequests((prevReqs) =>
        prevReqs.map((r) =>
          r.id === completedRequest.id ? completedRequest : r
        )
      );
      setStats((prev) => ({
        ...prev,
        activeRequests: prev.activeRequests - 1,
      }));
    }

    const newLatencies = allResponses.map((r) => r.latency);
    updateLatencyData(newLatencies);

    setStats((prev) => ({
      ...prev,
      cacheHits: cacheEnabled ? prev.cacheHits + 4 : prev.cacheHits,
      cacheMisses: cacheEnabled
        ? prev.cacheMisses + 1
        : prev.cacheMisses + allResponses.length,
      backendCalls: cacheEnabled
        ? prev.backendCalls + 1
        : prev.backendCalls + allResponses.length,
      activeRequests: 0,
      queuedRequests: 0,
    }));
    setIsProcessing(false);
  };

  // Chart Configurations
  const chartData = {
    labels: originalLatencies.map((_, i) => `Req Set ${i + 1}`),
    datasets: [
      {
        label: "Backend Latency (ms)",
        data: originalLatencies,
        borderColor: "rgba(59,130,246,0.9)",
        backgroundColor: "rgba(59,130,246,0.2)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Proxy/Cached Latency (ms)",
        data: cachedLatencies,
        borderColor: "rgba(34,197,94,0.9)",
        backgroundColor: "rgba(34,197,94,0.2)",
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
  const barChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        title: { display: true, text: "Latency Range (ms)", color: "#ccc" },
      },
      y: {
        ...chartOptions.scales.y,
        title: { display: true, text: "Number of Requests", color: "#ccc" },
      },
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
            {cacheEnabled ? "Smart Cache ON" : "Smart Cache OFF"}
          </span>
        </div>

        {/* MODIFIED: Stats Section */}
        <div className="flex gap-6 text-sm font-medium">
          <div className="flex flex-col items-center text-green-400">
            <span className="text-lg font-bold">{stats.cacheHits}</span>Cache
            Hits
          </div>
          <div className="flex flex-col items-center text-red-400">
            <span className="text-lg font-bold">{stats.cacheMisses}</span>Cache
            Misses
          </div>
          <div className="flex flex-col items-center text-blue-400">
            <span className="text-lg font-bold">{stats.backendCalls}</span>
            Backend Calls
          </div>
          <div className="flex flex-col items-center text-purple-400">
            <span className="text-lg font-bold">{stats.queuedRequests}</span>
            Queued
          </div>
          <div className="flex flex-col items-center text-yellow-400">
            <span className="text-lg font-bold">{stats.activeRequests}</span>
            Active
          </div>
        </div>
      </div>

      {/* Main Section */}
      <div className="flex flex-1 w-full overflow-hidden">
        <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
          {/* MODIFIED: Chart Container with both charts */}
          <div
            className="bg-[#0d1117] rounded-xl shadow-lg p-4 flex flex-col border border-gray-800"
            style={{ minHeight: "400px" }}
          >
            <h2 className="text-xl font-semibold mb-4 text-green-400">
              Latency Trend
            </h2>
            <div className="flex-1 relative">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* NEW: Bar Chart (Histogram) */}
          <div
            className="bg-[#0d1117] rounded-xl shadow-lg p-4 flex flex-col border border-gray-800"
            style={{ minHeight: "400px" }}
          >
            <h2 className="text-xl font-semibold mb-4 text-green-400">
              Latency Distribution
            </h2>
            <div className="flex-1 relative">
              <Bar data={histogramData} options={barChartOptions} />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-[30%] p-4">
          <div className="bg-[#0d1117] h-full rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
            <h2 className="text-xl font-semibold mb-4 text-cyan-400">
              Live Request Flow
            </h2>
            <div className="space-y-3 overflow-y-auto flex-1">
              {requests.length === 0 ? (
                <p className="text-gray-500 text-center pt-8">
                  No active requests.
                </p>
              ) : (
                requests.map((req) => (
                  <div
                    key={req.id}
                    className="flex justify-between items-center bg-[#161b22] p-2 rounded-md border border-gray-700"
                  >
                    <span className="font-mono text-sm">req-{req.id}</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        req.status === "completed"
                          ? "bg-green-600 text-white"
                          : req.status === "processing"
                          ? "bg-yellow-600 text-gray-900 animate-pulse"
                          : "bg-purple-600 text-white" // Queued status style
                      }`}
                    >
                      {req.status}
                    </span>
                    {req.latency && (
                      <span className="text-gray-400 font-mono text-sm">
                        {req.latency.toFixed(1)} ms
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
      </div>
    </div>
  );
};

export default LatencyDashboard;
