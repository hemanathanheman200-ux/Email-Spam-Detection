/**
 * Email Spam Detection Dashboard — SPA navigation, Chart.js, tables, API predict, exports.
 * Reusable modules: ChartBuilders, EmailTable, Navigation, Reports, Heatmap.
 */
(function () {
  "use strict";

  const dataNode = document.getElementById("dashboardData");
  if (!dataNode) return;

  const DATA = (function () {
    try {
      return JSON.parse(dataNode.textContent || "{}");
    } catch (e) {
      console.warn("dashboardData JSON invalid:", e);
      return {};
    }
  })();

  const sectionMeta = {
    dashboard: {
      title: "Dashboard",
      subtitle: "Overview of email spam detection metrics",
    },
    analysis: {
      title: "Email Analysis",
      subtitle: "Search and filter messages from the loaded dataset",
    },
    prediction: {
      title: "Spam Prediction",
      subtitle: "Run the classifier on any email body",
    },
    visualization: {
      title: "Data Visualization",
      subtitle: "Bar, line, pie charts and a risk heatmap",
    },
    reports: {
      title: "Reports",
      subtitle: "Download weekly, monthly, and PDF summaries",
    },
  };

  /** Chart handles are kept via Chart.getChart(canvasId); registry object not required. */
  let dashboardChartsReady = false;
  let vizChartsReady = false;
  let heatmapReady = false;

  const ChartColor = {
    text: "#94a3b8",
    grid: "rgba(148, 163, 184, 0.12)",
    spam: "#f87171",
    ham: "#34d399",
    accent: "#38bdf8",
    purple: "#a78bfa",
  };

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 950, easing: "easeOutQuart" },
      plugins: {
        legend: {
          labels: { color: ChartColor.text, font: { family: "'DM Sans', sans-serif", size: 12 } },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          titleColor: "#f1f5f9",
          bodyColor: "#cbd5e1",
          borderColor: "rgba(148, 163, 184, 0.25)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
        },
      },
    };
  }

  function scalesXY() {
    return {
      x: {
        ticks: { color: ChartColor.text },
        grid: { color: ChartColor.grid },
        border: { display: false },
      },
      y: {
        ticks: { color: ChartColor.text },
        grid: { color: ChartColor.grid },
        border: { display: false },
      },
    };
  }

  function destroyIfExists(canvasId) {
    if (typeof Chart === "undefined") return;
    const existing = Chart.getChart(canvasId);
    if (existing) existing.destroy();
  }

  const ChartBuilders = {
    dashboardLine() {
      destroyIfExists("chartDashLine");
      const el = document.getElementById("chartDashLine");
      if (!el) return;
      const labels = DATA.timeline?.labels || [];
      new Chart(el, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Spam",
              data: DATA.timeline?.spam || [],
              borderColor: ChartColor.spam,
              backgroundColor: "rgba(248, 113, 113, 0.12)",
              fill: true,
              tension: 0.38,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
            {
              label: "Ham",
              data: DATA.timeline?.ham || [],
              borderColor: ChartColor.ham,
              backgroundColor: "rgba(52, 211, 153, 0.1)",
              fill: true,
              tension: 0.38,
              pointRadius: 4,
              pointHoverRadius: 6,
            },
          ],
        },
        options: {
          ...chartDefaults(),
          scales: scalesXY(),
        },
      });
    },

    dashboardPie() {
      destroyIfExists("chartDashPie");
      const el = document.getElementById("chartDashPie");
      if (!el) return;
      const s = DATA.distribution?.spam ?? 0;
      const h = DATA.distribution?.ham ?? 0;
      new Chart(el, {
        type: "doughnut",
        data: {
          labels: ["Spam", "Ham"],
          datasets: [
            {
              data: [s, h],
              backgroundColor: [ChartColor.spam, ChartColor.ham],
              borderWidth: 0,
              hoverOffset: 12,
            },
          ],
        },
        options: {
          ...chartDefaults(),
          cutout: "62%",
          plugins: {
            ...chartDefaults().plugins,
            legend: { position: "bottom", labels: { color: ChartColor.text, padding: 16 } },
          },
        },
      });
    },

    vizBar() {
      destroyIfExists("chartVizBar");
      const el = document.getElementById("chartVizBar");
      if (!el) return;
      const labels = DATA.sources?.labels || [];
      const values = DATA.sources?.values || [];
      new Chart(el, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Emails",
              data: values,
              backgroundColor: labels.map((_, i) =>
                i % 2 === 0 ? "rgba(56, 189, 248, 0.65)" : "rgba(167, 139, 250, 0.65)"
              ),
              borderRadius: 10,
              borderSkipped: false,
            },
          ],
        },
        options: {
          ...chartDefaults(),
          scales: scalesXY(),
          plugins: { ...chartDefaults().plugins, legend: { display: false } },
        },
      });
    },

    vizLine() {
      destroyIfExists("chartVizLine");
      const el = document.getElementById("chartVizLine");
      if (!el) return;
      const labels = DATA.timeline?.labels || [];
      new Chart(el, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Spam trend",
              data: DATA.timeline?.spam || [],
              borderColor: ChartColor.accent,
              backgroundColor: "rgba(56, 189, 248, 0.15)",
              fill: true,
              tension: 0.4,
              pointRadius: 3,
            },
          ],
        },
        options: {
          ...chartDefaults(),
          scales: scalesXY(),
        },
      });
    },

    vizPie() {
      destroyIfExists("chartVizPie");
      const el = document.getElementById("chartVizPie");
      if (!el) return;
      const s = DATA.distribution?.spam ?? 0;
      const h = DATA.distribution?.ham ?? 0;
      new Chart(el, {
        type: "pie",
        data: {
          labels: ["Spam", "Ham"],
          datasets: [
            {
              data: [s, h],
              backgroundColor: ["rgba(248, 113, 113, 0.85)", "rgba(52, 211, 153, 0.85)"],
              borderWidth: 2,
              borderColor: "rgba(15, 23, 42, 0.9)",
            },
          ],
        },
        options: {
          ...chartDefaults(),
          plugins: {
            ...chartDefaults().plugins,
            legend: { position: "bottom" },
          },
        },
      });
    },
  };

  function initDashboardCharts() {
    if (typeof Chart === "undefined") return;
    if (dashboardChartsReady) return;
    try {
      ChartBuilders.dashboardLine();
      ChartBuilders.dashboardPie();
      dashboardChartsReady = true;
    } catch (e) {
      console.warn("Dashboard charts failed:", e);
    }
  }

  function initVizCharts() {
    if (typeof Chart === "undefined") return;
    if (vizChartsReady) return;
    try {
      ChartBuilders.vizBar();
      ChartBuilders.vizLine();
      ChartBuilders.vizPie();
      vizChartsReady = true;
    } catch (e) {
      console.warn("Visualization charts failed:", e);
    }
  }

  function cellHeatColor(t) {
    const x = Math.max(0, Math.min(1, t));
    const hue = 210 - x * 210;
    return `hsl(${hue}, 82%, ${42 + x * 18}%)`;
  }

  function buildHeatmap() {
    if (heatmapReady) return;
    const wrap = document.getElementById("heatmapGrid");
    if (!wrap) return;
    wrap.innerHTML = "";
    const corner = document.createElement("div");
    corner.className = "heatmap-corner";
    wrap.appendChild(corner);
    const hourChunks = 12;
    for (let c = 0; c < hourChunks; c++) {
      const lab = document.createElement("div");
      lab.className = "heatmap-col-label";
      lab.textContent = `${c * 2}–${c * 2 + 2}h`;
      wrap.appendChild(lab);
    }
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    for (let r = 0; r < 7; r++) {
      const rowLab = document.createElement("div");
      rowLab.className = "heatmap-row-label";
      rowLab.textContent = days[r];
      wrap.appendChild(rowLab);
      for (let c = 0; c < hourChunks; c++) {
        const v =
          0.35 +
          0.45 * Math.sin((r + 1) * 0.7) * Math.cos((c + 1) * 0.5) +
          0.12 * Math.sin((r + c) * 0.35);
        const t = Math.max(0, Math.min(1, v));
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        cell.style.background = cellHeatColor(t);
        cell.style.animationDelay = `${(r * hourChunks + c) * 0.012}s`;
        cell.title = `${days[r]} ${c * 2}:00–${c * 2 + 2}:00 — relative risk ${(t * 100).toFixed(0)}% (demo)`;
        wrap.appendChild(cell);
      }
    }
    heatmapReady = true;
  }

  const EmailTable = {
    rows: Array.isArray(DATA.emails) ? DATA.emails : [],

    render(filtered) {
      const tbody = document.getElementById("emailTableBody");
      const empty = document.getElementById("emailTableEmpty");
      if (!tbody || !empty) return;
      tbody.innerHTML = "";
      if (!filtered.length) {
        empty.hidden = false;
        return;
      }
      empty.hidden = true;
      const frag = document.createDocumentFragment();
      filtered.forEach((row) => {
        const tr = document.createElement("tr");
        const badgeClass = row.status === "spam" ? "badge-spam" : "badge-ham";
        const statusLabel = row.status === "spam" ? "Spam" : "Ham";
        tr.innerHTML = `
          <td>${escapeHtml(row.sender)}</td>
          <td>${escapeHtml(row.subject)}</td>
          <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
          <td>${escapeHtml(row.date)}</td>
        `;
        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    },

    filter() {
      const q = (document.getElementById("emailSearch")?.value || "").trim().toLowerCase();
      const st = document.getElementById("emailFilter")?.value || "all";
      const list = EmailTable.rows.filter((r) => {
        const matchQ =
          !q ||
          (r.sender || "").toLowerCase().includes(q) ||
          (r.subject || "").toLowerCase().includes(q);
        const matchS = st === "all" || r.status === st;
        return matchQ && matchS;
      });
      EmailTable.render(list);
    },
  };

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resizeAllCharts() {
    if (typeof Chart === "undefined") return;
    ["chartDashLine", "chartDashPie", "chartVizBar", "chartVizLine", "chartVizPie"].forEach((id) => {
      const c = Chart.getChart(id);
      if (c) c.resize();
    });
  }

  function showSection(key) {
    document.querySelectorAll(".content-panel").forEach((panel) => {
      const on = panel.dataset.panel === key;
      panel.classList.toggle("active", on);
      panel.setAttribute("aria-hidden", on ? "false" : "true");
    });
    document.querySelectorAll(".nav-item").forEach((btn) => {
      const on = btn.dataset.section === key;
      btn.classList.toggle("active", on);
      if (on) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    const meta = sectionMeta[key];
    if (meta) {
      const t = document.getElementById("pageTitle");
      const s = document.getElementById("pageSubtitle");
      if (t) t.textContent = meta.title;
      if (s) s.textContent = meta.subtitle;
    }
    if (key === "dashboard") initDashboardCharts();
    if (key === "visualization") {
      initVizCharts();
      buildHeatmap();
      requestAnimationFrame(resizeAllCharts);
    }
    if (key === "dashboard") {
      requestAnimationFrame(resizeAllCharts);
    }
  }

  function bindNavigation() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.section;
        if (k) {
          showSection(k);
          closeMobileDrawer();
        }
      });
    });
  }

  const layout = document.getElementById("dashboardLayout");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const mobileBtn = document.getElementById("mobileMenuBtn");
  const backdrop = document.getElementById("sidebarBackdrop");

  function isMobileNav() {
    return window.matchMedia("(max-width: 1024px)").matches;
  }

  function openMobileDrawer() {
    sidebar?.classList.add("is-open");
    backdrop?.classList.add("is-visible");
    mobileBtn?.setAttribute("aria-expanded", "true");
  }

  function closeMobileDrawer() {
    sidebar?.classList.remove("is-open");
    backdrop?.classList.remove("is-visible");
    mobileBtn?.setAttribute("aria-expanded", "false");
  }

  function bindSidebarCollapse() {
    sidebarToggle?.addEventListener("click", () => {
      if (isMobileNav()) {
        const open = sidebar?.classList.contains("is-open");
        if (open) closeMobileDrawer();
        else openMobileDrawer();
        return;
      }
      layout?.classList.toggle("sidebar-collapsed");
      const collapsed = layout?.classList.contains("sidebar-collapsed");
      sidebarToggle?.setAttribute("aria-expanded", collapsed ? "false" : "true");
      requestAnimationFrame(resizeAllCharts);
    });

    mobileBtn?.addEventListener("click", () => {
      if (sidebar?.classList.contains("is-open")) closeMobileDrawer();
      else openMobileDrawer();
    });

    backdrop?.addEventListener("click", closeMobileDrawer);
    window.addEventListener("resize", () => {
      if (!isMobileNav()) closeMobileDrawer();
    });
  }

  const Predictor = {
    async run() {
      const textarea = document.getElementById("predictText");
      const btn = document.getElementById("predictBtn");
      const spin = document.getElementById("predictSpinner");
      const out = document.getElementById("predictResult");
      const text = (textarea?.value || "").trim();
      if (!text) {
        out.hidden = false;
        out.className = "predict-result spam-alert";
        out.innerHTML = "<strong>Input required.</strong> Paste some email content first.";
        return;
      }
      btn.disabled = true;
      spin.hidden = false;
      out.hidden = true;
      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ text }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Prediction failed");
        const spam = payload.label === "spam";
        out.className = spam ? "predict-result spam-alert" : "predict-result ham-alert";
        const head = spam
          ? "<strong>Spam</strong> — model flagged this message."
          : "<strong>Ham</strong> — message looks legitimate.";
        const conf =
          typeof payload.confidence === "number"
            ? `<br/><span class="muted">Confidence: ${(payload.confidence * 100).toFixed(1)}%</span>`
            : "";
        const sig =
          Array.isArray(payload.signals) && payload.signals.length
            ? `<br/><span class="muted">Signals: ${escapeHtml(payload.signals.slice(0, 8).join(", "))}</span>`
            : "";
        out.innerHTML = `${head}${conf}${sig}<br/>${escapeHtml(payload.message || "")}`;
        out.hidden = false;
      } catch (e) {
        out.hidden = false;
        out.className = "predict-result spam-alert";
        out.textContent = e instanceof Error ? e.message : "Could not reach prediction API.";
      } finally {
        btn.disabled = false;
        spin.hidden = true;
      }
    },
  };

  function downloadBlob(filename, mime, text) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const Reports = {
    weeklyCsv() {
      const rows = EmailTable.rows.slice(0, 50);
      const header = "sender,subject,status,date\n";
      const body = rows
        .map((r) =>
          [r.sender, r.subject, r.status, r.date]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");
      downloadBlob("weekly-spam-report.csv", "text/csv;charset=utf-8", header + body);
    },

    monthlyCsv() {
      const rows = EmailTable.rows;
      const header = "sender,subject,status,date\n";
      const body = rows
        .map((r) =>
          [r.sender, r.subject, r.status, r.date]
            .map((c) => `"${String(c).replace(/"/g, '""')}"`)
            .join(",")
        )
        .join("\n");
      const summary = `# Monthly export\n# Total: ${DATA.summary?.total ?? 0}, Spam: ${DATA.summary?.spam ?? 0}, Ham: ${DATA.summary?.ham ?? 0}\n`;
      downloadBlob("monthly-spam-report.csv", "text/csv;charset=utf-8", summary + header + body);
    },

    pdf() {
      const g = window.jspdf;
      if (!g || !g.jsPDF) {
        downloadBlob("spam-statistics.txt", "text/plain;charset=utf-8", "PDF library failed to load.");
        return;
      }
      const { jsPDF } = g;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      let y = margin;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Spam Statistics Report", margin, y);
      y += 32;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(80);
      doc.text(`Period: ${DATA.summary?.period || "—"}`, margin, y);
      y += 22;
      doc.setTextColor(30);
      const lines = [
        `Total emails: ${DATA.summary?.total ?? 0}`,
        `Spam: ${DATA.summary?.spam ?? 0}`,
        `Ham: ${DATA.summary?.ham ?? 0}`,
        `Detection accuracy: ${(DATA.summary?.accuracy ?? 0).toFixed(2)}%`,
        "",
        "This PDF is generated in-browser for dashboard export (demo).",
      ];
      lines.forEach((line) => {
        doc.text(line, margin, y);
        y += 16;
      });
      doc.save("spam-statistics.pdf");
    },

    bind() {
      document.querySelectorAll("[data-download]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-download");
          if (kind === "weekly") Reports.weeklyCsv();
          else if (kind === "monthly") Reports.monthlyCsv();
          else if (kind === "pdf") Reports.pdf();
        });
      });
    },
  };

  function bindResizeCharts() {
    const ro = new ResizeObserver(() => resizeAllCharts());
    const main = document.getElementById("mainContent");
    if (main) ro.observe(main);
  }

  bindNavigation();
  bindSidebarCollapse();
  EmailTable.render(EmailTable.rows);
  document.getElementById("emailSearch")?.addEventListener("input", () => EmailTable.filter());
  document.getElementById("emailFilter")?.addEventListener("change", () => EmailTable.filter());
  document.getElementById("predictBtn")?.addEventListener("click", () => Predictor.run());
  Reports.bind();
  bindResizeCharts();
  showSection("dashboard");
})();
