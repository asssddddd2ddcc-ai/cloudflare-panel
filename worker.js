const API_BASE = "https://api.cloudflare.com/client/v4";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function cfFetch(path, env, options = {}) {
  const token = env.CF_API_TOKEN;
  if (!token) throw new Error("CF_API_TOKEN is not configured");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({
    success: false,
    errors: [{ message: "Invalid JSON response from Cloudflare" }]
  }));

  return { response, body };
}

function getError(body) {
  return body?.errors?.map(e => e.message).join(", ") || "Cloudflare API error";
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    // Health/config check without exposing secrets.
    if (path === "/api/health" && method === "GET") {
      return json({ ok: Boolean(env.CF_API_TOKEN) });
    }

    // List zones.
    if (path === "/api/zones" && method === "GET") {
      const params = new URLSearchParams(url.search);
      if (!params.has("per_page")) params.set("per_page", "50");

      const { response, body } = await cfFetch(`/zones?${params}`, env);
      if (!response.ok || body.success === false) {
        return json({ error: getError(body) }, response.status);
      }

      return json({
        result: body.result || [],
        result_info: body.result_info || null
      });
    }

    const zoneMatch = path.match(/^\/api\/zones\/([^/]+)\/dns$/);
    if (zoneMatch) {
      const zoneId = zoneMatch[1];

      if (method === "GET") {
        const params = new URLSearchParams(url.search);
        if (!params.has("per_page")) params.set("per_page", "100");
        const { response, body } = await cfFetch(
          `/zones/${zoneId}/dns_records?${params}`,
          env
        );

        if (!response.ok || body.success === false) {
          return json({ error: getError(body) }, response.status);
        }

        return json({
          result: body.result || [],
          result_info: body.result_info || null
        });
      }

      if (method === "POST") {
        const payload = await request.json();
        const allowed = ["type", "name", "content", "ttl", "proxied", "priority", "comment"];
        const record = Object.fromEntries(
          Object.entries(payload).filter(([key]) => allowed.includes(key))
        );

        if (!record.type || !record.name || !record.content) {
          return json({ error: "type, name and content are required" }, 400);
        }

        const { response, body } = await cfFetch(
          `/zones/${zoneId}/dns_records`,
          env,
          { method: "POST", body: JSON.stringify(record) }
        );

        if (!response.ok || body.success === false) {
          return json({ error: getError(body) }, response.status);
        }

        return json({ result: body.result }, 201);
      }
    }

    const recordMatch = path.match(/^\/api\/zones\/([^/]+)\/dns\/([^/]+)$/);
    if (recordMatch && method === "DELETE") {
      const zoneId = recordMatch[1];
      const recordId = recordMatch[2];

      const { response, body } = await cfFetch(
        `/zones/${zoneId}/dns_records/${recordId}`,
        env,
        { method: "DELETE" }
      );

      if (!response.ok || body.success === false) {
        return json({ error: getError(body) }, response.status);
      }

      return json({ result: body.result });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Internal server error" }, 500);
  }
}

const PAGE = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloudflare Panel</title>
  <style>
*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;background:#f5f7fb;color:#172033}.app{display:flex;min-height:100vh}.sidebar{width:250px;background:#111827;color:#fff;padding:22px 16px;display:flex;flex-direction:column;gap:8px}.brand{display:flex;align-items:center;gap:10px;padding:8px 6px 25px}.brand small{display:block;color:#9ca3af;margin-top:4px}.logo{width:42px;height:42px;border-radius:12px;background:#f6821f;display:grid;place-items:center;font-weight:800}.nav{border:0;background:transparent;color:#cbd5e1;text-align:right;padding:13px 14px;border-radius:9px;cursor:pointer;font-size:14px}.nav:hover,.nav.active{background:#1f2937;color:#fff}.sidebar-footer{margin-top:auto;padding:12px;color:#9ca3af;font-size:12px}.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-left:6px}.main{flex:1;padding:28px;min-width:0}.topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:25px}.topbar h1{margin:0 0 7px}.topbar p{margin:0;color:#6b7280}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px}.card,.panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 2px 8px #00000008}.card{padding:22px}.card span{display:block;color:#6b7280;font-size:13px;margin-bottom:10px}.card strong{font-size:25px}.panel{padding:20px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:15px}.panel-head h2{margin:0;font-size:17px}.btn{border:0;border-radius:8px;padding:10px 15px;background:#e5e7eb;cursor:pointer;font-weight:600}.btn.primary{background:#f6821f;color:#fff}.btn.secondary{background:#eef2f7}.toolbar{display:flex;gap:10px;align-items:end;margin-bottom:18px}.toolbar label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:bold}.toolbar select{min-width:260px}.search{border:1px solid #d1d5db;border-radius:8px;padding:9px 12px}.page.hidden,.hidden{display:none!important}table{width:100%;border-collapse:collapse}th,td{padding:12px 10px;border-bottom:1px solid #edf0f3;text-align:right;font-size:13px}th{color:#6b7280;background:#fafafa}.tag{padding:4px 8px;border-radius:6px;background:#eef2ff;font-size:11px}.actions button{border:0;background:#fee2e2;color:#b91c1c;padding:6px 9px;border-radius:6px;cursor:pointer}.modal{position:fixed;inset:0;background:#0008;display:grid;place-items:center;padding:20px}.modal-box{background:#fff;width:min(500px,100%);border-radius:15px;padding:22px}.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.modal-head h2{margin:0}.icon-btn{border:0;background:transparent;font-size:26px;cursor:pointer}.modal-box form{display:grid;gap:13px}.modal-box label{font-size:13px;font-weight:bold;display:grid;gap:6px}.modal-box input,.modal-box select,.toolbar select{border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#fff}.check{display:flex!important;grid-template-columns:auto 1fr;align-items:center;gap:8px!important}.modal-actions{display:flex;justify-content:flex-start;gap:8px;margin-top:8px}#toast{position:fixed;left:25px;bottom:25px;background:#111827;color:#fff;padding:12px 16px;border-radius:9px;opacity:0;pointer-events:none;transition:.2s}#toast.show{opacity:1}.empty{padding:30px;text-align:center;color:#6b7280}.error{padding:14px;background:#fee2e2;color:#991b1b;border-radius:8px}@media(max-width:800px){.sidebar{width:70px}.brand div:not(.logo),.nav{font-size:0}.nav:before{content:"•";font-size:20px}.main{padding:16px}.cards{grid-template-columns:1fr}.toolbar{flex-wrap:wrap}.toolbar select{min-width:180px}}

</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">CF</div>
        <div>
          <strong>Cloudflare Panel</strong>
          <small>مدیریت DNS</small>
        </div>
      </div>

      <button class="nav active" data-page="dashboard">داشبورد</button>
      <button class="nav" data-page="dns">DNS Records</button>

      <div class="sidebar-footer">
        <span class="status-dot"></span>
        <span id="connectionText">در حال بررسی...</span>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <h1 id="pageTitle">داشبورد</h1>
          <p>مدیریت امن Cloudflare از طریق API</p>
        </div>
        <button class="btn secondary" id="refreshBtn">↻ بروزرسانی</button>
      </header>

      <section id="dashboardPage" class="page">
        <div class="cards">
          <div class="card">
            <span>تعداد Zone ها</span>
            <strong id="zoneCount">-</strong>
          </div>
          <div class="card">
            <span>Zone انتخاب‌شده</span>
            <strong id="selectedZone">-</strong>
          </div>
          <div class="card">
            <span>وضعیت API</span>
            <strong id="apiStatus">-</strong>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Zone ها</h2>
            <button class="btn" id="openDnsBtn">مدیریت DNS</button>
          </div>
          <div id="zonesTable"></div>
        </div>
      </section>

      <section id="dnsPage" class="page hidden">
        <div class="toolbar">
          <label>
            Zone
            <select id="zoneSelect"></select>
          </label>
          <button class="btn" id="loadDnsBtn">بارگذاری رکوردها</button>
          <button class="btn primary" id="addRecordBtn">+ رکورد جدید</button>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>DNS Records</h2>
            <input id="searchInput" class="search" placeholder="جستجو...">
          </div>
          <div id="dnsTable"></div>
        </div>
      </section>
    </main>
  </div>

  <div class="modal hidden" id="recordModal">
    <div class="modal-box">
      <div class="modal-head">
        <h2>افزودن رکورد DNS</h2>
        <button class="icon-btn" id="closeModal">×</button>
      </div>

      <form id="recordForm">
        <label>Type
          <select name="type" id="recordType">
            <option>A</option>
            <option>AAAA</option>
            <option>CNAME</option>
            <option>TXT</option>
            <option>MX</option>
            <option>NS</option>
          </select>
        </label>

        <label>Name
          <input name="name" required placeholder="example.com">
        </label>

        <label>Content
          <input name="content" required placeholder="192.0.2.1">
        </label>

        <label>TTL
          <input name="ttl" type="number" min="60" value="1">
        </label>

        <label class="check">
          <input name="proxied" type="checkbox" checked>
          Proxied
        </label>

        <div class="modal-actions">
          <button type="button" class="btn secondary" id="cancelModal">انصراف</button>
          <button type="submit" class="btn primary">ایجاد رکورد</button>
        </div>
      </form>
    </div>
  </div>

  <div id="toast"></div>
  <script>
let zones = [];
let records = [];
let selectedZoneId = "";

const $ = (s) => document.querySelector(s);

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {"Content-Type": "application/json", ...(options.headers || {})}
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "خطا در درخواست");
  return data;
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(x => x.classList.add("hidden"));
  $(\`#\${page}Page\`).classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x => x.classList.toggle("active", x.dataset.page === page));
  $("#pageTitle").textContent = page === "dashboard" ? "داشبورد" : "مدیریت DNS";
}

function renderZones() {
  $("#zoneCount").textContent = zones.length;
  $("#zonesTable").innerHTML = zones.length ? \`
    <table>
      <thead><tr><th>نام</th><th>وضعیت</th><th>پلن</th><th></th></tr></thead>
      <tbody>
        \${zones.map(z => \`
          <tr>
            <td>\${escapeHtml(z.name)}</td>
            <td><span class="tag">\${escapeHtml(z.status || "-")}</span></td>
            <td>\${escapeHtml(z.plan?.name || "-")}</td>
            <td><button class="btn" onclick="selectZone('\${z.id}')">DNS</button></td>
          </tr>\`).join("")}
      </tbody>
    </table>\` : \`<div class="empty">Zone ای پیدا نشد.</div>\`;

  $("#zoneSelect").innerHTML = zones.map(z =>
    \`<option value="\${z.id}">\${escapeHtml(z.name)}</option>\`
  ).join("");

  if (selectedZoneId && zones.some(z => z.id === selectedZoneId)) {
    $("#zoneSelect").value = selectedZoneId;
  } else if (zones[0]) {
    selectedZoneId = zones[0].id;
    $("#zoneSelect").value = selectedZoneId;
  }
  updateSelectedZoneText();
}

function updateSelectedZoneText() {
  const z = zones.find(x => x.id === selectedZoneId);
  $("#selectedZone").textContent = z?.name || "-";
}

function selectZone(id) {
  selectedZoneId = id;
  $("#zoneSelect").value = id;
  updateSelectedZoneText();
  showPage("dns");
  loadDns();
}

async function loadZones() {
  try {
    const data = await api("/api/zones?per_page=100");
    zones = data.result || [];
    renderZones();
    $("#apiStatus").textContent = "متصل";
    $("#connectionText").textContent = "Cloudflare متصل";
  } catch (e) {
    $("#apiStatus").textContent = "خطا";
    $("#connectionText").textContent = "خطا در اتصال";
    $("#zonesTable").innerHTML = \`<div class="error">\${escapeHtml(e.message)}</div>\`;
  }
}

async function loadDns() {
  selectedZoneId = $("#zoneSelect").value;
  updateSelectedZoneText();
  if (!selectedZoneId) return;

  $("#dnsTable").innerHTML = \`<div class="empty">در حال بارگذاری...</div>\`;
  try {
    const data = await api(\`/api/zones/\${selectedZoneId}/dns?per_page=100\`);
    records = data.result || [];
    renderDns();
  } catch (e) {
    $("#dnsTable").innerHTML = \`<div class="error">\${escapeHtml(e.message)}</div>\`;
  }
}

function renderDns() {
  const q = $("#searchInput").value.trim().toLowerCase();
  const filtered = records.filter(r =>
    [r.type, r.name, r.content].join(" ").toLowerCase().includes(q)
  );

  $("#dnsTable").innerHTML = filtered.length ? \`
    <table>
      <thead><tr><th>Type</th><th>Name</th><th>Content</th><th>TTL</th><th>Proxy</th><th></th></tr></thead>
      <tbody>
        \${filtered.map(r => \`
          <tr>
            <td><span class="tag">\${escapeHtml(r.type)}</span></td>
            <td>\${escapeHtml(r.name)}</td>
            <td style="max-width:360px;word-break:break-all">\${escapeHtml(r.content)}</td>
            <td>\${r.ttl === 1 ? "Auto" : r.ttl}</td>
            <td>\${r.proxied ? "فعال" : "خاموش"}</td>
            <td class="actions">
              <button onclick="deleteRecord('\${r.id}')">حذف</button>
            </td>
          </tr>\`).join("")}
      </tbody>
    </table>\` : \`<div class="empty">رکوردی پیدا نشد.</div>\`;
}

async function deleteRecord(id) {
  if (!confirm("این رکورد حذف شود؟")) return;
  try {
    await api(\`/api/zones/\${selectedZoneId}/dns/\${id}\`, {method: "DELETE"});
    toast("رکورد حذف شد");
    await loadDns();
  } catch (e) {
    toast(e.message);
  }
}

$("#recordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const payload = {
    type: fd.get("type"),
    name: fd.get("name"),
    content: fd.get("content"),
    ttl: Number(fd.get("ttl") || 1),
    proxied: fd.get("proxied") === "on"
  };

  try {
    await api(\`/api/zones/\${selectedZoneId}/dns\`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    $("#recordModal").classList.add("hidden");
    e.currentTarget.reset();
    toast("رکورد ایجاد شد");
    await loadDns();
  } catch (e) {
    toast(e.message);
  }
});

$("#zoneSelect").addEventListener("change", (e) => {
  selectedZoneId = e.target.value;
  updateSelectedZoneText();
  loadDns();
});
$("#loadDnsBtn").onclick = loadDns;
$("#refreshBtn").onclick = loadZones;
$("#openDnsBtn").onclick = () => showPage("dns");
$("#addRecordBtn").onclick = () => $("#recordModal").classList.remove("hidden");
$("#closeModal").onclick = () => $("#recordModal").classList.add("hidden");
$("#cancelModal").onclick = () => $("#recordModal").classList.add("hidden");
$("#searchInput").addEventListener("input", renderDns);

document.querySelectorAll(".nav").forEach(btn =>
  btn.addEventListener("click", () => showPage(btn.dataset.page))
);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}

loadZones();

</script>
</body>
</html>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" }
    });
  }
};
