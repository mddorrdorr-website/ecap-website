/* ECAP ID card builder — code lookup, live preview, canvas rendering, download + send.
   The uploaded photo is held only in a page-level JS variable (never localStorage,
   never uploaded until the user explicitly presses "Send"), so nothing is persisted. */
(function () {
  "use strict";

  var registration = null;   // the looked-up registration record
  var photoDataUrl = null;   // in-memory only — never persisted
  var logoImg = null;        // cached <img> for canvas drawing

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
    // Arrived straight from registration with a valid code — skip the extra click.
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
      "<div><strong style='color:var(--navy);'>Code:</strong> " + registration.code + "</div>" +
      "<div><strong style='color:var(--navy);'>Electives:</strong> " + electiveNames + "</div>";

    loadImage("assets/logos/ecap-logo.png").then(function (img) { logoImg = img; });
  }

  // ---------- Photo upload (in-browser only) ----------
  document.getElementById("photoInput").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      photoDataUrl = ev.target.result; // kept only in memory for this page view
      var preview = document.getElementById("photoPreview");
      preview.textContent = "";
      preview.style.background = "transparent";
      var img = document.createElement("img");
      img.src = photoDataUrl;
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

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

  function wrapText(ctx, text, cx, y, maxWidth, lineHeight) {
    var words = text.split(" ");
    var line = "";
    var lines = [];
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
      else { line = test; }
    });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { ctx.fillText(l, cx, y + i * lineHeight); });
    return lines.length;
  }

  function drawFront(ctx, W, H) {
    var navy = cssVar("--navy") || "#09346d";
    var navyDeep = cssVar("--navy-deep") || "#072a5a";
    var teal = cssVar("--teal-dark") || "#05828a";
    var fg = cssVar("--fg-muted") || "#566579";

    ctx.clearRect(0, 0, W, H);
    roundedRectPath(ctx, 0, 0, W, H, 28);
    ctx.save(); ctx.clip();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

    // top band
    var bandH = 150;
    var grad = ctx.createLinearGradient(0, 0, W, bandH);
    grad.addColorStop(0, navy); grad.addColorStop(1, navyDeep);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, bandH);

    ctx.textAlign = "center"; ctx.fillStyle = "#ffffff";
    ctx.font = "700 20px Lexend, sans-serif";
    ctx.fillText("EXECUTIVE CENTRE FOR", W / 2, 54);
    ctx.fillText("AFRICAN PROFESSIONALS", W / 2, 80);

    // photo circle
    var r = 90, cx = W / 2, cy = bandH + 4;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = "#ffffff"; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = "#ffffff"; ctx.stroke();
    ctx.clip();
    if (photoDataUrl) {
      // fallback: draw synchronously only if already loaded via cached Image (handled by caller)
    } else {
      ctx.fillStyle = "#eef6fc"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = fg; ctx.font = "13px 'Source Sans 3', sans-serif";
      ctx.fillText("No photo", cx, cy + 4);
    }
    ctx.restore();

    // name
    ctx.fillStyle = navy; ctx.font = "700 26px Lexend, sans-serif";
    ctx.fillText(registration.fullName || "Full Name", W / 2, cy + r + 46);

    // details
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

    var photoPromise = photoDataUrl ? loadImage(photoDataUrl) : Promise.resolve(null);
    return photoPromise.then(function (photoImg) {
      if (side === "front") {
        drawFront(ctx, W, H);
        if (photoImg) {
          var r = 90, cx = W / 2, cy = 150 + 4;
          ctx.save();
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
          // cover-fit the photo into the circle
          var scale = Math.max((r * 2) / photoImg.width, (r * 2) / photoImg.height);
          var w = photoImg.width * scale, h = photoImg.height * scale;
          ctx.drawImage(photoImg, cx - w / 2, cy - h / 2, w, h);
          ctx.restore();
        }
      } else {
        drawBack(ctx, W, H);
      }
      return canvas.toDataURL("image/png");
    });
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
