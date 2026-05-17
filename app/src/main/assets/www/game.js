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

  /* ---------- Logical scene dimensions (canvas is DPR-scaled to fit) -------- */
  var LW = 1280, LH = 460;
  var CENTER_X = LW / 2;
  var GROUND_Y = 372;          // top of the platforms / where feet rest
  var WATER_TOP = 366;         // water surface inside the central pit
  var PIT_L = 470, PIT_R = 810;// central water pit horizontal bounds
  var ROPE_Y = 300;            // resting rope height (hand grip line)

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
    var scale = Math.min(canvas.width / LW, canvas.height / LH);
    var ox = (canvas.width - LW * scale) / 2;
    var oy = (canvas.height - LH * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }
  window.addEventListener("resize", resizeCanvas);

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
    { off: -118, skin: "#F1C9A5", hair: "#3A2A1A", style: "short",   build: 1.00 },
    { off: -188, skin: "#8D5A33", hair: "#1A1A1A", style: "bun",     build: 1.06 },
    { off: -262, skin: "#C68642", hair: "#7A3B17", style: "curly",   build: 0.95 }
  ];
  var purpleTeam = [
    { off: 118, skin: "#5C3A21", hair: "#101010", style: "ponytail", build: 1.02 },
    { off: 188, skin: "#FAD7B4", hair: "#E8B84B", style: "fade",     build: 0.96 },
    { off: 262, skin: "#A56A40", hair: "#2A1B12", style: "short",    build: 1.05 }
  ];

  function drawHair(hx, hy, r, dir, style, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = shade(color, -28);
    ctx.lineWidth = 1.5;
    // base cap
    ctx.beginPath();
    ctx.arc(hx, hy, r + 2, Math.PI * 0.92, Math.PI * 2.08);
    ctx.lineTo(hx + dir * (r - 1), hy + 3);
    ctx.closePath(); ctx.fill();
    var back = hx - dir * (r - 2);
    if (style === "bun") {
      ctx.beginPath(); ctx.arc(back, hy - r - 2, 9, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (style === "ponytail") {
      ctx.beginPath();
      ctx.moveTo(back, hy - r + 2);
      ctx.quadraticCurveTo(back - dir * 20, hy + 4, back - dir * 8, hy + 30);
      ctx.quadraticCurveTo(back - dir * 2, hy + 6, back, hy - r + 6);
      ctx.fill();
    } else if (style === "curly") {
      for (var i = -1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(hx - dir * (i * 5) + dir * 6, hy - r - 1 + (i % 2) * 3, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === "fade") {
      ctx.beginPath();
      ctx.ellipse(hx + dir * 2, hy - 2, r + 1, r - 1, 0, Math.PI, Math.PI * 2);
      ctx.fill();
    } else { // short
      ctx.beginPath();
      ctx.moveTo(hx + dir * (r), hy - 2);
      ctx.quadraticCurveTo(hx + dir * (r + 4), hy - r, hx - dir * 2, hy - r - 3);
      ctx.quadraticCurveTo(back - dir * 4, hy - r + 1, back - dir * 2, hy + 2);
      ctx.fill();
    }
  }

  /* Draw one teen. cfg = roster entry; gx,gy = rope grip point in scene coords.
     strain 0..1 (how hard this side is straining). fall = null or
     {x,y,rot} ragdoll override when tumbling into the water. */
  function drawTeen(cfg, baseX, dir, jersey, gx, gy, strain, time, fall) {
    var skinEdge = shade(cfg.skin, -45);
    var build = cfg.build;

    if (fall) {
      // ---- Tumbling ragdoll ----
      ctx.save();
      ctx.translate(fall.x, fall.y);
      ctx.rotate(fall.rot);
      // torso
      ctx.fillStyle = jersey.mid; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 19 * build, 26 * build, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // curled limbs
      limb(-4, -6, -26, -14, 6, 4, cfg.skin, skinEdge);
      limb(4, -6, 24, -18, 6, 4, cfg.skin, skinEdge);
      limb(-6, 18, -22, 30, 8, 5, "#2A2F45", "#171a26");
      limb(6, 18, 22, 30, 8, 5, "#2A2F45", "#171a26");
      // head
      ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -34, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      drawHair(0, -34, 15, 1, cfg.style, cfg.hair);
      ctx.restore();
      return;
    }

    // ---- Braced pulling stance ----
    var lean = 0.14 + strain * 0.20;                 // radians, leans away from rope
    var hipX = baseX - dir * (16 + strain * 18);
    var hipY = GROUND_Y - 92;
    var shX  = hipX - dir * (26 + strain * 26 + Math.sin(lean) * 8);
    var shY  = hipY - 60 * build;

    // Foot shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(baseX - dir * 4, GROUND_Y + 6, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (back leg = drive leg, front leg = brace) — drawn behind torso
    var frontFootX = baseX + dir * (38 + strain * 10);
    var backFootX  = baseX - dir * (50 + strain * 16);
    var frontKneeX = (hipX + frontFootX) / 2 + dir * 12;
    var backKneeX  = (hipX + backFootX) / 2 - dir * 4;
    var pants = "#2C3354", pantsEdge = "#191d30";
    limb(hipX, hipY, backKneeX, GROUND_Y - 40, 12 * build, 9, pants, pantsEdge);
    limb(backKneeX, GROUND_Y - 40, backFootX, GROUND_Y - 4, 9, 6, cfg.skin, skinEdge);
    limb(hipX, hipY, frontKneeX, GROUND_Y - 44, 13 * build, 10, pants, pantsEdge);
    limb(frontKneeX, GROUND_Y - 44, frontFootX, GROUND_Y - 2, 10, 7, cfg.skin, skinEdge);
    // Shoes
    ctx.fillStyle = jersey.bright; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2;
    [[frontFootX, 1], [backFootX, 0.85]].forEach(function (f) {
      ctx.beginPath();
      ctx.ellipse(f[0] + dir * 6, GROUND_Y + 1, 15 * f[1], 7, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });

    // Back arm (far side) reaching to rope
    var backShX = shX + dir * 3;
    limb(backShX, shY + 4, (backShX + gx) / 2 - dir * 4, (shY + gy) / 2 + 4,
         8, 6, shade(cfg.skin, -22), skinEdge);
    limb((backShX + gx) / 2 - dir * 4, (shY + gy) / 2 + 4, gx - dir * 6, gy,
         6, 5, shade(cfg.skin, -22), skinEdge);

    // Torso / jersey
    var grad = ctx.createLinearGradient(0, shY, 0, hipY);
    grad.addColorStop(0, jersey.bright);
    grad.addColorStop(1, jersey.mid);
    ctx.fillStyle = grad; ctx.strokeStyle = jersey.edge; ctx.lineWidth = 2.6;
    var tw = 21 * build;
    ctx.beginPath();
    ctx.moveTo(shX - tw, shY);
    ctx.quadraticCurveTo(shX, shY - 7, shX + tw, shY);
    ctx.quadraticCurveTo(hipX + tw + 4, (shY + hipY) / 2, hipX + 16, hipY + 4);
    ctx.quadraticCurveTo(hipX, hipY + 9, hipX - 16, hipY + 4);
    ctx.quadraticCurveTo(shX - tw - 4, (shY + hipY) / 2, shX - tw, shY);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // jersey side stripe
    ctx.strokeStyle = jersey.bright; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shX + dir * tw * 0.4, shY + 4);
    ctx.lineTo(hipX + dir * 12, hipY);
    ctx.stroke();

    // Neck + head
    var headX = shX - dir * 2, headY = shY - 22;
    ctx.strokeStyle = cfg.skin; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(headX, headY + 12); ctx.stroke();
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(headX, headY, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // ear
    ctx.beginPath(); ctx.arc(headX - dir * 13, headY + 1, 4, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // face — determined effort
    ctx.fillStyle = "#1c1c24";
    ctx.beginPath(); ctx.arc(headX + dir * 6, headY - 1, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1c1c24"; ctx.lineWidth = 2.2; ctx.lineCap = "round";
    ctx.beginPath(); // angled brow
    ctx.moveTo(headX + dir * 2, headY - 7);
    ctx.lineTo(headX + dir * 10, headY - 4); ctx.stroke();
    ctx.beginPath(); // gritted mouth
    ctx.moveTo(headX + dir * 2, headY + 8);
    ctx.lineTo(headX + dir * 10, headY + 8); ctx.stroke();
    drawHair(headX, headY, 15, dir, cfg.style, cfg.hair);
    // sweat when straining hard
    if (strain > 0.62) {
      ctx.fillStyle = "rgba(120,200,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(headX + dir * 16, headY - 4 + (time * 60 % 14), 2.4, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Front arm reaching to rope (over torso)
    var frShX = shX + dir * 6;
    limb(frShX, shY + 3, (frShX + gx) / 2 + dir * 6, (shY + gy) / 2,
         9, 6, cfg.skin, skinEdge);
    limb((frShX + gx) / 2 + dir * 6, (shY + gy) / 2, gx, gy,
         6, 5, cfg.skin, skinEdge);
    // gripping hand
    ctx.fillStyle = cfg.skin; ctx.strokeStyle = skinEdge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(gx, gy, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  /* ---------- Scene background -------------------------------------------- */
  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, LH);
    sky.addColorStop(0, "#1E3A8A");
    sky.addColorStop(0.5, "#162256");
    sky.addColorStop(1, "#0B1437");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, LW, LH);

    // arena spotlights
    [[CENTER_X, "rgba(34,211,238,0.16)"],
     [240, "rgba(245,166,35,0.14)"],
     [LW - 240, "rgba(123,47,247,0.16)"]].forEach(function (s) {
      var g = ctx.createRadialGradient(s[0], 30, 10, s[0], 30, 420);
      g.addColorStop(0, s[1]); g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
    });

    // crowd / arena wall band
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, 70, LW, 60);
    for (var i = 0; i < 60; i++) {
      ctx.fillStyle = i % 3 === 0 ? "rgba(245,166,35,0.10)"
                    : i % 3 === 1 ? "rgba(123,47,247,0.10)"
                                  : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.arc(20 + i * 21, 92 + (i % 2) * 14, 7, 0, Math.PI * 2); ctx.fill();
    }

    // banner
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    roundRect(CENTER_X - 300, 18, 600, 40, 12); ctx.fill();
    ctx.fillStyle = "#dfe6ff";
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
    var dir = (team === 1) ? 1 : -1;
    var knotX = CENTER_X + actualRopeX;
    roster.forEach(function (cfg, idx) {
      var sx = knotX + cfg.off;
      fallTeens.push({
        cfg: cfg,
        x: sx, y: GROUND_Y - 50,
        vx: dir * (3.4 + idx * 0.8),
        vy: -3 - idx * 0.5,
        rot: 0, vrot: dir * (0.16 + idx * 0.05),
        splashed: false,
        jersey: (team === 1) ? jerseyGold : jerseyPurple
      });
    });
    fallTimer = 0;
  }

  function updateFall() {
    fallTimer++;
    fallTeens.forEach(function (f) {
      f.vy += 0.42;                 // gravity
      f.x += f.vx; f.y += f.vy; f.rot += f.vrot;
      if (!f.splashed && f.y >= WATER_TOP - 6 &&
          f.x > PIT_L && f.x < PIT_R) {
        f.splashed = true;
        spawnSplash(f.x, WATER_TOP);
        ripples.push({ x: f.x, y: WATER_TOP + 4, r: 6, alpha: 0.8 });
        ripples.push({ x: f.x, y: WATER_TOP + 4, r: 16, alpha: 0.5 });
      }
      if (f.y > WATER_TOP + 30) {   // bob & sink slightly
        f.vy *= 0.5; f.vx *= 0.8;
        f.y = WATER_TOP + 30 + Math.sin(fallTimer * 0.15 + f.x) * 4;
        f.vrot *= 0.9;
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

    // standing teens (skip the team that is tumbling)
    if (losingTeam !== 1) {
      goldTeam.forEach(function (cfg, i) {
        var bx = knotX + cfg.off;
        var gx = bx + 30 + (cfg.off + 118) * -0.15;
        var bob = Math.sin(time * 4 - i) * 3;
        drawTeen(cfg, bx, 1, jerseyGold, gx, ROPE_Y + 4 + bob,
                 goldStrain, time, null);
      });
    }
    if (losingTeam !== 2) {
      purpleTeam.forEach(function (cfg, i) {
        var bx = knotX + cfg.off;
        var gx = bx - 30 + (cfg.off - 118) * -0.15;
        var bob = Math.sin(time * 4 - i) * 3;
        drawTeen(cfg, bx, -1, jerseyPurple, gx, ROPE_Y + 4 + bob,
                 purpleStrain, time, null);
      });
    }

    drawWater(time);

    if (losingTeam) {
      updateFall();
      fallTeens.forEach(function (f) {
        drawTeen(f.cfg, 0, 1, f.jersey, 0, 0, 0, time,
                 { x: f.x, y: f.y, rot: f.rot });
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
    var scale = Math.min(canvas.width / LW, canvas.height / LH);
    var ox = (canvas.width - LW * scale) / 2;
    var oy = (canvas.height - LH * scale) / 2;
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

  /* ---------- Input -------------------------------------------------------- */
  allButtons().forEach(function (btn) {
    btn.addEventListener("click", function () {
      checkAnswer(parseInt(btn.getAttribute("data-choice"), 10),
                  parseInt(btn.getAttribute("data-team"), 10), btn);
    });
  });

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
  resizeCanvas();
  shuffleQuiz();
  loadQuestion();
  show("screen-start");
  requestAnimationFrame(frame);
})();
