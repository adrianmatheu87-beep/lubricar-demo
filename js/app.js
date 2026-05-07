/* ============================================================
   LUBRICAR · NOIR-TECH
   Lenis (desktop), GSAP timelines, status horario,
   sticky scroll-scrub para exploded view (desktop),
   autoplay loop fallback (móvil), floating WhatsApp.
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const mqDesktop = window.matchMedia("(min-width: 961px)");

/* ---------- Lenis (desktop only) ---------- */
let lenis = null;
function initLenis() {
  if (!mqDesktop.matches || prefersReduced || typeof window.Lenis === "undefined") return;

  lenis = new window.Lenis({
    duration: 1.4,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    wheelMultiplier: 0.9,
  });

  lenis.on("scroll", () => {
    if (window.ScrollTrigger) window.ScrollTrigger.update();
  });

  // Use GSAP ticker when available — avoids a second RAF loop competing with GSAP
  if (window.gsap) {
    window.gsap.ticker.add((time) => lenis.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }
}

/* ---------- Nav ---------- */
function initNav() {
  const nav = $("#nav");
  const burger = $("#navBurger");
  const drawer = $("#mobileDrawer");

  const setScrolled = () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  setScrolled();
  window.addEventListener("scroll", setScrolled, { passive: true });

  if (!drawer || !burger) return;

  const setMenuOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    burger.classList.toggle("is-open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("menu-open", open);
  };

  burger.addEventListener("click", () => {
    setMenuOpen(!drawer.classList.contains("is-open"));
  });

  $$("#mobileDrawer a").forEach((a) =>
    a.addEventListener("click", () => setMenuOpen(false))
  );

  mqDesktop.addEventListener?.("change", (e) => {
    if (e.matches) setMenuOpen(false);
  });
}

/* ---------- Status horario (Lun-Vie 9-17, Sáb 9-12) ---------- */
function isOpenNow() {
  const now = new Date();
  const day = now.getDay();
  const h = now.getHours() + now.getMinutes() / 60;
  if (day >= 1 && day <= 5) return h >= 9 && h < 17;
  if (day === 6) return h >= 9 && h < 12;
  return false;
}

function initStatus() {
  const targets = [$("#navStatus"), $("#locStatus"), $("#waFab")].filter(Boolean);
  const apply = () => {
    const open = isOpenNow();
    targets.forEach((el) => {
      el.classList.toggle("is-online", open);
      el.classList.toggle("is-offline", !open);
      el.querySelectorAll(".status-label").forEach((label) => {
        const isFab = el.id === "waFab";
        label.textContent = open
          ? (isFab ? "SISTEMA OPERATIVO" : "[ SISTEMA OPERATIVO ]")
          : (isFab ? "SISTEMA OFFLINE" : "[ SISTEMA OFFLINE ]");
      });
    });
  };
  apply();
  setInterval(apply, 60_000);
}

/* ---------- Hero video — autoplay con resilencia ---------- */
function initHeroVideo() {
  const video = $("#heroVideo");
  if (!video) return;

  const tryPlay = () => {
    const p = video.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        const resume = () => {
          video.play().catch(() => {});
          window.removeEventListener("touchstart", resume);
          window.removeEventListener("click", resume);
        };
        window.addEventListener("touchstart", resume, { once: true });
        window.addEventListener("click", resume, { once: true });
      });
    }
  };

  if (video.readyState >= 2) tryPlay();
  else video.addEventListener("loadeddata", tryPlay, { once: true });
}

/* ---------- Exploded view (canvas frames) ----------
   Frames are lazy-loaded only when the user scrolls near the section,
   keeping initial page load light.
*/
const FRAME_COUNT = 96;
const FRAME_PATH = (i) => `frames/frame_${String(i + 1).padStart(4, "0")}.jpg`;

function initExplodedView() {
  const driver = $("#explodedDriver");
  const stage = $("#explodedStage");
  const canvas = $("#explodedCanvas");
  const poster = $("#explodedPoster");
  const loaderEl = $("#explodedLoader");
  const loaderBar = loaderEl?.querySelector(".loader-bar");
  const pins = $$(".pin");
  if (!driver || !stage || !canvas) return;

  // Pin reveal observer
  const pinObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (window.gsap && !prefersReduced) {
            window.gsap.to(pins, {
              opacity: 1,
              duration: 0.6,
              stagger: 0.18,
              ease: "power2.out",
              onStart: () => pins.forEach((p) => p.classList.add("is-revealed")),
            });
          } else {
            pins.forEach((p) => p.classList.add("is-revealed"));
          }
          pinObserver.disconnect();
        }
      });
    },
    { threshold: 0.2 }
  );
  pinObserver.observe(stage);

  // Canvas — GPU compositing hint via translateZ applied in CSS
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const sizeCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  };
  sizeCanvas();
  requestAnimationFrame(() => {
    sizeCanvas();
    if (frames[currentFrame]) drawFrame(currentFrame);
  });
  window.addEventListener("load", () => {
    sizeCanvas();
    if (frames[currentFrame]) drawFrame(currentFrame);
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  });
  window.addEventListener("resize", () => {
    sizeCanvas();
    if (frames[currentFrame]) drawFrame(currentFrame);
  }, { passive: true });

  const frames = new Array(FRAME_COUNT);
  let loaded = 0;
  let firstReady = false;
  let currentFrame = -1;

  const drawFrame = (i) => {
    const img = frames[i];
    if (!img) return;
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  const loadOne = (i) => new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      frames[i] = img;
      loaded++;
      if (loaderBar) loaderBar.style.width = `${(loaded / FRAME_COUNT) * 100}%`;
      if (!firstReady && i === 0) {
        firstReady = true;
        drawFrame(0);
        currentFrame = 0;
        if (poster) poster.classList.add("is-hidden");
      }
      resolve();
    };
    img.onerror = () => { loaded++; resolve(); };
    img.src = FRAME_PATH(i);
  });

  const loadAll = async () => {
    await loadOne(0);
    // Increased concurrency for faster sequential load after first frame
    const concurrency = 10;
    let next = 1;
    const workers = Array.from({ length: concurrency }, async () => {
      while (next < FRAME_COUNT) {
        const i = next++;
        await loadOne(i);
      }
    });
    await Promise.all(workers);
    if (loaderEl) loaderEl.classList.add("is-done");
  };

  // Lazy-load frames only when section is near — keeps initial page load fast
  const loadObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        loadAll();
        loadObserver.disconnect();
      }
    },
    { rootMargin: "400px" }
  );
  loadObserver.observe(driver);

  if (typeof window.ScrollTrigger === "undefined") return;

  let target = 0;
  let current = 0;
  let raf = null;

  const tick = () => {
    current += (target - current) * 0.22;
    const idx = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(current)));
    if (idx !== currentFrame && frames[idx]) {
      currentFrame = idx;
      drawFrame(idx);
    }
    if (Math.abs(target - current) > 0.05) {
      raf = requestAnimationFrame(tick);
    } else {
      current = target;
      raf = null;
    }
  };

  window.ScrollTrigger.create({
    trigger: driver,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate: (self) => {
      target = self.progress * (FRAME_COUNT - 1);
      if (!raf) raf = requestAnimationFrame(tick);
    },
  });

  setTimeout(() => window.ScrollTrigger.refresh(), 600);
}

/* ---------- Hero title mask reveal ---------- */
function initHeroReveal() {
  if (typeof window.gsap === "undefined") return;
  const words = $$(".hero-title .word");
  if (!words.length) return;

  words.forEach((w) => {
    const text = w.textContent;
    w.innerHTML = `<span style="display:inline-block;will-change:transform">${text}</span>`;
  });

  if (prefersReduced) return;

  window.gsap.from(".hero-title .word > span", {
    y: "115%",
    duration: 1.1,
    ease: "expo.out",
    stagger: 0.07,
    delay: 0.2,
  });

  window.gsap.from(".hero-eyebrow, .hero-sub, .hero-actions", {
    opacity: 0,
    y: 20,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.12,
    delay: 0.9,
  });
}

/* ---------- Section reveals ---------- */
function initSectionReveals() {
  if (typeof window.gsap === "undefined" || typeof window.ScrollTrigger === "undefined") return;
  if (prefersReduced) return;

  $$(".section-head").forEach((head) => {
    window.gsap.from(head.children, {
      opacity: 0,
      y: 24,
      duration: 0.9,
      ease: "power3.out",
      stagger: 0.1,
      scrollTrigger: { trigger: head, start: "top 80%" },
    });
  });

  // Single batched trigger for all bento cells — replaces 8 individual triggers
  window.gsap.from(".bento-cell", {
    opacity: 0,
    y: 32,
    duration: 0.75,
    ease: "power3.out",
    stagger: 0.06,
    scrollTrigger: { trigger: ".bento", start: "top 85%" },
  });
}

/* ---------- Bento mouse-track glow + card navigation ---------- */
function initBentoGlow() {
  $$(".bento-cell").forEach((cell) => {
    cell.addEventListener("mousemove", (e) => {
      const rect = cell.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      cell.style.setProperty("--mx", `${mx}%`);
      cell.style.setProperty("--my", `${my}%`);
    });

    const href = cell.dataset.href;
    if (href) {
      cell.style.cursor = "pointer";
      cell.addEventListener("click", () => { window.location.href = href; });
    }
  });
}

/* ---------- Floating WhatsApp visibility ---------- */
function initWaFab() {
  const fab = $("#waFab");
  if (!fab) return;
  const onScroll = () => {
    fab.classList.toggle("is-visible", window.scrollY > window.innerHeight * 0.6);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ---------- Boot ---------- */
function boot() {
  if (window.gsap && window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
  }
  initLenis();
  initNav();
  initStatus();
  initHeroVideo();
  initExplodedView();
  initHeroReveal();
  initSectionReveals();
  initBentoGlow();
  initWaFab();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
