import { useState, useEffect, useRef } from "react";
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
  const [stats, setStats] = useState({
    /* initial empty stats */
  });
  const [chartData, setChartData] = useState({
    labels: [],
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

      // --- NEW: ONLY UPDATE CHART WHEN THERE IS ACTIVITY ---
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
      // --- END OF NEW LOGIC ---

      const now = Date.now();
      const timeDiffSeconds = (now - previousMetrics.current.timestamp) / 1000;

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
      }

      previousMetrics.current = {
        totalRequests: data.totalRequests,
        backendCalls: data.backendCalls,
        timestamp: now,
      };
    };

    return () => ws.current && ws.current.close();
  }, []);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#ddd" } },
      title: { display: false },
    },
    scales: {
      x: {
        ticks: { color: "#ccc" },
        grid: { color: "rgba(255, 255, 255, 0.1)" },
      },
      y: {
        ticks: { color: "#ccc" },
        grid: { color: "rgba(255, 255, 255, 0.1)" },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="min-h-screen min-w-screen bg-[#0d1117] text-gray-100 flex flex-col overflow-hidden m-0 p-0">
      {/* Top Stats Bar */}
      <div className="bg-[#0d1117] py-4 px-6 flex justify-between items-center shadow-md border-b border-gray-800">
        <h1 className="text-2xl font-semibold text-white">
          ⚡ Smart Concurrency Gateway
        </h1>
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
