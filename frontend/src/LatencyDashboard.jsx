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
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const WEBSOCKET_URL = "ws://localhost:3001";

const LatencyDashboard = () => {
  const [originalLatencies, setOriginalLatencies] = useState([]);
  const [cachedLatencies, setCachedLatencies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cacheEnabled, setCacheEnabled] = useState(true);
  const [stats, setStats] = useState({
    totalRequests: 0,
    cacheHits: 0,
    backendCalls: 0,
    activeRequests: 0,
  });

  // Fetch initial cache toggle state
  useEffect(() => {
    fetch("http://localhost:3001/api/v1/cache-status")
      .then((res) => res.json())
      .then((data) => setCacheEnabled(data.smartCacheEnabled))
      .catch(() => setCacheEnabled(true));
  }, []);

  const toggleSmartCache = async () => {
    try {
      setCacheEnabled((prev) => !prev);
      const res = await fetch("http://localhost:3001/api/v1/toggle-cache");
      const data = await res.json();
      setCacheEnabled(data.smartCacheEnabled);
    } catch (err) {
      console.error("Error toggling cache:", err);
    }
  };

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

  // --- Chart Configuration ---
  const chartData = {
    labels: originalLatencies.map((_, i) => `${i + 1}`),
    datasets: [
      {
        label: "Incoming Requests / sec",
        data: [],
        borderColor: "rgba(59, 130, 246, 0.9)",
        backgroundColor: "rgba(59, 130, 246, 0.2)",
        tension: 0.4,
        fill: true,
      },
      {
        label: "Backend Calls / sec",
        data: [],
        borderColor: "rgba(239, 68, 68, 0.9)",
        backgroundColor: "rgba(239, 68, 68, 0.2)",
        tension: 0.4,
        fill: true,
      },
    ],
  });

  const ws = useRef(null);
  const previousMetrics = useRef(null); // Use a ref to hold previous metrics

  useEffect(() => {
    ws.current = new WebSocket(WEBSOCKET_URL);
    ws.current.onopen = () => console.log("WebSocket connection established.");
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStats(data);

      // Initialize previousMetrics on the first message
      if (!previousMetrics.current) {
        previousMetrics.current = {
          totalRequests: data.totalRequests,
          backendCalls: data.backendCalls,
          timestamp: Date.now(),
        };
        return; // Don't update the chart on the very first message
      }

      // If the total number of requests hasn't changed, don't update the chart.
      if (data.totalRequests === previousMetrics.current.totalRequests) {
        return;
      }

      const now = Date.now();
      const timeDiffSeconds = (now - previousMetrics.current.timestamp) / 1000;

      // Only update if a meaningful amount of time has passed
      if (timeDiffSeconds > 0) {
        const requestsPerSecond =
          (data.totalRequests - previousMetrics.current.totalRequests) /
          timeDiffSeconds;
        const backendCallsPerSecond =
          (data.backendCalls - previousMetrics.current.backendCalls) /
          timeDiffSeconds;

        setChartData((prevData) => {
          const newLabels = [
            ...prevData.labels,
            new Date().toLocaleTimeString(),
          ];
          const newIncomingData = [
            ...prevData.datasets[0].data,
            requestsPerSecond < 0 ? 0 : requestsPerSecond,
          ];
          const newBackendData = [
            ...prevData.datasets[1].data,
            backendCallsPerSecond < 0 ? 0 : backendCallsPerSecond,
          ];

          // Keep the chart to a fixed number of data points
          if (newLabels.length > 30) {
            newLabels.shift();
            newIncomingData.shift();
            newBackendData.shift();
          }

          return {
            labels: newLabels,
            datasets: [
              { ...prevData.datasets[0], data: newIncomingData },
              { ...prevData.datasets[1], data: newBackendData },
            ],
          };
        });

        // *** THE FIX: Update previousMetrics ONLY after a successful calculation ***
        previousMetrics.current = {
          totalRequests: data.totalRequests,
          backendCalls: data.backendCalls,
          timestamp: now,
        };
      }
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, []);

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
    interaction: {
      mode: "nearest",
      intersect: false,
    },
    hover: {
      mode: "nearest",
      intersect: false,
    },
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
      line: {
        borderWidth: 2,
        tension: 0.4,
      },
      point: {
        radius: 5,
        hoverRadius: 7,
        hoverBorderWidth: 3,
      },
    },
  };

  return (
    <div className="min-h-screen min-w-screen bg-[#0d1117] text-gray-100 flex flex-col overflow-hidden m-0 p-0">
      {/* Top Stats Bar */}
      <div className="bg-[#0d1117] py-4 px-6 flex justify-between items-center shadow-md border-b border-gray-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">
            ⚡ Smart Caching Proxy
          </h1>

          {/* Toggle Switch */}
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

        <div className="flex gap-6 text-sm font-medium">
          <div className="flex flex-col items-center text-cyan-400">
            <span className="text-lg font-bold">
              {stats.totalRequests || 0}
            </span>
            Total Requests
          </div>
          <div className="flex flex-col items-center text-green-400">
            <span className="text-lg font-bold">{stats.cacheHits || 0}</span>
            Cache Hits
          </div>
          <div className="flex flex-col items-center text-blue-400">
            <span className="text-lg font-bold">{stats.backendCalls || 0}</span>
            Backend Calls
          </div>
          <div className="flex flex-col items-center text-purple-400">
            <span className="text-lg font-bold">
              {stats.deduplicatedRequests || 0}
            </span>
            Queued Requests
          </div>
          <div className="flex flex-col items-center text-yellow-400">
            <span className="text-lg font-bold">
              {stats.inFlightCount || 0}
            </span>
            In-Flight (Live)
          </div>
        </div>
      </div>

      {/* Main Dashboard */}
      <div className="flex flex-1 w-full p-4 gap-4">
        {/* Left Side: The Live Chart */}
        <div className="flex-1 bg-[#0d1117] rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
          <h2 className="text-xl font-semibold mb-4 text-cyan-400">
            📊 Live Throughput (Requests/Second)
          </h2>
          <div className="flex-1 relative">
            {chartData.labels.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-gray-500 text-lg">
                  Waiting for load test to begin...
                </p>
              </div>
            )}
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Right Side: The Live In-Flight Queue */}
        <div className="w-[40%] bg-[#0d1117] rounded-xl shadow-lg p-4 flex flex-col border border-gray-800">
          <h2 className="text-xl font-semibold mb-4 text-yellow-400 flex items-center gap-2">
            🔄 Live In-Flight Queue
          </h2>
          <div className="space-y-3 overflow-y-auto flex-1">
            {(stats.inFlightDetails || []).length === 0 && (
              <p className="text-gray-500 text-center pt-8">
                The queue is empty.
              </p>
            )}
            {(stats.inFlightDetails || []).map((req, index) => (
              <div
                key={index}
                className="flex justify-between items-center bg-[#0d1117] p-3 rounded-md border border-gray-700 animate-pulse"
              >
                <span className="font-mono text-sm text-gray-300">
                  {req.url}
                </span>
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 rounded-full text-xs bg-purple-600">
                    Queued: {req.queued_requests}
                  </span>
                  <span className="text-gray-400 text-sm w-24 text-right">
                    {req.duration_ms.toFixed(0)} ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-[#0d1117] py-3 flex justify-center items-center gap-4 shadow-inner border-t border-gray-800">
        <p className="text-gray-400">
          Run a load test in your terminal to see the live data:
        </p>
        <code className="bg-gray-900 text-green-400 px-3 py-1 rounded">
          autocannon -c 100 -d 10
          http://localhost:3001/api/v1/feed/global-trending
        </code>
      </div>
    </div>
  );
};

export default LatencyDashboard;
