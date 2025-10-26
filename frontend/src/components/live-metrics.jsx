import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";

const WEBSOCKET_URL = "ws://localhost:3001";

// --- ICONS, MethodBadge (No changes needed) ---
const Icons = {
  TotalRequests: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-blue-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  ),
  CacheHits: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-green-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  BackendCalls: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-red-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.096 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  ),
  QueuedRequests: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-yellow-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  ),
  InFlightNow: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-purple-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h5V4H4zm0 12h5v-5H4v5zm12 0h5v-5h-5v5zm0-12h5V4h-5v5z"
      />
    </svg>
  ),
  ResponseTime: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-teal-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  ErrorRate: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-orange-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
      />
    </svg>
  ),
  Uptime: () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-indigo-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7l4-4m0 0l4 4m-4-4v18"
      />
    </svg>
  ),
};

const MethodBadge = ({ method }) => {
  const colors = {
    GET: "bg-green-600/50 text-green-200",
    POST: "bg-blue-600/50 text-blue-200",
    PUT: "bg-yellow-600/50 text-yellow-200",
    DELETE: "bg-red-600/50 text-red-200",
    PATCH: "bg-purple-600/50 text-purple-200",
    DEFAULT: "bg-gray-600/50 text-gray-200",
  };
  return (
    <span
      className={`w-16 text-center font-mono text-xs font-bold px-2 py-1 rounded ${
        colors[method] || colors.DEFAULT
      }`}
    >
      {method}
    </span>
  );
};

const QueueLog = ({ queue }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  useEffect(() => {
    if (queue.status === "Active") setIsExpanded(true);
  }, [queue.status]);
  const sortedRequests = [...queue.requests].sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "In-Flight" ? -1 : 1;
  });
  return (
    <div
      className={`bg-[#0d1117] rounded-md border border-gray-700/50 transition-all ${
        queue.status === "Resolved" && "opacity-50"
      }`}
    >
      <header
        className="flex justify-between items-center p-3 cursor-pointer hover:bg-gray-800/20"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <MethodBadge method={queue.method} />
          <span
            className="font-mono text-sm text-gray-300 truncate"
            title={queue.url}
          >
            {queue.url}
          </span>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-600/50 text-blue-200">
            Total: {queue.requests.length}
          </span>
          {queue.status === "Active" ? (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-600/50 text-purple-200">
              Active: {queue.activeRequestCount}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-600/50 text-gray-300">
              Resolved
            </span>
          )}
          <span className="text-gray-400 text-2xl w-4 text-center">
            {isExpanded ? "▾" : "▸"}
          </span>
        </div>
      </header>
      {isExpanded && (
        <div className="border-t border-gray-700/50 p-3 space-y-2 max-h-60 overflow-y-auto">
          {sortedRequests.map((req) => (
            <div
              key={req.id}
              className="flex items-center justify-between text-xs font-mono bg-gray-900/50 p-2 rounded"
            >
              <span className="text-gray-400">{req.id}</span>
              <span
                className={`font-semibold ${
                  req.status === "In-Flight"
                    ? "text-purple-300"
                    : "text-gray-500"
                }`}
              >
                {req.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LiveMetrics = () => {
  const [liveStats, setLiveStats] = useState({
    /* initial state */
  });
  const [queueLogs, setQueueLogs] = useState(new Map());
  const ws = useRef(null);

  // --- REWRITTEN LOGIC FOR ROBUSTNESS ---
  const updateQueueLogs = useCallback((inFlightQueues = []) => {
    setQueueLogs((prevLogs) => {
      const newLogs = new Map(prevLogs);
      const inFlightFingerprints = new Set(
        inFlightQueues.map((q) => q.fingerprint)
      );

      // 1. Mark old active logs as resolved if they are no longer in the in-flight list
      newLogs.forEach((log, fingerprint) => {
        if (log.status === "Active" && !inFlightFingerprints.has(fingerprint)) {
          const allResolved = log.requests.map((r) => ({
            ...r,
            status: "Resolved",
          }));
          newLogs.set(fingerprint, {
            ...log,
            status: "Resolved",
            requests: allResolved,
          });
        }
      });

      // 2. Merge new in-flight data
      inFlightQueues.forEach((incomingQueue) => {
        const existingLog = newLogs.get(incomingQueue.fingerprint);

        // Get the history of already resolved requests from the existing log
        const resolvedHistory =
          existingLog?.requests.filter((r) => r.status === "Resolved") || [];

        // The new list of requests is the resolved history combined with the new in-flight list
        const mergedRequests = [...resolvedHistory, ...incomingQueue.requests];

        newLogs.set(incomingQueue.fingerprint, {
          ...incomingQueue,
          status: "Active",
          requests: mergedRequests,
        });
      });

      return newLogs;
    });
  }, []);

  useEffect(() => {
    const connect = () => {
      ws.current = new WebSocket(WEBSOCKET_URL);
      ws.current.onopen = () =>
        console.log("[WebSocket] Connection established.");
      ws.current.onerror = (err) => console.error("[WebSocket] Error:", err);
      ws.current.onclose = () => {
        console.warn(
          "[WebSocket] Connection closed. Attempting to reconnect in 3 seconds..."
        );
        setTimeout(connect, 3000); // Auto-reconnect
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Always update the top-level stats
          setLiveStats(data);

          // Always call the log update function. If `inFlightQueues` is missing, it will
          // correctly be passed an empty array, which will mark any existing active logs as resolved.
          updateQueueLogs(data.inFlightQueues || []);
        } catch (error) {
          console.error("Failed to parse WebSocket message:", error);
        }
      };
    };
    connect();

    return () => {
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnect on component unmount
        ws.current.close();
      }
    };
  }, [updateQueueLogs]);

  const sortedLogs = Array.from(queueLogs.values()).sort((a, b) => {
    if (a.status === b.status) return 0;
    return a.status === "Active" ? -1 : 1;
  });

  const MetricCard = ({ label, value, unit, icon }) => (
    <div className="bg-[#161b22] p-6 rounded-lg border border-gray-800 hover:border-gray-700 transition-all duration-300 flex items-center space-x-4">
      {icon}
      <div>
        <div className="text-3xl font-bold text-gray-100">
          {value || 0}
          {unit && <span className="text-xl text-gray-400 ml-1">{unit}</span>}
        </div>
        <div className="text-sm text-gray-400 mt-1">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 font-sans">
      <header className="bg-[#161b22] border-b border-gray-800 shadow-md sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">
            ⚡ Smart Concurrency Gateway
          </h1>
          <nav>
            <Link
              to="/"
              className="font-medium text-gray-300 hover:text-white transition-colors duration-300 px-4 py-2 rounded-md bg-gray-700/50 hover:bg-gray-600/50"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="container mx-auto p-6 space-y-8">
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-6">
            <MetricCard
              label="Total Requests"
              value={liveStats.totalRequests}
              icon={<Icons.TotalRequests />}
            />
            <MetricCard
              label="Avg. Response Time"
              value={liveStats.avgResponseTime}
              unit="ms"
              icon={<Icons.ResponseTime />}
            />
            <MetricCard
              label="Cache Hit"
              value={(liveStats.cacheHitRatio * 100).toFixed(1)}
              unit="%"
              icon={<Icons.CacheHits />}
            />
            <MetricCard
              label="Error Rate"
              value={(liveStats.errorRate * 100).toFixed(1)}
              unit="%"
              icon={<Icons.ErrorRate />}
            />
            <MetricCard
              label="Backend Calls"
              value={liveStats.backendCalls}
              icon={<Icons.BackendCalls />}
            />
            <MetricCard
              label="Queued Requests"
              value={liveStats.deduplicatedRequests}
              icon={<Icons.QueuedRequests />}
            />
            <MetricCard
              label="In-Flight Now"
              value={liveStats.inFlightCount}
              icon={<Icons.InFlightNow />}
            />
            <MetricCard
              label="Server Uptime"
              value={liveStats.uptime}
              icon={<Icons.Uptime />}
            />
          </div>
        </section>

        <section className="bg-[#161b22] rounded-lg border border-gray-800 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-yellow-400">
              Live Queue Logs
            </h2>
            <button
              onClick={() => setQueueLogs(new Map())}
              className="px-3 py-1 text-xs font-medium bg-red-800/50 text-red-200 rounded-md hover:bg-red-700/50 transition-colors"
            >
              Clear Logs
            </button>
          </div>
          <div className="space-y-3 overflow-y-auto max-h-[55vh] pr-2">
            {sortedLogs.length > 0 ? (
              sortedLogs.map((queue) => (
                <QueueLog key={queue.fingerprint} queue={queue} />
              ))
            ) : (
              <div className="flex items-center justify-center h-48">
                <p className="text-gray-500">
                  The log is empty. Waiting for requests...
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="bg-[#161b22] py-4 border-t border-gray-800">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-center items-center gap-4 text-center">
          <p className="text-gray-400 text-sm">
            Run a load test to see live data:
          </p>
          <code className="bg-gray-900 text-green-400 px-3 py-1.5 rounded-md text-xs">
            autocannon -c 100 -d 30 http://localhost:3001/api/v1/some-endpoint
          </code>
        </div>
      </footer>
    </div>
  );
};

export default LiveMetrics;
