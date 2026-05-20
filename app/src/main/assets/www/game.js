/* =============================================================================
 * WGRALGO Teen Health & Wellness Showdown — game engine
 * Pure Canvas 2D, no libraries, no network. Touch-first tug-of-war quiz.
 *
 * Teams:   TEAM GOLD  (player 1, left, faces right)
 *          TEAM PURPLE(player 2, right, faces left)
 * Rope:    negative actualRopeX => Gold winning; positive => Purple winning.
 * Win:     |actualRopeX| >= 110  (losing side tumbles into the water pit).
 * ===========================================================================*/

(function () {
  "use strict";

  /* ---------- Logical scene dimensions (canvas is DPR-scaled to fit) --------
     v1.0.3 compact layout: bigger question + answer boxes leave the stage
     shorter, so the scene was raised + shortened (LH 460->340, ground/rope/
     water moved up). Net effect: the teens are smaller and sit higher on
     screen, leaving more room for the larger text boxes above and below. */
  var LW = 1280, LH = 340;
  var CENTER_X = LW / 2;
  var GROUND_Y = 250;          // top of the platforms / where feet rest
  var WATER_TOP = 244;         // water surface inside the central pit
  var PIT_L = 560, PIT_R = 720;// central water pit horizontal bounds
  var ROPE_Y = 190;            // resting rope height (hand grip line)

  /* ---------- Game state --------------------------------------------------- */
  var questions = (typeof QUESTIONS !== "undefined") ? QUESTIONS.slice() : [];
  var currentQuestionIndex = 0;
  var gameActive = false;
  var p1Answered = false, p2Answered = false;
  var targetRopeX = 0, actualRopeX = 0;
  var losingTeam = 0;          // 0 none, 1 gold fell, 2 purple fell
  var screenState = "start";   // start | how | playing | winner
  var winnerShown = false;

  /* ---------- Particle systems -------------------------------------------- */
  var ripples = [], splashes = [], confetti = [];

  /* ---------- DOM ---------------------------------------------------------- */
  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas.getContext("2d");
  var qText = document.getElementById("question-text");
  var qProg = document.getElementById("question-progress");

  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.add("show"); }
  function hide(id) { $(id).classList.remove("show"); }

  /* ---------- High-DPI canvas sizing -------------------------------------- */
  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // Map logical LWxLH coordinate space onto the physical canvas (contain-fit).
    // The stage is a fixed-height row (see styles.css) so this scale is stable
    // across questions — the teens never resize with answer/question length.
    var scale = Math.min(canvas.width / LW, canvas.height / LH);
    var ox = (canvas.width - LW * scale) / 2;
    var oy = (canvas.height - LH * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }
  window.addEventListener("resize", resizeCanvas);

  /* ---------- Scale-to-fit design surface ---------------------------------
     The game uses a fixed 1280x900 design canvas (.game-fit in styles.css).
     Here we apply a uniform CSS scale so it fills any tablet without changing
     internal proportions. Characters, boxes and fonts stay pixel-identical
     relative to each other on every screen — only the global scale changes. */
  var DESIGN_W = 1280, DESIGN_H = 900;
  function fitGameScreen() {
    var fit = document.getElementById("game-fit");
    if (!fit) return;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / DESIGN_W, vh / DESIGN_H);
    var w = DESIGN_W * s, h = DESIGN_H * s;
    var tx = Math.round((vw - w) / 2);
    var ty = Math.round((vh - h) / 2);
    fit.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fitGameScreen);
  window.addEventListener("orientationchange", fitGameScreen);

  /* ---------- Question handling ------------------------------------------- */
  function shuffleQuiz() {
    for (var i = questions.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = questions[i]; questions[i] = questions[j]; questions[j] = t;
    }
    questions.forEach(function (q) {
      var correctText = q.options[q.correctIndex];
      for (var i = q.options.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var s = q.options[i]; q.options[i] = q.options[j]; q.options[j] = s;
      }
      q.correctIndex = q.options.indexOf(correctText);
    });
  }

  function teamButtons(team) {
    return Array.prototype.slice.call(
      document.querySelectorAll('.ans-btn[data-team="' + team + '"]'));
  }
  function allButtons() {
    return Array.prototype.slice.call(document.querySelectorAll(".ans-btn"));
  }

  /* Shrink text within a fixed-size element until it fits without clipping.
     Box stays the same size on every question; only the font shrinks if a
     particular question/answer is unusually long. Min floor keeps it legible. */
  function autoFitText(el, baseSize, minSize) {
    el.style.fontSize = baseSize + "px";
    var size = baseSize;
    // scrollHeight > clientHeight means the text is overflowing vertically.
    while (size > minSize && el.scrollHeight > el.clientHeight) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }

  function loadQuestion() {
    if (currentQuestionIndex >= questions.length) {
      currentQuestionIndex = 0;
      shuffleQuiz();
    }
    var q = questions[currentQuestionIndex];
    qText.textContent = q.question;
    qProg.textContent = "QUESTION " + (currentQuestionIndex + 1);
    allButtons().forEach(function (btn) {
      var c = parseInt(btn.getAttribute("data-choice"), 10);
      btn.textContent = q.options[c];                 // answer text only — no key hints
      btn.classList.remove("correct", "wrong", "locked");
    });
    p1Answered = false;
    p2Answered = false;
    // Fit text to the fixed boxes (boxes never resize; only font may shrink
    // on edge-case long questions/answers). Defer so layout settles first.
    requestAnimationFrame(function () {
      autoFitText(qText, 28, 18);
      allButtons().forEach(function (btn) { autoFitText(btn, 18, 13); });
    });
  }

  function flashButton(btn, cls) {
    btn.classList.remove("correct", "wrong");
    void btn.offsetWidth;                              // restart CSS animation
    btn.classList.add(cls);
  }

  function lockTeam(team) {
    teamButtons(team).forEach(function (b) { b.classList.add("locked"); });
  }

  function checkAnswer(choiceIndex, team, sourceBtn) {
    if (!gameActive || screenState !== "playing") return;
    if (team === 1 && p1Answered) return;
    if (team === 2 && p2Answered) return;

    var q = questions[currentQuestionIndex];
    var btn = sourceBtn ||
      document.querySelector('.ans-btn[data-team="' + team + '"][data-choice="' + choiceIndex + '"]');

    if (choiceIndex === q.correctIndex) {
      if (btn) flashButton(btn, "correct");
      targetRopeX += (team === 1) ? -16 : 16;          // pull toward this team
      pulseRope(team);
      currentQuestionIndex++;
      setTimeout(loadQuestion, 230);
    } else {
      if (btn) flashButton(btn, "wrong");
      if (team === 1) { targetRopeX += 5; p1Answered = true; lockTeam(1); }
      else            { targetRopeX -= 5; p2Answered = true; lockTeam(2); }
      if (p1Answered && p2Answered) {
        setTimeout(function () {
          if (gameActive) { currentQuestionIndex++; loadQuestion(); }
        }, 1000);
      }
    }
    if (targetRopeX < -115) targetRopeX = -115;
    if (targetRopeX > 115) targetRopeX = 115;
  }

  /* Rope reaction pulse when a team answers correctly. */
  var ropePulse = 0, ropePulseDir = 0;
  function pulseRope(team) { ropePulse = 1; ropePulseDir = (team === 1) ? -1 : 1; }

  /* ---------- Drawing helpers --------------------------------------------- */
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* Tapered, rounded limb segment (filled capsule) with outline + highlight. */
  function limb(x1, y1, x2, y2, w1, w2, fill, edge) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
    ctx.lineTo(x2 - nx * w2, y2 - ny * w2);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 2.4; ctx.strokeStyle = edge; ctx.stroke();
    ctx.beginPath(); ctx.arc(x2, y2, w2, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill(); ctx.stroke();
  }

  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  /* ---------- Teen characters --------------------------------------------- */
  // Per-team rosters: distinct skin tones, hair colour & style, builds.
  var goldTeam = [
    { off: -115, skin: "#F1C9A5", hair: "#3A2A1A", style: "short",   build: 1.00 },
    { off: -250, skin: "#8D5A33", hair: "#1A1A1A", style: "bun",     build: 1.06 },
    { off: -385, skin: "#C68642", hair: "#7A3B17", style: "curly",   build: 0.95 }
  ];
  var purpleTeam = [
    { off: 115, skin: "#5C3A21", hair: "#101010", style: "ponytail", build: 1.02 },
    { off: 250, skin: "#FAD7B4", hair: "#E8B84B", style: "fade",     build: 0.96 },
    { off: 385, skin: "#A56A40", hair: "#2A1B12", style: "short",    build: 1.05 }
  ];

  /* Shaded tapered limb: solid fill + outline, then a lit highlight streak
     along the upper edge so arms/legs read as rounded muscle, not flat tubes. */
  function shLimb(x1, y1, x2, y2, w1, w2, fill, edge) {
    limb(x1, y1, x2, y2, w1, w2, fill, edge);
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;                 // unit normal
    ctx.beginPath();
    ctx.moveTo(x1 + nx * (w1 * 0.45), y1 + ny * (w1 * 0.45));
    ctx.lineTo(x2 + nx * (w2 * 0.45), y2 + ny * (w2 * 0.45));
    ctx.lineWidth = Math.max(1.4, w2 * 0.6);
    ctx.lineCap = "round";
    ctx.strokeStyle = shade(fill, 26);
    ctx.stroke();
  }

  function drawHair(hx, hy, r, dir, style, color) {
    var lit = shade(color, 30), dark = shade(color, -34);
    ctx.fillStyle = color;
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.6;
    var back = hx - dir * (r - 2);
    // back mass first (behind head) for ponytail / bun / curly volume
    if (style === "ponytail") {
      ctx.beginPath();
      ctx.moveTo(back, hy - r + 1);
      ctx.quadraticCurveTo(back - dir * 24, hy + 6, back - dir * 10, hy + 34);
      ctx.quadraticCurveTo(back - dir * 1, hy + 8, back + dir * 2, hy - r + 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color;
    } else if (style === "bun") {
      ctx.beginPath(); ctx.arc(back - dir * 1, hy - r - 3, 10, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // scalp cap — full rounded crown that hugs the skull
    ctx.fillStyle = color; ctx.strokeStyle = dark; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(hx, hy - 1, r + 2.5, Math.PI * 0.86, Math.PI * 2.14);
    ctx.quadraticCurveTo(hx + dir * (r + 3), hy + 2, hx + dir * (r - 2), hy + 5);
    ctx.lineTo(hx - dir * (r - 1), hy + 4);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // crown sheen
    ctx.fillStyle = lit;
    ctx.beginPath();
    ctx.ellipse(hx - dir * 3, hy - r + 1, r * 0.5, r * 0.32, dir * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    if (style === "curly") {
      for (var i = -2; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(hx - dir * (i * 5) + dir * 5,
                hy - r - 1 + (i % 2) * 4, 7, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
    } else if (style === "fade") {
      // tight taper at the temple
      ctx.beginPath();
      ctx.ellipse(hx + dir * 2, hy - 3, r + 1, r - 2, 0, Math.PI, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = dark; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hx + dir * (r - 1), hy + 2);
      ctx.lineTo(hx + dir * (r - 1), hy - 4); ctx.stroke();
    } else if (style === "short") {
      ctx.beginPath();
      ctx.moveTo(hx + dir * r, hy - 1);
      ctx.quadraticCurveTo(hx + dir * (r + 4), hy - r, hx - dir * 2, hy - r - 3);
      ctx.quadraticCurveTo(back - dir * 4, hy - r + 1, back - dir * 2, hy + 3);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // front fringe sweep for non-fade styles
    if (style !== "fade") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(hx + dir * (r - 1), hy - 6);
      ctx.quadraticCurveTo(hx + dir * (r + 2), hy - r * 0.5,
                           hx + dir * 4, hy - r + 2);
      ctx.quadraticCurveTo(hx + dir * 2, hy - 3, hx + dir * (r - 1), hy - 6);
      ctx.fill();
    }
  }

  /* Draw one teen. cfg = roster entry; gx,gy = rope grip point in scene coords.
     strain 0..1 (how hard this side is straining). fall = null or
     {x,y,rot} ragdoll override when tumbling into the water. */
  /* Anatomical head: skull + tapered jaw, ear, brow, eye, nose, set mouth. */
  function drawHead(hx, hy, r, dir, cfg, strain) {
    var skinEdge = shade(cfg.skin, -45);
    var skinLit  = shade(cfg.skin, 22);
    // skull + jaw silhouette (oval narrowing to a chin)
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - dir * r, hy - r * 0.2);
    ctx.quadraticCurveTo(hx - dir * r, hy - r * 1.05, hx, hy - r * 1.05);
    ctx.quadraticCurveTo(hx + dir * r, hy - r * 1.05, hx + dir * r, hy - r * 0.1);
    ctx.quadraticCurveTo(hx + dir * r * 0.94, hy + r * 0.78, hx + dir * r * 0.34, hy + r * 1.06);
    ctx.quadraticCurveTo(hx, hy + r * 1.18, hx - dir * r * 0.5, hy + r * 0.9);
    ctx.quadraticCurveTo(hx - dir * r, hy + r * 0.5, hx - dir * r, hy - r * 0.2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // cheek light
    ctx.fillStyle = skinLit;
    ctx.beginPath();
    ctx.ellipse(hx + dir * r * 0.3, hy + r * 0.18, r * 0.42, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // ear (back side)
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(hx - dir * r * 0.92, hy + 1, 4.2, 6, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = skinEdge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(hx - dir * r * 0.92, hy + 1, 2.4, -1, 2.4); ctx.stroke();
    // jaw shadow line
    ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx - dir * r * 0.6, hy + r * 0.55);
    ctx.quadraticCurveTo(hx, hy + r * 1.0, hx + dir * r * 0.5, hy + r * 0.7);
    ctx.stroke();
    // eyebrow — drawn down, determined; harder when straining
    var bw = 0.08 + strain * 0.10;
    ctx.strokeStyle = shade(cfg.hair, -10); ctx.lineWidth = 2.6; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx + dir * r * 0.18, hy - r * 0.34 - bw * 12);
    ctx.lineTo(hx + dir * r * 0.78, hy - r * 0.16 + bw * 6);
    ctx.stroke();
    // eye socket + eye + iris
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(hx + dir * r * 0.46, hy - r * 0.05, 3.4, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1d12";
    ctx.beginPath();
    ctx.arc(hx + dir * r * 0.58, hy - r * 0.04, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(hx + dir * r * 0.5, hy - r * 0.12, 0.7, 0, Math.PI * 2); ctx.fill();
    // lower lid line
    ctx.strokeStyle = skinEdge; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + dir * r * 0.24, hy + r * 0.04);
    ctx.lineTo(hx + dir * r * 0.66, hy + r * 0.06); ctx.stroke();
    // nose
    ctx.strokeStyle = skinEdge; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(hx + dir * r * 0.78, hy + r * 0.04);
    ctx.quadraticCurveTo(hx + dir * r * 0.96, hy + r * 0.3, hx + dir * r * 0.7, hy + r * 0.36);
    ctx.stroke();
    // mouth — set with effort
    ctx.strokeStyle = "#7a2f2f"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hx + dir * r * 0.3, hy + r * 0.62);
    ctx.quadraticCurveTo(hx + dir * r * 0.56, hy + r * (0.62 + strain * 0.12),
                         hx + dir * r * 0.78, hy + r * 0.54);
    ctx.stroke();
    drawHair(hx, hy, r, dir, cfg.style, cfg.hair);
  }

  function drawSneaker(x, y, dir, scale, jersey) {
    ctx.save();
    ctx.translate(x, y);
    // sole
    ctx.fillStyle = "#f4f4f4"; ctx.strokeStyle = "#b9b9c4"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-15 * scale, 6);
    ctx.quadraticCurveTo(dir * 22 * scale, 9, dir * 21 * scale, 1);
    ctx.lineTo(-14 * scale, 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // upper
    ctx.fillStyle = jersey.bright; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14 * scale, 1);
    ctx.quadraticCurveTo(-15 * scale, -10 * scale, -4 * scale, -11 * scale);
    ctx.quadraticCurveTo(dir * 10 * scale, -10 * scale, dir * 20 * scale, 0);
    ctx.lineTo(-14 * scale, 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // laces
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.4;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(dir * (1 + i * 5) * scale, -9 * scale + i);
      ctx.lineTo(dir * (5 + i * 5) * scale, -3 * scale + i);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* Draw one teen. cfg = roster entry; gx,gy = rope grip point in scene coords.
     strain 0..1 (how hard this side is straining). fall = null or
     {x,y,rot} ragdoll override when tumbling into the water. */
  function drawTeen(cfg, baseX, dir, jersey, gx, gy, strain, time, fall, sweatLvl) {
    var skinEdge = shade(cfg.skin, -45);
    var build = cfg.build;
    var shorts = "#222845", shortsEdge = "#12162a";
    var jnum = (Math.round(Math.abs(cfg.off) / 17) % 9) + 1;

    if (fall) {
      // ---- Tumbling ragdoll (matches the standing build) ----
      ctx.save();
      ctx.translate(fall.x, fall.y);
      ctx.rotate(fall.rot);
      // torso
      var fg = ctx.createLinearGradient(0, -26, 0, 26);
      fg.addColorStop(0, jersey.bright); fg.addColorStop(1, jersey.mid);
      ctx.fillStyle = fg; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-20 * build, -22);
      ctx.quadraticCurveTo(0, -30, 20 * build, -22);
      ctx.quadraticCurveTo(15 * build, 4, 13 * build, 24);
      ctx.quadraticCurveTo(0, 30, -13 * build, 24);
      ctx.quadraticCurveTo(-15 * build, 4, -20 * build, -22);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // flailing limbs
      shLimb(-6, -14, -28, -22, 7, 4.5, cfg.skin, skinEdge);
      shLimb(6, -14, 26, -26, 7, 4.5, cfg.skin, skinEdge);
      shLimb(-7, 20, -20, 30, 9, 6, shorts, shortsEdge);
      shLimb(-20, 30, -26, 44, 6, 4.5, cfg.skin, skinEdge);
      shLimb(7, 20, 22, 30, 9, 6, shorts, shortsEdge);
      shLimb(22, 30, 30, 44, 6, 4.5, cfg.skin, skinEdge);
      drawSneaker(-27, 46, -1, 0.85, jersey);
      drawSneaker(31, 46, 1, 0.85, jersey);
      // hands
      ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(-29, -23, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(27, -27, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // neck + head
      ctx.strokeStyle = cfg.skin; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(2, -34); ctx.stroke();
      drawHead(2, -40, 14, 1, cfg, 1);
      ctx.restore();
      return;
    }

    // ---- Braced pulling stance ----
    var lean = 0.14 + strain * 0.20;                 // radians, leans away from rope
    var hipX = baseX - dir * (16 + strain * 18);
    var hipY = GROUND_Y - 92;
    var shX  = hipX - dir * (26 + strain * 26 + Math.sin(lean) * 8);
    var shY  = hipY - 60 * build;

    // Foot / ground contact shadow
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.beginPath();
    ctx.ellipse(baseX - dir * 4, GROUND_Y + 6, 48, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Leg geometry (back = drive leg, front = brace) — behind the torso
    var frontFootX = baseX + dir * (38 + strain * 10);
    var backFootX  = baseX - dir * (52 + strain * 16);
    var frontKneeX = (hipX + frontFootX) / 2 + dir * 12;
    var backKneeX  = (hipX + backFootX) / 2 - dir * 4;
    // back leg: thigh (shorts) -> shin (skin)
    shLimb(hipX - dir * 4, hipY + 4, backKneeX, GROUND_Y - 42,
           13 * build, 8, shade(shorts, -8), shortsEdge);
    shLimb(backKneeX, GROUND_Y - 42, backFootX, GROUND_Y - 6,
           8, 5.5, shade(cfg.skin, -12), skinEdge);
    drawSneaker(backFootX, GROUND_Y, -dir, 0.86, jersey);
    // front leg
    shLimb(hipX + dir * 6, hipY + 4, frontKneeX, GROUND_Y - 46,
           14 * build, 9, shorts, shortsEdge);
    shLimb(frontKneeX, GROUND_Y - 46, frontFootX, GROUND_Y - 4,
           9, 6, cfg.skin, skinEdge);
    drawSneaker(frontFootX, GROUND_Y, dir, 1, jersey);

    // Pelvis / shorts block bridging hips to thighs
    ctx.fillStyle = shorts; ctx.strokeStyle = shortsEdge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hipX - 17 * build, hipY - 6);
    ctx.lineTo(hipX + 17 * build, hipY - 6);
    ctx.quadraticCurveTo(hipX + 20 * build, hipY + 18, hipX + 8, hipY + 26);
    ctx.lineTo(hipX - 8, hipY + 26);
    ctx.quadraticCurveTo(hipX - 20 * build, hipY + 18, hipX - 17 * build, hipY - 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    // Back arm (far side) — drawn behind torso
    var backShX = shX + dir * 3;
    var bElbowX = (backShX + gx) / 2 - dir * 4, bElbowY = (shY + gy) / 2 + 6;
    shLimb(backShX, shY + 4, bElbowX, bElbowY, 8.5, 6.5,
           shade(cfg.skin, -24), skinEdge);
    shLimb(bElbowX, bElbowY, gx - dir * 7, gy, 6.5, 5,
           shade(cfg.skin, -24), skinEdge);

    // Torso / jersey — broad shoulders tapering to waist
    var grad = ctx.createLinearGradient(shX - 20, shY, hipX + 20, hipY);
    grad.addColorStop(0, jersey.bright);
    grad.addColorStop(0.55, jersey.mid);
    grad.addColorStop(1, shade(jersey.mid, -22));
    ctx.fillStyle = grad; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2.6;
    var tw = 23 * build;                              // shoulder half-width
    var ww = 16 * build;                              // waist half-width
    ctx.beginPath();
    ctx.moveTo(shX - tw, shY + 2);
    ctx.quadraticCurveTo(shX, shY - 9, shX + tw, shY + 2);
    ctx.quadraticCurveTo(hipX + ww + 5, (shY + hipY) / 2, hipX + ww, hipY + 6);
    ctx.quadraticCurveTo(hipX, hipY + 12, hipX - ww, hipY + 6);
    ctx.quadraticCurveTo(shX - tw - 5, (shY + hipY) / 2, shX - tw, shY + 2);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // sleeve caps over the deltoids
    ctx.fillStyle = shade(jersey.mid, -14);
    [dir, -dir].forEach(function (s) {
      ctx.beginPath();
      ctx.ellipse(shX + s * tw * 0.92, shY + 6, 9 * build, 12 * build,
                  s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
    // neckline
    ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shX - dir * 9, shY - 3);
    ctx.quadraticCurveTo(shX - dir * 2, shY + 7, shX + dir * 9, shY - 3);
    ctx.stroke();
    // centre seam + jersey number
    ctx.strokeStyle = "rgba(0,0,0,0.14)"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shX - dir * 2, shY + 6);
    ctx.quadraticCurveTo((shX + hipX) / 2, (shY + hipY) / 2, hipX, hipY);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "800 18px Segoe UI, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(jnum),
                 (shX + hipX) / 2 - dir * 2, (shY + hipY) / 2 + 2);
    // side seam stripe
    ctx.strokeStyle = jersey.bright; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shX + dir * tw * 0.6, shY + 6);
    ctx.lineTo(hipX + dir * ww, hipY + 2);
    ctx.stroke();

    // Neck + head
    var headX = shX - dir * 3, headY = shY - 26;
    var grd = ctx.createLinearGradient(shX, shY - 14, shX, shY + 2);
    grd.addColorStop(0, cfg.skin); grd.addColorStop(1, shade(cfg.skin, -26));
    ctx.strokeStyle = cfg.skin; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(shX, shY - 2); ctx.lineTo(headX, headY + 14); ctx.stroke();
    ctx.fillStyle = grd;
    ctx.fillRect(headX - 6, headY + 8, 12, 10);       // sterno shading under chin
    drawHead(headX, headY, 15, dir, cfg, strain);
    // sweat bead — only the losing side (being dragged) sweats
    if (sweatLvl > 0.62) {
      ctx.fillStyle = "rgba(150,210,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(headX + dir * 16, headY - 2 + (time * 60 % 16),
                  2.4, 3.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Front arm (over torso) — deltoid -> bicep -> forearm -> gripping hand
    var frShX = shX + dir * 7;
    var fElbowX = (frShX + gx) / 2 + dir * 7, fElbowY = (shY + gy) / 2 + 2;
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(frShX, shY + 5, 8 * build, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    shLimb(frShX, shY + 5, fElbowX, fElbowY, 9.5, 6.5, cfg.skin, skinEdge);
    shLimb(fElbowX, fElbowY, gx, gy, 6.5, 5, cfg.skin, skinEdge);
    // gripping hand: palm + thumb wrapping the rope
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(gx, gy, 7, 5.5, dir * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(gx - dir * 4, gy + 4, 3, 0, Math.PI * 2);  // thumb
    ctx.fill(); ctx.stroke();
  }

  /* ---------- Scene background -------------------------------------------- */
  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, LH);
    sky.addColorStop(0, "#0A0A0A");
    sky.addColorStop(0.5, "#070707");
    sky.addColorStop(1, "#000000");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, LW, LH);

    // arena spotlights — faint WGRALGO glow on black
    [[CENTER_X, "rgba(34,211,238,0.08)"],
     [240, "rgba(245,166,35,0.07)"],
     [LW - 240, "rgba(123,47,247,0.08)"]].forEach(function (s) {
      var g = ctx.createRadialGradient(s[0], 30, 10, s[0], 30, 420);
      g.addColorStop(0, s[1]); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    });

    // (v1.0.3) crowd polka-dot band removed — unused visual noise. The
    // arena banner + tension meter below are kept as the only HUD elements.

    // banner
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    roundRect(CENTER_X - 300, 18, 600, 40, 12); ctx.fill();
    ctx.fillStyle = "#e8ecff";
    ctx.font = "700 22px Segoe UI, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("WGRALGO  TEEN  HEALTH  &  WELLNESS  SHOWDOWN", CENTER_X, 39);

    // Platforms (gold left, purple right) with edge lip toward the pit
    platform(0, PIT_L, "#3a2f12", "#5a4a1d", "#FFC93C");
    platform(PIT_R, LW, "#241640", "#3a2360", "#A66BFF");
  }

  function platform(x1, x2, top, body, lip) {
    ctx.fillStyle = body; ctx.fillRect(x1, GROUND_Y, x2 - x1, LH - GROUND_Y);
    ctx.fillStyle = top;  ctx.fillRect(x1, GROUND_Y, x2 - x1, 10);
    var edge = (x1 === 0) ? x2 : x1;             // the side facing the pit
    var inward = (x1 === 0) ? -1 : 1;
    ctx.fillStyle = lip;
    ctx.fillRect(edge + (inward < 0 ? -6 : 0), GROUND_Y, 6, LH - GROUND_Y);
  }

  function drawWater(time) {
    ctx.save();
    ctx.beginPath(); ctx.rect(PIT_L, WATER_TOP, PIT_R - PIT_L, LH - WATER_TOP);
    ctx.clip();
    var wg = ctx.createLinearGradient(0, WATER_TOP, 0, LH);
    wg.addColorStop(0, "#3FC6E8");
    wg.addColorStop(0.5, "#1E8FC0");
    wg.addColorStop(1, "#0A4E78");
    ctx.fillStyle = wg; ctx.fillRect(PIT_L, WATER_TOP, PIT_R - PIT_L, LH);

    // moving caustic highlight lines
    ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 2;
    for (var k = 0; k < 4; k++) {
      ctx.beginPath();
      for (var x = PIT_L; x <= PIT_R; x += 8) {
        var y = WATER_TOP + 20 + k * 22 +
                Math.sin((x * 0.05) + time * 2 + k) * 4;
        if (x === PIT_L) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // animated foam surface line
    ctx.beginPath();
    for (var x2 = PIT_L; x2 <= PIT_R; x2 += 6) {
      var ys = WATER_TOP + Math.sin((x2 * 0.06) + time * 3) * 3;
      if (x2 === PIT_L) ctx.moveTo(x2, ys); else ctx.lineTo(x2, ys);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.stroke();

    // ripple rings
    for (var i = ripples.length - 1; i >= 0; i--) {
      var r = ripples[i];
      r.r += 1.4; r.alpha -= 0.012;
      if (r.alpha <= 0) { ripples.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r, r.r * 0.34, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255," + r.alpha + ")";
      ctx.lineWidth = 2; ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- Rope --------------------------------------------------------- */
  function drawRope(knotX) {
    var sag = 14;
    function ropePath(x1, x2, y) {
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.quadraticCurveTo((x1 + knotX) / 2, y + sag, knotX, ROPE_Y);
      ctx.quadraticCurveTo((x2 + knotX) / 2, y + sag, x2, y);
    }
    // rope shadow
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 11; ctx.lineCap = "round";
    ropePath(40, LW - 40, ROPE_Y + 6); ctx.stroke();
    // rope body
    ctx.strokeStyle = "#B07A33"; ctx.lineWidth = 9;
    ropePath(40, LW - 40, ROPE_Y); ctx.stroke();
    // twist texture
    ctx.strokeStyle = "rgba(90,55,18,0.65)"; ctx.lineWidth = 2.4;
    for (var x = 60; x < LW - 60; x += 16) {
      var t = (x - 60) / (LW - 120);
      var y = ROPE_Y + Math.sin(t * Math.PI) * sag;
      ctx.beginPath();
      ctx.moveTo(x, y - 6); ctx.quadraticCurveTo(x + 8, y, x, y + 6); ctx.stroke();
    }
    // centre knot + flag
    ctx.fillStyle = "#8B5A2B"; ctx.strokeStyle = "#5A3712"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(knotX, ROPE_Y, 13, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = (Math.abs(actualRopeX) < 0.5)
      ? "#E11D48"
      : (actualRopeX < 0 ? "#F5A623" : "#7B2FF7");
    ctx.beginPath();
    ctx.moveTo(knotX, ROPE_Y - 13);
    ctx.lineTo(knotX, ROPE_Y - 52);
    ctx.lineTo(knotX + 30, ROPE_Y - 44);
    ctx.lineTo(knotX, ROPE_Y - 36);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#3a2360"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(knotX, ROPE_Y - 13);
    ctx.lineTo(knotX, ROPE_Y - 52); ctx.stroke();

    // tension meter
    var pct = actualRopeX / 110;                       // -1..1
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(CENTER_X - 180, 64, 360, 12, 6); ctx.fill();
    var mx = CENTER_X + pct * 178;
    var mg = ctx.createLinearGradient(CENTER_X - 180, 0, CENTER_X + 180, 0);
    mg.addColorStop(0, "#F5A623"); mg.addColorStop(0.5, "#22D3EE");
    mg.addColorStop(1, "#7B2FF7");
    ctx.fillStyle = mg;
    if (pct < 0) roundRect(mx, 64, CENTER_X - mx, 12, 6);
    else roundRect(CENTER_X, 64, mx - CENTER_X, 12, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(mx, 70, 7, 0, Math.PI * 2); ctx.fill();
  }

  /* ---------- Fall sequence ----------------------------------------------- */
  var fallTeens = [];     // active ragdolls
  var fallTimer = 0;

  function startFall(team) {
    losingTeam = team;
    var roster = (team === 1) ? goldTeam : purpleTeam;
    var knotX = CENTER_X + actualRopeX;
    var pitC = (PIT_L + PIT_R) / 2;
    var faceDir = (team === 1) ? 1 : -1;
    var AIR = 26;                       // ~frames airborne before hitting water
    roster.forEach(function (cfg, idx) {
      var sx = knotX + cfg.off;
      var slot = pitC + (idx - 1) * 50; // spaced apart, never overlapping
      slot = Math.max(PIT_L + 30, Math.min(PIT_R - 30, slot));
      var tx = slot;
      var toward = (tx >= sx) ? 1 : -1;
      fallTeens.push({
        cfg: cfg,
        x: sx, y: GROUND_Y - 50,
        vx: (tx - sx) / AIR,            // aimed so they arc into the pit
        vy: -3 - idx * 0.5,
        rot: 0, vrot: toward * (0.16 + idx * 0.05),
        slot: slot, faceDir: faceDir, phase: idx * 1.6,
        stage: "air", splashed: false,
        jersey: (team === 1) ? jerseyGold : jerseyPurple
      });
    });
    fallTimer = 0;
  }

  function updateFall() {
    fallTimer++;
    fallTeens.forEach(function (f) {
      if (f.stage !== "air") {
        // Recovered: wade to an upright huddle slot inside the pit. No
        // physics/rotation -> never touches the pit walls, never jitters.
        f.x += (f.slot - f.x) * 0.18;
        if (Math.abs(f.slot - f.x) < 0.6) { f.x = f.slot; f.stage = "stand"; }
        return;
      }
      f.vy += 0.42;                 // gravity (v1 airborne arc)
      f.x += f.vx; f.y += f.vy; f.rot += f.vrot;
      if (!f.splashed && f.y >= WATER_TOP - 6 &&
          f.x > PIT_L && f.x < PIT_R) {
        f.splashed = true;
        spawnSplash(f.x, WATER_TOP);
        ripples.push({ x: f.x, y: WATER_TOP + 4, r: 6, alpha: 0.8 });
        ripples.push({ x: f.x, y: WATER_TOP + 4, r: 16, alpha: 0.5 });
      }
      if (f.y > WATER_TOP + 24) {   // touchdown -> stand up out of the sprawl
        f.stage = "recover";
        if (!f.splashed) {
          f.splashed = true;
          spawnSplash(f.x, WATER_TOP);
          ripples.push({ x: f.x, y: WATER_TOP + 4, r: 6, alpha: 0.8 });
          ripples.push({ x: f.x, y: WATER_TOP + 4, r: 16, alpha: 0.5 });
        }
      }
    });
    if (fallTimer > 120 && !winnerShown) showWinner();
  }

  function spawnSplash(x, y) {
    for (var i = 0; i < 22; i++) {
      var a = (-Math.PI / 2) + (Math.random() - 0.5) * 1.9;
      var sp = 3 + Math.random() * 6;
      splashes.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
        life: 1, r: 2 + Math.random() * 4
      });
    }
  }

  function updateSplashes() {
    for (var i = splashes.length - 1; i >= 0; i--) {
      var s = splashes[i];
      s.vy += 0.35; s.x += s.vx; s.y += s.vy; s.life -= 0.022;
      if (s.life <= 0) { splashes.splice(i, 1); continue; }
      ctx.fillStyle = "rgba(190,235,255," + s.life + ")";
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ---------- Confetti (winner) ------------------------------------------- */
  function spawnConfetti(color) {
    for (var i = 0; i < 90; i++) {
      confetti.push({
        x: Math.random() * LW, y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
        rot: Math.random() * 6, vrot: (Math.random() - 0.5) * 0.3,
        size: 6 + Math.random() * 7,
        color: i % 3 === 0 ? "#F5A623" : i % 3 === 1 ? "#7B2FF7" : "#22D3EE"
      });
    }
  }
  function updateConfetti() {
    for (var i = confetti.length - 1; i >= 0; i--) {
      var c = confetti[i];
      c.x += c.vx; c.y += c.vy; c.rot += c.vrot;
      if (c.y > LH + 30) { confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    }
  }

  /* ---------- Jersey palettes --------------------------------------------- */
  var jerseyGold   = { bright: "#FFD55A", mid: "#F5A623", edge: "#9C5E00" };
  var jerseyPurple = { bright: "#B98CFF", mid: "#7B2FF7", edge: "#3A1480" };

  /* ---------- Main loop ---------------------------------------------------- */
  function frame() {
    var time = Date.now() / 1000;
    actualRopeX += (targetRopeX - actualRopeX) * 0.15;
    if (ropePulse > 0) ropePulse -= 0.06;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    resizeForFrame();

    drawBackground();

    var knotX = CENTER_X + actualRopeX + (ropePulse > 0 ? ropePulseDir * ropePulse * 10 : 0);

    drawRope(knotX);

    // strain: the side that is currently winning strains harder
    var goldStrain   = Math.max(0.15, Math.min(1, (-actualRopeX) / 110 + 0.45));
    var purpleStrain = Math.max(0.15, Math.min(1, (actualRopeX) / 110 + 0.45));
    // sweat: only the side being dragged (behind) sweats
    var goldSweat   = actualRopeX > 0 ? Math.min(1, actualRopeX / 110 + 0.45) : 0;
    var purpleSweat = actualRopeX < 0 ? Math.min(1, -actualRopeX / 110 + 0.45) : 0;

    // standing teens (skip the team that is tumbling)
    if (losingTeam !== 1) {
      goldTeam.forEach(function (cfg, i) {
        var bx = knotX + cfg.off;
        var gx = bx + 30 + (cfg.off + 115) * -0.15;
        var bob = Math.sin(time * 4 - i) * 3;
        drawTeen(cfg, bx, 1, jerseyGold, gx, ROPE_Y + 4 + bob,
                 goldStrain, time, null, goldSweat);
      });
    }
    if (losingTeam !== 2) {
      purpleTeam.forEach(function (cfg, i) {
        var bx = knotX + cfg.off;
        var gx = bx - 30 + (cfg.off - 115) * -0.15;
        var bob = Math.sin(time * 4 - i) * 3;
        drawTeen(cfg, bx, -1, jerseyPurple, gx, ROPE_Y + 4 + bob,
                 purpleStrain, time, null, purpleSweat);
      });
    }

    if (losingTeam) updateFall();

    // Recovered losers stand SMALL and spaced inside the pit, drawn *before*
    // the water so it submerges them to the chest (in the water, not on top,
    // not piled on each other).
    if (losingTeam) {
      fallTeens.forEach(function (f) {
        if (f.stage === "air") return;
        var S = 0.5;                                  // half-size teens
        var footY = WATER_TOP + 56 + Math.sin(time * 2 + f.phase) * 1.5;
        ctx.save();
        ctx.translate(f.x, footY);
        ctx.scale(S, S);
        ctx.translate(-f.x, -GROUND_Y);               // pin feet to footY
        drawTeen(f.cfg, f.x, f.faceDir, f.jersey,
                 f.x + f.faceDir * 6, GROUND_Y - 52, 0, time, null, 0);
        ctx.restore();
      });
    }

    drawWater(time);

    // Airborne tumble stays on top of the water (visible splash).
    if (losingTeam) {
      fallTeens.forEach(function (f) {
        if (f.stage !== "air") return;
        drawTeen(f.cfg, 0, 1, f.jersey, 0, 0, 0, time,
                 { x: f.x, y: f.y, rot: f.rot }, 0);
      });
    }
    updateSplashes();
    if (screenState === "winner") {
      if (confetti.length < 50 && Math.random() < 0.5) spawnConfetti();
      updateConfetti();
    }

    // win detection
    if (gameActive && !losingTeam) {
      if (actualRopeX <= -110) { gameActive = false; startFall(2); }
      else if (actualRopeX >= 110) { gameActive = false; startFall(1); }
    }

    requestAnimationFrame(frame);
  }

  // Re-apply DPR transform each frame cheaply (handles rotation/resize).
  var _lastW = 0, _lastH = 0;
  function resizeForFrame() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (w !== _lastW || h !== _lastH) {
      canvas.width = w; canvas.height = h; _lastW = w; _lastH = h;
    }
    // Contain-fit: scale so the whole LWxLH scene fits inside the canvas
    // without clipping the characters' heads or feet. Bottom-anchored so feet
    // rest near the bottom of the stage on every tablet.
    var scale = Math.min(canvas.width / LW, canvas.height / LH);
    var ox = (canvas.width - LW * scale) / 2;
    var oy = canvas.height - LH * scale;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }

  /* ---------- Screen flow -------------------------------------------------- */
  function resetGame() {
    currentQuestionIndex = 0;
    targetRopeX = 0; actualRopeX = 0;
    p1Answered = false; p2Answered = false;
    losingTeam = 0; winnerShown = false;
    fallTeens = []; ripples = []; splashes = []; confetti = [];
    ropePulse = 0;
    shuffleQuiz();
    loadQuestion();
  }

  function startGame() {
    hide("screen-start"); hide("screen-how"); hide("screen-winner");
    document.body.classList.remove("winner");
    screenState = "playing";
    resetGame();
    gameActive = true;
  }

  function goHome() {
    gameActive = false;
    screenState = "start";
    document.body.classList.remove("winner");
    hide("screen-how"); hide("screen-winner");
    show("screen-start");
  }

  function showWinner() {
    winnerShown = true;
    screenState = "winner";
    var goldWon = (losingTeam === 2);
    $("winner-title").textContent = goldWon ? "TEAM GOLD WINS!" : "TEAM PURPLE WINS!";
    $("winner-title").style.color = goldWon ? "#FFC93C" : "#A66BFF";
    document.body.classList.add("winner");
    spawnConfetti();
    show("screen-winner");
  }

  /* ---------- Input --------------------------------------------------------
     The whole answer box is the touch target. We listen on `pointerup` AND
     `click` so the tap registers on the first touch even when the WebView
     would otherwise swallow a click (e.g. tiny finger drift, slow click
     synthesis on some Android builds). A short debounce flag prevents the
     same tap from firing twice via both paths. */
  function attachAnswerHandlers(btn) {
    var lockedUntil = 0;
    function fire(e) {
      var now = Date.now();
      if (now < lockedUntil) return;            // already fired for this tap
      lockedUntil = now + 350;
      if (e && e.preventDefault) e.preventDefault();
      checkAnswer(parseInt(btn.getAttribute("data-choice"), 10),
                  parseInt(btn.getAttribute("data-team"), 10), btn);
    }
    // pointerup fires for touch + mouse + pen on modern Android WebViews.
    btn.addEventListener("pointerup", fire);
    // click fallback covers ancient WebViews without Pointer Events.
    btn.addEventListener("click", fire);
  }
  allButtons().forEach(attachAnswerHandlers);

  $("btn-start").addEventListener("click", startGame);
  $("btn-restart").addEventListener("click", startGame);
  $("btn-winner-home").addEventListener("click", goHome);
  $("btn-howto").addEventListener("click", function () {
    screenState = "how"; hide("screen-start"); show("screen-how");
  });
  $("btn-how-back").addEventListener("click", function () {
    screenState = "start"; hide("screen-how"); show("screen-start");
  });

  // Hidden keyboard fallback (not shown anywhere in the UI). 1-4 = Gold,
  // 7/8/9/0 = Purple. Tablets ignore this; useful only with a keyboard.
  var keyMap = {
    "1": [0, 1], "2": [1, 1], "3": [2, 1], "4": [3, 1],
    "7": [0, 2], "8": [1, 2], "9": [2, 2], "0": [3, 2]
  };
  document.addEventListener("keydown", function (e) {
    var m = keyMap[e.key];
    if (m && screenState === "playing") {
      e.preventDefault();
      checkAnswer(m[0], m[1], null);
    }
  });

  // Block stray scroll / pull-to-refresh gestures outside buttons.
  window.addEventListener("touchmove", function (e) {
    if (!e.target.closest(".panel")) e.preventDefault();
  }, { passive: false });

  // Android hardware back button bridge (called from MainActivity).
  // Returns true if handled inside the web app; false => let Android decide.
  window.onAndroidBack = function () {
    if (screenState === "how") {
      screenState = "start"; hide("screen-how"); show("screen-start"); return true;
    }
    if (screenState === "winner") { goHome(); return true; }
    if (screenState === "playing") { goHome(); return true; }
    return false; // already on start screen — allow exit
  };

  /* ---------- Boot --------------------------------------------------------- */
  fitGameScreen();
  resizeCanvas();
  shuffleQuiz();
  loadQuestion();
  show("screen-start");
  requestAnimationFrame(frame);
})();
