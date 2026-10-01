/*
 * ECAP participant-card renderer — dependency-free and safe to embed.
 *
 * Load this file as a regular script, then call ECAPCard.renderFront(data,
 * { logoDataUrl }) or ECAPCard.renderBack(data, { logoDataUrl }). Each call
 * returns a self-contained SVG with unique IDs and embedded raster images.
 *
 * For exact continuous photo positioning across browser, PNG and print,
 * prepare photoDataUrl at ECAPCard.meta.photo.width / height before rendering.
 * The optional zoom and position parameters also work with a prepared image.
 * Only base64 PNG, JPEG and WebP image data URLs are accepted. Network URLs and
 * SVG image payloads are deliberately excluded from the card image boundary.
 */
(function (root) {
  "use strict";

  const WIDTH = 640;
  const HEIGHT = 1010;
  const PHOTO = Object.freeze({ x: 152, y: 258, width: 336, height: 336, radius: 168, shape: "circle" });
  const COLOURS = Object.freeze({
    teal: "#07ABB2",
    red: "#CD2721",
    paleBlue: "#9CD1EF",
    ink: "#123F46",
    secondary: "#507078",
    rule: "#DAE9EC",
    white: "#FFFFFF"
  });
  const LOGO = Object.freeze({
    sourceWidth: 1774,
    sourceHeight: 887,
    crop: Object.freeze({ x: 205, y: 238, width: 1412, height: 430 }),
    wordmarkCrop: Object.freeze({ x: 205, y: 238, width: 1412, height: 300 })
  });
  const meta = Object.freeze({
    width: WIDTH,
    height: HEIGHT,
    photo: PHOTO,
    logo: LOGO,
    colours: COLOURS,
    backReadingRotation: -90,
    fontFamily: "Arial, Helvetica, sans-serif"
  });

  let sequence = 0;
  let measuringContext;
  let measurementAttempted = false;

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function clampNumber(value, low, high, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
  }

  function safeImageDataUrl(value) {
    if (typeof value !== "string") return "";
    const normalised = value.trim().replace(/[\r\n\t ]/g, "");
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(normalised)
      ? normalised
      : "";
  }

  function uniquePrefix(options, side) {
    const supplied = cleanText(options.idPrefix || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
    sequence += 1;
    return "ecap-" + (supplied || side) + "-" + sequence;
  }

  function measureText(text, fontSize, weight) {
    // Native Arial measurements when available; conservative deterministic
    // estimates allow the same renderer to run in Node without a DOM.
    if (!measurementAttempted) {
      measurementAttempted = true;
      try {
        if (typeof document !== "undefined" && document.createElement) {
          measuringContext = document.createElement("canvas").getContext("2d");
        }
      } catch (_) { /* A server-side DOM need not implement canvas. */ }
    }
    if (measuringContext) {
      measuringContext.font = String(weight || 400) + " " + fontSize + "px Arial";
      return measuringContext.measureText(text).width;
    }
    let units = 0;
    for (const char of Array.from(text)) {
      if (/\s/.test(char)) units += 0.28;
      else if (/[ilI1.,'!:;|]/.test(char)) units += 0.29;
      else if (/[MW@]/.test(char)) units += 0.92;
      else if (/[mw]/.test(char)) units += 0.82;
      else if (/[A-Z]/.test(char)) units += 0.69;
      else if (/[0-9]/.test(char)) units += 0.57;
      else if (/[a-z]/.test(char)) units += 0.55;
      else if (/[-_/()]/.test(char)) units += 0.4;
      else if (char.codePointAt(0) > 0x2e7f) units += 1.02;
      else units += 0.67;
    }
    return units * fontSize * (weight >= 600 ? 1.025 : 1);
  }

  function wrapWords(text, width, fontSize, weight) {
    const words = text.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const joined = current ? current + " " + word : word;
      if (!current || measureText(joined, fontSize, weight) <= width) {
        current = joined;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  }

  function balancedTwoLines(text, fontSize, weight) {
    const words = text.split(" ");
    const points = [];
    if (words.length > 1) {
      for (let index = 1; index < words.length; index += 1) {
        points.push([words.slice(0, index).join(" "), words.slice(index).join(" ")]);
      }
    } else {
      const characters = Array.from(text);
      const midpoint = Math.ceil(characters.length / 2);
      points.push([characters.slice(0, midpoint).join(""), characters.slice(midpoint).join("")]);
    }
    let best = points[0] || [text];
    let smallest = Infinity;
    for (const candidate of points) {
      const left = measureText(candidate[0], fontSize, weight);
      const right = measureText(candidate[1], fontSize, weight);
      const score = Math.max(left, right) + Math.abs(left - right) * 0.1;
      if (score < smallest) {
        smallest = score;
        best = candidate;
      }
    }
    return best.filter(Boolean);
  }

  function fitText(text, settings) {
    const weight = settings.weight || 700;
    const cleaned = cleanText(text);
    let lines = [cleaned];
    let fontSize = settings.maxSize;
    for (; fontSize >= settings.minSize; fontSize -= 1) {
      lines = settings.maxLines === 1
        ? [cleaned]
        : wrapWords(cleaned, settings.width, fontSize, weight);
      if (lines.length <= settings.maxLines && lines.every(function (line) {
        return measureText(line, fontSize, weight) <= settings.width;
      })) {
        return { lines: lines, fontSize: fontSize, weight: weight, compressed: false, width: settings.width };
      }
    }
    fontSize = settings.minSize;
    lines = settings.maxLines === 1 ? [cleaned] : balancedTwoLines(cleaned, fontSize, weight);
    return {
      lines: lines,
      fontSize: fontSize,
      weight: weight,
      compressed: lines.some(function (line) { return measureText(line, fontSize, weight) > settings.width; }),
      width: settings.width
    };
  }

  function fittedText(layout, x, baseline, lineHeight, colour, extraAttributes) {
    return layout.lines.map(function (line, index) {
      const estimatedWidth = measureText(line, layout.fontSize, layout.weight);
      const length = estimatedWidth > layout.width
        ? ' textLength="' + layout.width + '" lengthAdjust="spacingAndGlyphs"'
        : "";
      return '<text x="' + x + '" y="' + (baseline + index * lineHeight) + '" font-size="' + layout.fontSize +
        '" font-weight="' + layout.weight + '" fill="' + colour + '"' + length + (extraAttributes || "") +
        '>' + escapeXml(line) + '</text>';
    }).join("");
  }

  function preparedData(input) {
    const data = input || {};
    return {
      fullName: cleanText(data.fullName) || "Your full name",
      courseCode: cleanText(data.courseCode) || "Course code",
      nationality: cleanText(data.nationality) || "Nationality",
      organisation: cleanText(data.organisation) || "Organisation",
      photoDataUrl: safeImageDataUrl(data.photoDataUrl),
      photoZoom: clampNumber(data.photoZoom, 1, 4, 1),
      photoX: clampNumber(data.photoX, 0, 100, 50),
      photoY: clampNumber(data.photoY, 0, 100, 50)
    };
  }

  function getFrontLayout(input) {
    const data = preparedData(input);
    return {
      name: fitText(data.fullName, { width: 544, maxSize: 48, minSize: 34, maxLines: 2 }),
      course: fitText(data.courseCode, { width: 544, maxSize: 29, minSize: 24, maxLines: 1 }),
      nationality: fitText(data.nationality, { width: 544, maxSize: 29, minSize: 24, maxLines: 1 }),
      organisation: fitText(data.organisation, { width: 544, maxSize: 29, minSize: 27, maxLines: 2 })
    };
  }

  function getLayoutWarnings(input, options) {
    const data = input || {};
    const opts = options || {};
    const layout = getFrontLayout(data);
    const warnings = [];
    [["name", "Full name"], ["course", "Course code"], ["nationality", "Nationality"], ["organisation", "Organisation"]]
      .forEach(function (entry) {
        if (layout[entry[0]].compressed) {
          warnings.push(entry[1] + " is unusually long and has been fitted to the available width. Review the card before downloading.");
        }
      });
    if (data.photoDataUrl && !safeImageDataUrl(data.photoDataUrl)) {
      warnings.push("The photo must be an embedded PNG, JPEG or WebP image.");
    }
    if (!safeImageDataUrl(opts.logoDataUrl)) {
      warnings.push("The authentic ECAP logo must be supplied as an embedded PNG, JPEG or WebP image.");
    }
    return warnings;
  }

  function logoImage(logoDataUrl, x, y, width, height, cropOverride) {
    if (!logoDataUrl) {
      return '<rect x="' + x + '" y="' + y + '" width="' + width + '" height="' + height +
        '" rx="8" fill="#F4F9FA" stroke="#8BB7BE" stroke-dasharray="6 5"/>' +
        '<text x="' + (x + width / 2) + '" y="' + (y + height / 2 + 8) +
        '" text-anchor="middle" font-size="22" fill="#507078">Centre logo required</text>';
    }
    const crop = cropOverride || LOGO.crop;
    return '<svg x="' + x + '" y="' + y + '" width="' + width + '" height="' + height +
      '" viewBox="' + [crop.x, crop.y, crop.width, crop.height].join(" ") +
      '" preserveAspectRatio="xMidYMid meet" overflow="hidden">' +
      '<image x="0" y="0" width="' + LOGO.sourceWidth + '" height="' + LOGO.sourceHeight +
      '" href="' + escapeXml(logoDataUrl) + '" preserveAspectRatio="xMidYMid meet"/>' +
      '</svg>';
  }

  function svgStart(prefix, title, description) {
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="640" height="1010" viewBox="0 0 640 1010" role="img" ' +
      'aria-labelledby="' + prefix + '-title ' + prefix + '-desc" font-family="Arial, Helvetica, sans-serif">' +
      '<title id="' + prefix + '-title">' + escapeXml(title) + '</title>' +
      '<desc id="' + prefix + '-desc">' + escapeXml(description) + '</desc>';
  }

  function photoImage(data, prefix) {
    if (data.photoDataUrl) {
      const width = PHOTO.width * data.photoZoom;
      const height = PHOTO.height * data.photoZoom;
      const x = PHOTO.x - (width - PHOTO.width) * data.photoX / 100;
      const y = PHOTO.y - (height - PHOTO.height) * data.photoY / 100;
      return '<g clip-path="url(#' + prefix + '-photo)">' +
        '<rect x="' + PHOTO.x + '" y="' + PHOTO.y + '" width="' + PHOTO.width + '" height="' + PHOTO.height + '" fill="#FFFFFF"/>' +
        '<image x="' + x.toFixed(3) + '" y="' + y.toFixed(3) + '" width="' + width.toFixed(3) +
        '" height="' + height.toFixed(3) + '" href="' + escapeXml(data.photoDataUrl) +
        '" preserveAspectRatio="xMidYMid slice"/></g>';
    }
    return '<g clip-path="url(#' + prefix + '-photo)">' +
      '<rect x="152" y="258" width="336" height="336" fill="#E8F3F6"/>' +
      '<circle cx="320" cy="375" r="58" fill="#A9CDD6"/>' +
      '<path d="M185 607V554C185 480 237 447 320 447S455 480 455 554V607Z" fill="#A9CDD6"/>' +
      '<rect x="210" y="510" width="220" height="36" rx="18" fill="#FFFFFF" fill-opacity="0.95"/>' +
      '<text x="320" y="534" text-anchor="middle" font-size="17" font-weight="700" ' +
      'letter-spacing="2.5" fill="#365D65">ADD YOUR PHOTO</text></g>';
  }

  function renderFront(input, suppliedOptions) {
    const data = preparedData(input);
    const options = suppliedOptions || {};
    const logoDataUrl = safeImageDataUrl(options.logoDataUrl);
    const prefix = uniquePrefix(options, "front");
    const layout = getFrontLayout(input);
    const nameBaseline = 660;
    const nameLineHeight = 50;
    const lastNameBaseline = nameBaseline + (layout.name.lines.length - 1) * nameLineHeight;
    const rowStart = lastNameBaseline + 40;
    const rows = [
      { label: "COURSE CODE", layout: layout.course },
      { label: "NATIONALITY", layout: layout.nationality },
      { label: "ORGANISATION", layout: layout.organisation }
    ];
    const rowHeights = rows.map(function (row) { return 62 + (row.layout.lines.length - 1) * 32; });
    const totalRowHeight = rowHeights.reduce(function (sum, height) { return sum + height; }, 0);
    const rowGap = Math.max(0, (966 - rowStart - totalRowHeight) / 2);
    let rowY = rowStart;
    let fieldMarkup = "";
    rows.forEach(function (row, index) {
      fieldMarkup += '<text x="48" y="' + (rowY + 18) +
        '" font-size="24" font-weight="600" letter-spacing="1.2" fill="' + COLOURS.secondary + '">' +
        row.label + '</text>';
      fieldMarkup += fittedText(row.layout, 48, rowY + 52, 32, COLOURS.ink);
      // Dense two-line layouts keep clear space around labels instead of rules.
      if (index < rows.length - 1 && rowGap >= 14) {
        const separatorY = rowY + rowHeights[index] + rowGap / 2;
        fieldMarkup += '<path d="M48 ' + separatorY + 'H592" stroke="' + COLOURS.rule + '" stroke-width="1.5"/>';
      }
      rowY += rowHeights[index] + rowGap;
    });

    return svgStart(prefix, "ECAP participant card — " + data.fullName,
      "Front of a portrait ECAP participant card. Name: " + data.fullName + ". Course code: " +
      data.courseCode + ". Nationality: " + data.nationality + ". Organisation: " + data.organisation + ".") +
      '<defs>' +
      '<clipPath id="' + prefix + '-card"><rect width="640" height="1010" rx="28"/></clipPath>' +
      '<clipPath id="' + prefix + '-photo"><circle cx="320" cy="426" r="168"/></clipPath>' +
      '</defs><g clip-path="url(#' + prefix + '-card)">' +
      '<rect width="640" height="1010" fill="#FFFFFF"/>' +
      '<rect width="640" height="10" fill="' + COLOURS.teal + '"/>' +
      '<rect x="510" width="62" height="10" fill="' + COLOURS.red + '"/>' +
      '<rect x="572" width="68" height="10" fill="' + COLOURS.paleBlue + '"/>' +
      logoImage(logoDataUrl, 70, 24, 500, 106.23, LOGO.wordmarkCrop) +
      '<text x="320" y="162" text-anchor="middle" font-size="24" font-weight="700" fill="' + COLOURS.teal + '">Executive Centre for African Professionals</text>' +
      '<text x="320" y="192" text-anchor="middle" font-size="22" font-weight="600" font-style="italic" fill="' + COLOURS.red + '">Building Our Africa Together.</text>' +
      '<text x="320" y="224" text-anchor="middle" font-size="22" font-weight="700" letter-spacing="2" fill="' + COLOURS.ink + '">PARTICIPANT CARD</text>' +
      '<path d="M112 240H528" stroke="' + COLOURS.rule + '" stroke-width="2"/>' +
      photoImage(data, prefix) +
      '<circle cx="320" cy="426" r="169" fill="none" stroke="#B8DADD" stroke-width="2"/>' +
      fittedText(layout.name, 320, nameBaseline, nameLineHeight, COLOURS.ink, ' text-anchor="middle"') +
      fieldMarkup +
      '<rect x="0" y="978" width="640" height="32" fill="' + COLOURS.teal + '"/>' +
      '<rect x="474" y="978" width="82" height="32" fill="' + COLOURS.red + '"/>' +
      '<rect x="556" y="978" width="84" height="32" fill="' + COLOURS.paleBlue + '"/>' +
      '</g></svg>';
  }

  function renderBack(input, suppliedOptions) {
    const options = suppliedOptions || {};
    const logoDataUrl = safeImageDataUrl(options.logoDataUrl);
    const prefix = uniquePrefix(options, "back");
    return svgStart(prefix, "ECAP participant card — back",
      "Portrait card with only the supplied ECAP logo on a plain white background. Rotate the card clockwise to read the logo.") +
      '<defs><clipPath id="' + prefix + '-card"><rect width="640" height="1010" rx="28"/></clipPath></defs>' +
      '<g clip-path="url(#' + prefix + '-card)">' +
      '<rect width="640" height="1010" fill="#FFFFFF"/>' +
      '<g transform="translate(0 1010) rotate(-90)">' +
      logoImage(logoDataUrl, 40, 178.4, 930, 283.2) +
      '</g></g></svg>';
  }

  const api = Object.freeze({
    version: "1.2.0",
    meta: meta,
    renderFront: renderFront,
    renderBack: renderBack,
    getLayoutWarnings: getLayoutWarnings,
    safeImageDataUrl: safeImageDataUrl
  });
  root.ECAPCard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
