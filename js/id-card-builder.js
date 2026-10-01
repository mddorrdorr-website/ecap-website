/* ECAP ID card builder — code lookup, live preview, canvas rendering, download + send.
   The uploaded photo is held only in a page-level JS variable (never localStorage,
   never uploaded until the user explicitly presses "Send"), so nothing is persisted.

   Photo position/zoom model: `photo.zoom` (1 = fitted/"cover", up to 3 = zoomed in)
   and `photo.offX` / `photo.offY` (each -1..1, fraction of the max pan distance at
   the current zoom). Because these three numbers are independent of pixel size,
   the exact same crop reproduces correctly at any box size — the small on-card
   circle, the big drag-to-position stage, and the final print-resolution canvas
   all call computePhotoGeometry() with their own box size and get a matching result. */
(function () {
  "use strict";

  var registration = null;   // the looked-up registration record
  var logoImg = null;        // cached <img> for canvas drawing
  var photo = null;          // { img, dataUrl, naturalW, naturalH, zoom, offX, offY } — in-memory only

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

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

    document.getElementById("previewName").textContent = registration.fullName;
    document.getElementById("previewCode").textContent = registration.code;
    document.getElementById("previewNat").textContent = registration.nationality || "—";
    document.getElementById("previewOrg").textContent = registration.organisation || "—";

    var electiveNames = courseTitles(registration.electives || []).join(", ") || "—";
    document.getElementById("detailsSummary").innerHTML =
      "<div><strong style='color:var(--navy);'>Name:</strong> " + registration.fullName + "</div>" +
      "<div><strong style='color:var(--navy);'>Cohort:</strong> " + (registration.cohortLabel || "—") + "</div>" +
      "<div><strong style='color:var(--navy);'>Code:</strong> " + registration.code + "</div>" +
      "<div><strong style='color:var(--navy);'>Electives:</strong> " + electiveNames + "</div>";

    loadImage("assets/logos/ecap-logo.png").then(function (img) { logoImg = img; });
  }

  // ---------- Photo geometry (shared by stage, card preview, and canvas) ----------
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

  function renderCardPhoto() {
    var preview = document.getElementById("photoPreview");
    if (!photo) {
      preview.innerHTML = "No photo";
      return;
    }
    var img = preview.querySelector("img");
    if (!img) {
      preview.innerHTML = "";
      img = document.createElement("img");
      preview.appendChild(img);
    }
    img.src = photo.dataUrl;
    var box = preview.clientWidth || 92;
    applyGeometryToImg(img, photo, box);
  }

  function renderAll() { renderStage(); renderCardPhoto(); }

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
        renderAll();
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
    renderCardPhoto();
  });

  // ---------- Zoom ----------
  zoomSlider.addEventListener("input", function () {
    if (!photo) return;
    photo.zoom = Number(zoomSlider.value) / 100; // 100–300 -> 1.0–3.0
    renderAll();
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
      renderAll();
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

  // Keep both previews correctly sized if the layout reflows (e.g. orientation change)
  window.addEventListener("resize", function () { if (photo) renderAll(); });

  // ---------- Flip ----------
  document.getElementById("flipBtn").addEventListener("click", function () {
    document.getElementById("idCard").classList.toggle("flipped");
  });

  // ---------- Canvas rendering ----------
  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawFront(ctx, W, H) {
    var navy = cssVar("--navy") || "#09346d";
    var navyDeep = cssVar("--navy-deep") || "#072a5a";
    var fg = cssVar("--fg-muted") || "#566579";

    ctx.clearRect(0, 0, W, H);
    roundedRectPath(ctx, 0, 0, W, H, 28);
    ctx.save(); ctx.clip();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

    var bandH = 150;
    var grad = ctx.createLinearGradient(0, 0, W, bandH);
    grad.addColorStop(0, navy); grad.addColorStop(1, navyDeep);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, bandH);

    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    ctx.font = "700 20px Lexend, sans-serif";
    ctx.fillText("EXECUTIVE CENTRE FOR", W / 2, 54);
    ctx.fillText("AFRICAN PROFESSIONALS", W / 2, 80);

    // photo circle
    var r = 90, cx = W / 2, cy = bandH + 4, box = r * 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.clip();
    if (photo) {
      var g = computePhotoGeometry(photo, box);
      ctx.drawImage(photo.img, cx - box / 2 + g.left, cy - box / 2 + g.top, g.w, g.h);
    } else {
      ctx.fillStyle = "#eef6fc"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = fg; ctx.font = "13px 'Source Sans 3', sans-serif";
      ctx.fillText("No photo", cx, cy + 4);
    }
    ctx.restore();

    ctx.fillStyle = navy; ctx.font = "700 26px Lexend, sans-serif";
    ctx.fillText(registration.fullName || "Full Name", W / 2, cy + r + 46);

    var rows = [
      ["Course code", registration.code],
      ["Nationality", registration.nationality || "—"],
      ["Organisation", registration.organisation || "—"],
    ];
    var detY = cy + r + 90;
    ctx.textAlign = "left"; ctx.font = "15px 'Source Sans 3', sans-serif";
    rows.forEach(function (row, i) {
      var y = detY + i * 46;
      ctx.strokeStyle = "#dde7f1"; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(40, y - 22); ctx.lineTo(W - 40, y - 22); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = fg; ctx.fillText(row[0], 40, y);
      ctx.fillStyle = navy; ctx.font = "700 15px Lexend, sans-serif";
      ctx.textAlign = "right"; ctx.fillText(String(row[1]), W - 40, y);
      ctx.textAlign = "left"; ctx.font = "15px 'Source Sans 3', sans-serif";
    });

    ctx.restore(); // clip
  }

  function drawBack(ctx, W, H) {
    var navy = cssVar("--navy") || "#09346d";
    var navyDeep = cssVar("--navy-deep") || "#072a5a";

    ctx.clearRect(0, 0, W, H);
    roundedRectPath(ctx, 0, 0, W, H, 28);
    ctx.save(); ctx.clip();
    var grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, navy); grad.addColorStop(1, navyDeep);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    if (logoImg) {
      var logoW = 220, logoH = logoW * (logoImg.height / logoImg.width);
      var pad = 24;
      roundedRectPath(ctx, W / 2 - logoW / 2 - pad, H / 2 - 160 - logoH / 2 - pad, logoW + pad * 2, logoH + pad * 2, 16);
      ctx.fillStyle = "#ffffff"; ctx.fill();
      ctx.drawImage(logoImg, W / 2 - logoW / 2, H / 2 - 160 - logoH / 2, logoW, logoH);
    }

    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    ctx.font = "800 26px Lexend, sans-serif";
    ctx.fillText("Building Our Africa", W / 2, H / 2 + 20);
    ctx.fillText("Together.", W / 2, H / 2 + 56);

    ctx.restore();
  }

  function renderSide(side) {
    var canvas = document.getElementById("renderCanvas");
    var ctx = canvas.getContext("2d");
    var W = canvas.width, H = canvas.height;
    if (side === "front") drawFront(ctx, W, H); else drawBack(ctx, W, H);
    return Promise.resolve(canvas.toDataURL("image/png"));
  }

  function downloadDataUrl(dataUrl, filename) {
    var a = document.createElement("a");
    a.href = dataUrl; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ---------- Download ----------
  document.getElementById("downloadBtn").addEventListener("click", function () {
    Promise.all([renderSide("front"), renderSide("back")]).then(function (res) {
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

    Promise.all([renderSide("front"), renderSide("back")]).then(function (res) {
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
