import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";

function daysLabel(days) {
  if (days == null) return { text: "-", cls: "unknown" };
  if (days <= 0) return { text: "EXPIRED", cls: "down" };
  if (days <= 14) return { text: `${days}d left`, cls: "down" };
  if (days <= 30) return { text: `${days}d left`, cls: "warn" };
  return { text: `${days}d left`, cls: "up" };
}

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sites, setSites] = useState([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkStatus, setCheckStatus] = useState("");
  const [editingSite, setEditingSite] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", url: "", domainExpiry: "", sslExpiry: "" });
  const [editLoading, setEditLoading] = useState(false);

  const loadSites = useCallback(async () => {
    const res = await fetch("/api/sites");
    if (res.status === 401) return router.replace("/login");
    const data = await res.json();
    setSites(data);
  }, [router]);

  async function handleCheckAll() {
    setCheckingAll(true);
    setCheckStatus("Checking site health, SSL certificates, and domain expiry...");
    try {
      const res = await fetch("/api/sites/check-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to check sites");
      setCheckStatus(data.message || `Checked ${data.checkedCount} sites.`);
      await loadSites();
      setTimeout(() => setCheckStatus(""), 6000);
    } catch (err) {
      setCheckStatus("Check failed: " + err.message);
    } finally {
      setCheckingAll(false);
    }
  }

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setEmail(data.email))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
    loadSites();
  }, [router, loadSites]);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add site");
      setName("");
      setUrl("");
      loadSites();
    } catch (err) {
      setError(err.message);
    }
  }

  // Parses lines like "Name, https://example.com" - tolerates a header row and blank lines
  function parseBulkText(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/^name\s*,\s*url$/i.test(line))
      .map((line) => {
        const [rawName, ...rest] = line.split(",");
        return { name: (rawName || "").trim(), url: rest.join(",").trim() };
      })
      .filter((entry) => entry.name && entry.url);
  }

  function handleCsvFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => setBulkText((prev) => (prev ? prev + "\n" : "") + evt.target.result);
    reader.readAsText(file);
  }

  async function handleBulkAdd(e) {
    e.preventDefault();
    setBulkResult(null);
    const sites = parseBulkText(bulkText);
    if (sites.length === 0) {
      setBulkResult({ error: "No valid \"name, url\" lines found" });
      return;
    }
    setBulkLoading(true);
    try {
      const res = await fetch("/api/sites/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sites }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk add failed");
      setBulkResult(data);
      setBulkText("");
      loadSites();
    } catch (err) {
      setBulkResult({ error: err.message });
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleTogglePublic(site) {
    await fetch(`/api/sites/${site._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !site.isPublic }),
    });
    loadSites();
  }

  async function handleDelete(id) {
    if (!confirm("Remove this site from monitoring?")) return;
    await fetch(`/api/sites/${id}`, { method: "DELETE" });
    loadSites();
  }

  function openEdit(site) {
    setEditingSite(site);
    setEditForm({
      name: site.name || "",
      url: site.url || "",
      domainExpiry: site.domainExpiry ? new Date(site.domainExpiry).toISOString().split("T")[0] : "",
      sslExpiry: site.sslExpiry ? new Date(site.sslExpiry).toISOString().split("T")[0] : "",
    });
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingSite) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/sites/${editingSite._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name,
          url: editForm.url,
          domainExpiry: editForm.domainExpiry ? new Date(editForm.domainExpiry).toISOString() : null,
          sslExpiry: editForm.sslExpiry ? new Date(editForm.sslExpiry).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save changes");
      setEditingSite(null);
      loadSites();
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) return null;

  const upCount = sites.filter((s) => s.status === "up").length;
  const downCount = sites.filter((s) => s.status === "down").length;
  const expiringSoon = sites.filter(
    (s) => (s.domainDaysLeft != null && s.domainDaysLeft <= 30) || (s.sslDaysLeft != null && s.sslDaysLeft <= 30)
  ).length;

  return (
    <>
      <div className="topbar">
        <h1>Site Monitor</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/status" target="_blank" rel="noreferrer" className="meta">View public status page</a>
          <span className="meta">{email}</span>
          <button className="secondary" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div className="container">
        <div className="summary-row">
          <div className="summary-pill"><strong>{sites.length}</strong>Total sites</div>
          <div className="summary-pill"><strong style={{ color: "#16a34a" }}>{upCount}</strong>Up</div>
          <div className="summary-pill"><strong style={{ color: "#dc2626" }}>{downCount}</strong>Down</div>
          <div className="summary-pill"><strong style={{ color: "#a16207" }}>{expiringSoon}</strong>Expiring soon</div>
        </div>

        <form className="add-form" onSubmit={handleAdd}>
          <input placeholder="Site name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input
            placeholder="https://example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button type="submit">Add site</button>
        </form>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={handleCheckAll} disabled={checkingAll} style={{ backgroundColor: "#2563eb", color: "#fff", cursor: checkingAll ? "not-allowed" : "pointer" }}>
            {checkingAll ? "⏳ Checking all sites..." : "⚡ Check all sites now"}
          </button>
          <button className="secondary" onClick={() => setShowBulk((v) => !v)}>
            {showBulk ? "Hide bulk import" : "Bulk import sites"}
          </button>
          {checkStatus && <span className="meta" style={{ fontWeight: 500 }}>{checkStatus}</span>}
        </div>

        {showBulk && (
          <form className="card" style={{ flexDirection: "column", alignItems: "stretch" }} onSubmit={handleBulkAdd}>
            <h2>Bulk import</h2>
            <p className="meta">
              One site per line: <code>Name, https://example.com</code>. Or upload a CSV with
              a <code>name,url</code> column.
            </p>
            <textarea
              rows={8}
              placeholder={"Company Blog, https://blog.example.com\nClient Site, https://client.com"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              style={{ width: "100%", padding: 10, fontFamily: "monospace", fontSize: 13, marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="file" accept=".csv,.txt" onChange={handleCsvFile} style={{ width: "auto", margin: 0 }} />
              <button type="submit" disabled={bulkLoading}>
                {bulkLoading ? "Importing..." : "Import all"}
              </button>
            </div>
            {bulkResult?.error && <div className="error">{bulkResult.error}</div>}
            {bulkResult && !bulkResult.error && (
              <p className="meta" style={{ marginTop: 8 }}>
                Added {bulkResult.createdCount} site(s).
                {bulkResult.failedCount > 0 && ` ${bulkResult.failedCount} failed: ${bulkResult.failed.map((f) => f.name || f.url).join(", ")}`}
              </p>
            )}
          </form>
        )}

        {sites.length === 0 && <p className="meta">No sites yet — add your first one above.</p>}

        {sites
          .slice()
          .sort((a, b) => (a.status === "down" ? -1 : 1))
          .map((site) => {
            const domain = daysLabel(site.domainDaysLeft);
            const ssl = daysLabel(site.sslDaysLeft);
            return (
              <div className="card" key={site._id}>
                <div>
                  <h2>{site.name}</h2>
                  <div className="meta">{site.url}</div>
                </div>
                <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                  <span className={`badge ${site.status}`}>{site.status.toUpperCase()}</span>
                  <div className="meta">
                    Response: {site.lastResponseTime != null ? `${site.lastResponseTime}ms` : "-"}
                  </div>
                  <div>
                    <div className="meta">Domain</div>
                    <span className={`badge ${domain.cls}`}>{domain.text}</span>
                  </div>
                  <div>
                    <div className="meta">SSL</div>
                    <span className={`badge ${ssl.cls}`}>{ssl.text}</span>
                  </div>
                  <button className="secondary" onClick={() => openEdit(site)}>Edit</button>
                  <button className="secondary" onClick={() => handleTogglePublic(site)}>
                    {site.isPublic ? "Public" : "Private"}
                  </button>
                  <button className="secondary" onClick={() => handleDelete(site._id)}>Remove</button>
                </div>
              </div>
            );
          })}
      </div>

      {editingSite && (
        <div className="modal-overlay" onClick={() => setEditingSite(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16, fontSize: 18 }}>Edit Site Details</h2>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label>Site Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>URL</label>
                <input
                  value={editForm.url}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Domain Expiration Date</label>
                <input
                  type="date"
                  value={editForm.domainExpiry}
                  onChange={(e) => setEditForm({ ...editForm, domainExpiry: e.target.value })}
                />
                <span className="meta" style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                  Set or adjust exact domain expiration date (useful for .ae or private domains).
                </span>
              </div>
              <div className="form-group">
                <label>SSL Certificate Expiration Date</label>
                <input
                  type="date"
                  value={editForm.sslExpiry}
                  onChange={(e) => setEditForm({ ...editForm, sslExpiry: e.target.value })}
                />
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                <button type="button" className="secondary" onClick={() => setEditingSite(null)}>
                  Cancel
                </button>
                <button type="submit" disabled={editLoading}>
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
