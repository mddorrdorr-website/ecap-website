/* MD DorrDorr.gh — shared interactions */
(function () {
  "use strict";

  // Mobile menu toggle
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.querySelector(".mobile-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        menu.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Scroll reveal
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });

    // Reveal anything already in (or above) the viewport on load, observe the rest.
    reveals.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.95) {
        el.classList.add("in");
      } else {
        io.observe(el);
      }
    });

    // Safety net: on jump-links / fast scrolls, reveal anything scrolled past.
    var sweep = function () {
      reveals.forEach(function (el) {
        if (!el.classList.contains("in") &&
            el.getBoundingClientRect().top < window.innerHeight * 0.95) {
          el.classList.add("in"); io.unobserve(el);
        }
      });
    };
    window.addEventListener("scroll", sweep, { passive: true });
    window.addEventListener("hashchange", function () { setTimeout(sweep, 60); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  // Footer year
  var yr = document.getElementById("year");
  if (yr) { yr.textContent = new Date().getFullYear(); }
})();
