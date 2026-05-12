/**
 * SpamGuard AI landing page — interactions: mobile nav, smooth scroll,
 * scroll spy on header, prediction API, and light scroll-reveal polish.
 */

(function () {
  "use strict";

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // --- Sticky header shadow on scroll ---
  const header = document.querySelector(".site-header");
  function onScrollHeader() {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  // --- Mobile navigation toggle ---
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  const navLinks = document.querySelectorAll(".nav-link");

  function setNavOpen(open) {
    if (!navToggle || !navMenu) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    navMenu.classList.toggle("is-open", open);
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", () => {
      const open = navToggle.getAttribute("aria-expanded") !== "true";
      setNavOpen(open);
    });

    navLinks.forEach((link) => {
      link.addEventListener("click", () => setNavOpen(false));
    });

    document.addEventListener("click", (e) => {
      if (!navMenu.classList.contains("is-open")) return;
      if (navToggle.contains(e.target) || navMenu.contains(e.target)) return;
      setNavOpen(false);
    });
  }

  // --- Smooth in-page navigation (native scroll-behavior supported; this offsets sticky header) ---
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const headerOffset = header ? header.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerOffset - 12;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  // --- Spam prediction: POST /api/predict ---
  const emailBody = document.getElementById("emailBody");
  const predictBtn = document.getElementById("predictBtn");
  const predictSpinner = document.getElementById("predictSpinner");
  const predictBtnLabel = document.getElementById("predictBtnLabel");
  const clearBtn = document.getElementById("clearBtn");
  const resultHint = document.getElementById("resultHint");
  const resultBox = document.getElementById("resultBox");
  const resultLabel = document.getElementById("resultLabel");
  const resultConfidence = document.getElementById("resultConfidence");
  const resultMessage = document.getElementById("resultMessage");
  const resultSignals = document.getElementById("resultSignals");
  const signalsList = document.getElementById("signalsList");

  const predictOverlay = document.getElementById("predictOverlay");

  function setLoading(loading) {
    if (!predictBtn || !predictSpinner || !predictBtnLabel) return;
    predictBtn.disabled = loading;
    predictSpinner.hidden = !loading;
    predictBtnLabel.textContent = loading ? "Scanning…" : "Predict";

    // Show overlay while prediction is running
    if (predictOverlay) {
      predictOverlay.hidden = !loading;
      predictOverlay.setAttribute("aria-hidden", loading ? "false" : "true");
    }
  }

  // Ensure loading UI is off on initial page render.
  setLoading(false);

  async function runPredict() {
    const text = (emailBody && emailBody.value) || "";
    if (!text.trim()) {
      if (resultHint) resultHint.textContent = "Please enter some email text first.";
      return;
    }

    setLoading(true);
    if (resultHint) resultHint.textContent = "Analyzing message patterns…";

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      // API returns label "spam" | "ham" — map to presentation strings
      const isSpam = data.label === "spam";
      const headline = isSpam ? "Spam" : "Not Spam";

      if (resultBox && resultLabel && resultConfidence && resultMessage) {
        resultBox.hidden = false;
        resultBox.classList.remove("is-spam", "is-ham");
        resultBox.classList.add(isSpam ? "is-spam" : "is-ham");
        resultLabel.textContent = headline;
        resultConfidence.textContent = `Confidence: ${(data.confidence * 100).toFixed(1)}%`;
        resultMessage.textContent = data.message || "";
      }

      if (resultHint) resultHint.textContent = "";

      // Optional signals list from backend
      if (resultSignals && signalsList && Array.isArray(data.signals)) {
        signalsList.innerHTML = "";
        if (data.signals.length) {
          resultSignals.hidden = false;
          data.signals.forEach((sig) => {
            const li = document.createElement("li");
            li.textContent = String(sig).replace(/_/g, " ");
            signalsList.appendChild(li);
          });
        } else {
          resultSignals.hidden = true;
        }
      }
    } catch (err) {
      if (resultHint) resultHint.textContent = err.message || "Something went wrong.";
      if (resultBox) resultBox.hidden = true;
    } finally {
      setLoading(false);
    }
  }

  if (predictBtn) predictBtn.addEventListener("click", runPredict);
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (emailBody) emailBody.value = "";
      if (resultBox) {
        resultBox.hidden = true;
        resultBox.classList.remove("is-spam", "is-ham");
      }
      if (resultHint) resultHint.textContent = "Run a prediction to see output.";
      if (resultSignals) resultSignals.hidden = true;
    });
  }

  // --- Subtle scroll reveal for major sections ---
  const revealEls = document.querySelectorAll(".section, .hero");
  revealEls.forEach((el) => el.classList.add("reveal"));

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-visible");
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }
})();

/* The authenticated dashboard at /dashboard loads static/js/dashboard.js for
   sidebar tab switching, Chart.js, and tables — not this file. */
