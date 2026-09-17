import { useEffect, useState } from "react";

function daysLabel(days) {
  if (days == null) return { text: "-", cls: "unknown" };
  if (days <= 0) return { text: "EXPIRED", cls: "down" };
  if (days <= 14) return { text: `${days}d left`, cls: "down" };
  if (days <= 30) return { text: `${days}d left`, cls: "warn" };
  return { text: `${days}d left`, cls: "up" };
}

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export default function StatusPage() {
  const [sites, setSites] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function load() {
      fetch("/api/public/status")
        .then((r) => r.json())
        .then(setSites)
        .catch(() => setError("Could not load status"));
    }
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const allUp = sites && sites.every((s) => s.status === "up");

  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <div style={{ textAlign: "center", margin: "32px 0" }}>
        <h1 style={{ fontSize: 26 }}>System Status</h1>
        {sites && (
          <p className={`meta`} style={{ fontSize: 15 }}>
            {allUp ? "✅ All systems operational" : "⚠️ Some systems are experiencing issues"}
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {!sites && !error && <p className="meta" style={{ textAlign: "center" }}>Loading...</p>}
      {sites && sites.length === 0 && (
        <p className="meta" style={{ textAlign: "center" }}>No public sites configured.</p>
      )}

      {sites &&
        sites.map((site) => {
          const domain = daysLabel(site.domainDaysLeft);
          const ssl = daysLabel(site.sslDaysLeft);
          return (
            <div className="card" key={site._id}>
              <div>
                <h2>{site.name}</h2>
                <div className="meta">{site.domain}</div>
              </div>
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <span className={`badge ${site.status}`}>{site.status.toUpperCase()}</span>
                <div className="meta">Checked {timeAgo(site.lastChecked)}</div>
                <div>
                  <div className="meta">Domain</div>
                  <span className={`badge ${domain.cls}`}>{domain.text}</span>
                </div>
                <div>
                  <div className="meta">SSL</div>
                  <span className={`badge ${ssl.cls}`}>{ssl.text}</span>
                </div>
              </div>
            </div>
          );
        })}

      <p className="meta" style={{ textAlign: "center", marginTop: 32 }}>
        Refreshes automatically every minute.
      </p>
    </div>
  );
}
