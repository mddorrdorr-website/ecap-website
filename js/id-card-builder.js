/* ECAP ID card builder — code lookup, live preview, SVG rendering, download + send.
   The uploaded photo is held only in a page-level JS variable (never localStorage,
   never uploaded until the user explicitly presses "Send"), so nothing is persisted.

   Card artwork comes from ECAPCard (js/card-renderer.js) — the same renderer
   used to produce the approved design. This file's job is only to: (1) run the
   drag-to-reposition/zoom photo editor and flatten its result into a square
   crop at the renderer's required size, and (2) feed participant + photo data
   into ECAPCard.renderFront()/renderBack() for the live preview and into a
   canvas for PNG export.

   Photo position/zoom model: `photo.zoom` (1 = fitted/"cover", up to 3 = zoomed
   in) and `photo.offX` / `photo.offY` (each -1..1, fraction of the max pan
   distance at the current zoom). Because these three numbers are independent
   of pixel size, the exact same crop reproduces correctly at any box size —
   the big drag-to-position stage and the flattened crop fed to the renderer
   both call computePhotoGeometry() with their own box size and match exactly. */
(function () {
  "use strict";

  var registration = null;   // the looked-up registration record
  var photo = null;          // { img, dataUrl, naturalW, naturalH, zoom, offX, offY } — in-memory only
  var renderFrame = 0;       // rAF handle so dragging doesn't re-render on every pixel

  var PHOTO_BOX = (window.ECAPCard ? ECAPCard.meta.photo.width : 336) * 2; // 672 — the renderer's working crop size

  function courseTitles(ids) {
    return ids
      .map(function (id) { return ECAP_COURSES.find(function (c) { return c.id === id; }); })
      .filter(Boolean)
      .map(function (c) { return c.title; });
  }

  // ---------- Step A: code entry ----------
  var codeInput = document.getElementById("codeInput");
  var codeError = document.getElementById("codeError");
  var codeStep = document.getElementById("codeStep");
  var builderStep = document.getElementById("builderStep");

  var preCode = new URLSearchParams(window.location.search).get("code");
  if (preCode) {
    codeInput.value = preCode;
    var preRec = EcapRegistration.lookupCode(preCode);
    if (preRec) { registration = preRec; enterBuilder(); }
  }

  function tryEnterBuilder() {
    var code = codeInput.value.trim().toUpperCase();
    var rec = EcapRegistration.lookupCode(code);
    if (!rec) {
      codeError.style.display = "block";
      return;
    }
    codeError.style.display = "none";
    registration = rec;
    enterBuilder();
  }
  document.getElementById("codeSubmit").addEventListener("click", tryEnterBuilder);
  codeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") tryEnterBuilder(); });

  function enterBuilder() {
    codeStep.style.display = "none";
    builderStep.style.display = "block";
    builderStep.classList.add("in");

    var electiveNames = courseTitles(registration.electives || []).join(", ") || "—";
    document.getElementById("detailsSummary").innerHTML =
      "<div><strong style='color:var(--navy);'>Name:</strong> " + registration.fullName + "</div>" +
      "<div><strong style='color:var(--navy);'>Cohort:</strong> " + (registration.cohortLabel || "—") + "</div>" +
      "<div><strong style='color:var(--navy);'>Code:</strong> " + registration.code + "</div>" +
      "<div><strong style='color:var(--navy);'>Electives:</strong> " + electiveNames + "</div>";

    renderCardPreview();
  }

  // ---------- Photo geometry (shared by the drag/zoom stage and the final crop) ----------
  function computePhotoGeometry(state, box) {
    var baseScale = Math.max(box / state.naturalW, box / state.naturalH);
    var scale = baseScale * state.zoom;
    var w = state.naturalW * scale, h = state.naturalH * scale;
    var maxOffX = Math.max(0, (w - box) / 2);
    var maxOffY = Math.max(0, (h - box) / 2);
    return {
      w: w, h: h,
      left: (box - w) / 2 + state.offX * maxOffX,
      top: (box - h) / 2 + state.offY * maxOffY,
    };
  }

  function applyGeometryToImg(imgEl, state, box) {
    var g = computePhotoGeometry(state, box);
    imgEl.style.width = g.w + "px";
    imgEl.style.height = g.h + "px";
    imgEl.style.left = g.left + "px";
    imgEl.style.top = g.top + "px";
  }

  // Flatten the current photo + crop state into a square JPEG at the
  // renderer's working resolution (672x672 = 2x its 336px photo frame).
  // This is the same approach as the original design's ui.js: pre-crop once
  // so the renderer always receives an already-correct, already-square image.
  function buildCroppedPhotoDataUrl() {
    if (!photo) return "";
    var canvas = document.createElement("canvas");
    canvas.width = PHOTO_BOX; canvas.height = PHOTO_BOX;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, PHOTO_BOX, PHOTO_BOX); // flattens transparency, matches renderer's own white-matte behaviour
    var g = computePhotoGeometry(photo, PHOTO_BOX);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo.img, g.left, g.top, g.w, g.h);
    return canvas.toDataURL("image/jpeg", 0.96);
  }

  function cardData() {
    return {
      fullName: registration.fullName,
      courseCode: registration.code,
      nationality: registration.nationality,
      organisation: registration.organisation,
      photoDataUrl: buildCroppedPhotoDataUrl(),
    };
  }

  function renderCardPreview() {
    var data = cardData();
    var options = { logoDataUrl: window.ECAP_LOGO_DATA_URL };
    document.getElementById("frontMount").innerHTML = ECAPCard.renderFront(data, options);
    document.getElementById("backMount").innerHTML = ECAPCard.renderBack(data, options);

    var warnings = ECAPCard.getLayoutWarnings(data, options);
    var note = document.getElementById("layoutWarning");
    note.textContent = warnings.join(" ");
    note.style.display = warnings.length ? "block" : "none";
  }

  function scheduleRender() {
    if (renderFrame) cancelAnimationFrame(renderFrame);
    renderFrame = requestAnimationFrame(function () { renderFrame = 0; renderCardPreview(); });
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  var stage = document.getElementById("photoStage");
  var stageImg = document.getElementById("stageImg");
  var zoomSlider = document.getElementById("zoomSlider");
  var photoDropZone = document.getElementById("photoDropZone");
  var photoEditor = document.getElementById("photoEditor");

  function renderStage() {
    if (!photo) return;
    stageImg.src = photo.dataUrl;
    applyGeometryToImg(stageImg, photo, stage.clientWidth);
  }

  // ---------- Photo upload (in-browser only) ----------
  document.getElementById("photoInput").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUrl = ev.target.result;
      loadImage(dataUrl).then(function (img) {
        photo = {
          img: img, dataUrl: dataUrl,
          naturalW: img.naturalWidth, naturalH: img.naturalHeight,
          zoom: 1, offX: 0, offY: 0,
        };
        zoomSlider.value = 100;
        photoDropZone.style.display = "none";
        photoEditor.style.display = "block";
        renderStage();
        renderCardPreview();
      });
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("changePhotoBtn").addEventListener("click", function () {
    document.getElementById("photoInput").click();
  });

  document.getElementById("removePhotoBtn").addEventListener("click", function () {
    photo = null;
    document.getElementById("photoInput").value = "";
    photoEditor.style.display = "none";
    photoDropZone.style.display = "block";
    renderCardPreview();
  });

  // ---------- Zoom ----------
  zoomSlider.addEventListener("input", function () {
    if (!photo) return;
    photo.zoom = Number(zoomSlider.value) / 100; // 100–300 -> 1.0–3.0
    renderStage();
    scheduleRender();
  });

  // ---------- Drag to reposition (mouse + touch via Pointer Events) ----------
  (function () {
    var dragging = false;
    var startX = 0, startY = 0, startOffX = 0, startOffY = 0;

    stage.addEventListener("pointerdown", function (e) {
      if (!photo) return;
      dragging = true;
      stage.classList.add("dragging");
      stage.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      startOffX = photo.offX; startOffY = photo.offY;
    });

    stage.addEventListener("pointermove", function (e) {
      if (!dragging || !photo) return;
      var box = stage.clientWidth;
      var g = computePhotoGeometry(photo, box);
      var maxOffX = Math.max(0, (g.w - box) / 2);
      var maxOffY = Math.max(0, (g.h - box) / 2);
      var dx = e.clientX - startX, dy = e.clientY - startY;
      photo.offX = maxOffX > 0 ? clamp(startOffX + dx / maxOffX, -1, 1) : 0;
      photo.offY = maxOffY > 0 ? clamp(startOffY + dy / maxOffY, -1, 1) : 0;
      renderStage();
      scheduleRender();
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("dragging");
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
  })();

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  window.addEventListener("resize", function () { if (photo) renderStage(); });

  // ---------- Flip ----------
  document.getElementById("flipBtn").addEventListener("click", function () {
    document.getElementById("idCard").classList.toggle("flipped");
  });

  // ---------- PNG export (rasterise the renderer's SVG at 2x, same approach as the design source) ----------
  function svgToPngDataUrl(svgString) {
    return new Promise(function (resolve, reject) {
      var blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = ECAPCard.meta.width * 2;
        canvas.height = ECAPCard.meta.height * 2;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Could not rasterise card artwork.")); };
      img.src = url;
    });
  }

  function renderSidePng(side) {
    // Flush any pending rAF crop so the export always matches what's on screen.
    if (renderFrame) { cancelAnimationFrame(renderFrame); renderFrame = 0; renderCardPreview(); }
    var data = cardData();
    var options = { logoDataUrl: window.ECAP_LOGO_DATA_URL, idPrefix: "ecap-export-" + side };
    var svg = side === "front" ? ECAPCard.renderFront(data, options) : ECAPCard.renderBack(data, options);
    return svgToPngDataUrl(svg);
  }

  function downloadDataUrl(dataUrl, filename) {
    var a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ---------- Download ----------
  document.getElementById("downloadBtn").addEventListener("click", function () {
    Promise.all([renderSidePng("front"), renderSidePng("back")]).then(function (res) {
      downloadDataUrl(res[0], "ECAP-ID-" + registration.code + "-front.png");
      setTimeout(function () { downloadDataUrl(res[1], "ECAP-ID-" + registration.code + "-back.png"); }, 300);
    });
  });

  // ---------- Send to ECAP ----------
  document.getElementById("sendLink").addEventListener("click", function () {
    var status = document.getElementById("sendStatus");
    status.style.display = "block";
    status.style.color = "var(--fg-muted)";
    status.textContent = "Preparing your card…";

    Promise.all([renderSidePng("front"), renderSidePng("back")]).then(function (res) {
      var payload = {
        code: registration.code,
        fullName: registration.fullName,
        nationality: registration.nationality,
        organisation: registration.organisation,
        electives: courseTitles(registration.electives || []),
        frontImage: res[0],
        backImage: res[1],
      };
      status.textContent = "Sending to ECAP…";
      return fetch("/api/send-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (r) {
        if (!r.ok) throw new Error("send-failed");
        status.style.color = "var(--teal-dark)";
        status.textContent = "Sent! ECAP will print your card once your attendance is confirmed.";
      }).catch(function () {
        // Graceful fallback: no email service configured yet — download both
        // sides and open a mailto draft so the user can attach them manually.
        downloadDataUrl(res[0], "ECAP-ID-" + registration.code + "-front.png");
        setTimeout(function () { downloadDataUrl(res[1], "ECAP-ID-" + registration.code + "-back.png"); }, 300);
        var subject = "ECAP ID card — " + registration.fullName + " (" + registration.code + ")";
        var body = "Please find attached my ECAP ID card (front and back), just downloaded to my device.\n\nName: " +
          registration.fullName + "\nCourse code: " + registration.code;
        setTimeout(function () {
          window.location.href = "mailto:mddorrdorr.gh@gmail.com?subject=" +
            encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        }, 900);
        status.style.color = "var(--red-dark)";
        status.textContent = "Automatic sending isn't configured yet — we've downloaded your card and opened an email draft. Please attach the two downloaded images before sending.";
      });
    });
  });
})();
