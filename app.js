(function () {
  "use strict";

  const GRADIENTS = {
    viridis: {
      name: "Viridis",
      stops: [
        [0, [68, 1, 84]],
        [0.25, [59, 82, 139]],
        [0.5, [33, 145, 140]],
        [0.75, [94, 201, 98]],
        [1, [253, 231, 37]],
      ],
    },
    inferno: {
      name: "Inferno",
      stops: [
        [0, [0, 0, 4]],
        [0.25, [87, 16, 110]],
        [0.5, [188, 55, 84]],
        [0.75, [249, 142, 10]],
        [1, [252, 255, 164]],
      ],
    },
    plasma: {
      name: "Plasma",
      stops: [
        [0, [13, 8, 135]],
        [0.25, [126, 3, 168]],
        [0.5, [204, 71, 120]],
        [0.75, [248, 149, 64]],
        [1, [240, 249, 33]],
      ],
    },
    magma: {
      name: "Magma",
      stops: [
        [0, [0, 0, 4]],
        [0.25, [81, 18, 124]],
        [0.5, [183, 55, 121]],
        [0.75, [252, 164, 92]],
        [1, [252, 253, 191]],
      ],
    },
    cool: {
      name: "Cool",
      stops: [
        [0, [0, 0, 0]],
        [0.33, [0, 80, 180]],
        [0.66, [80, 200, 255]],
        [1, [255, 255, 255]],
      ],
    },
    fire: {
      name: "Fire",
      stops: [
        [0, [0, 0, 0]],
        [0.2, [80, 0, 0]],
        [0.5, [220, 60, 0]],
        [0.8, [255, 200, 0]],
        [1, [255, 255, 220]],
      ],
    },
    rainbow: {
      name: "Rainbow",
      stops: [
        [0, [0, 0, 128]],
        [0.17, [0, 0, 255]],
        [0.33, [0, 255, 255]],
        [0.5, [0, 255, 0]],
        [0.67, [255, 255, 0]],
        [0.83, [255, 128, 0]],
        [1, [255, 0, 0]],
      ],
    },
    grayscale: {
      name: "Grayscale",
      stops: [
        [0, [0, 0, 0]],
        [1, [255, 255, 255]],
      ],
    },
  };

  const canvas = document.getElementById("spectrogram");
  const ctx = canvas.getContext("2d", { alpha: false });
  const toggleMicBtn = document.getElementById("toggleMic");
  const micIcon = document.getElementById("micIcon");
  const statusEl = document.getElementById("status");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const micHint = document.getElementById("micHint");
  const gradientGrid = document.getElementById("gradientGrid");
  const dbFloorInput = document.getElementById("dbFloor");
  const dbFloorValue = document.getElementById("dbFloorValue");
  const fftSizeSelect = document.getElementById("fftSize");
  const logScaleCheckbox = document.getElementById("logScale");
  const showGridCheckbox = document.getElementById("showGrid");
  const sampleRateEl = document.getElementById("sampleRate");
  const peakFreqEl = document.getElementById("peakFreq");
  const peakLevelEl = document.getElementById("peakLevel");

  let audioContext = null;
  let analyser = null;
  let mediaStream = null;
  let sourceNode = null;
  let animationId = null;
  let isRunning = false;

  let currentGradient = "viridis";
  let colorLUT = buildColorLUT(GRADIENTS.viridis);
  let frequencyData = null;
  let columnBuffer = null;

  let dbMin = -85;
  let dbMax = 0;
  let logScale = true;
  let showGrid = false;

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(c1, c2, t) {
    return [
      Math.round(lerp(c1[0], c2[0], t)),
      Math.round(lerp(c1[1], c2[1], t)),
      Math.round(lerp(c1[2], c2[2], t)),
    ];
  }

  function interpolateStops(stops, t) {
    for (let i = 0; i < stops.length - 1; i++) {
      const [p0, c0] = stops[i];
      const [p1, c1] = stops[i + 1];
      if (t >= p0 && t <= p1) {
        const local = (t - p0) / (p1 - p0);
        return lerpColor(c0, c1, local);
      }
    }
    return stops[stops.length - 1][1];
  }

  function buildColorLUT(gradientDef) {
    const lut = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const [r, g, b] = interpolateStops(gradientDef.stops, t);
      const idx = i * 4;
      lut[idx] = r;
      lut[idx + 1] = g;
      lut[idx + 2] = b;
      lut[idx + 3] = 255;
    }
    return lut;
  }

  function buildGradientSwatchCSS(stops) {
    const parts = stops.map(([p, c]) => {
      const pct = (p * 100).toFixed(1);
      return `rgb(${c[0]},${c[1]},${c[2]}) ${pct}%`;
    });
    return `linear-gradient(to right, ${parts.join(", ")})`;
  }

  function initGradientPicker() {
    Object.entries(GRADIENTS).forEach(([id, def]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "gradient-option";
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", id === currentGradient ? "true" : "false");
      btn.dataset.gradient = id;

      const swatch = document.createElement("span");
      swatch.className = "gradient-swatch";
      swatch.style.background = buildGradientSwatchCSS(def.stops);

      const name = document.createElement("span");
      name.className = "gradient-name";
      name.textContent = def.name;

      btn.append(swatch, name);
      btn.addEventListener("click", () => selectGradient(id));
      gradientGrid.appendChild(btn);
    });
  }

  function selectGradient(id) {
    currentGradient = id;
    colorLUT = buildColorLUT(GRADIENTS[id]);
    gradientGrid.querySelectorAll(".gradient-option").forEach((el) => {
      el.setAttribute("aria-checked", el.dataset.gradient === id ? "true" : "false");
    });
  }

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    columnBuffer = ctx.createImageData(1, Math.max(1, Math.floor(h)));
  }

  function freqToBin(freq, sampleRate, binCount) {
    const nyquist = sampleRate / 2;
    const normalized = freq / nyquist;
    return Math.min(binCount - 1, Math.round(normalized * binCount));
  }

  function binToY(bin, binCount, height, log) {
    if (log) {
      const minFreq = 20;
      const maxFreq = (audioContext?.sampleRate || 48000) / 2;
      const freq = (bin / binCount) * maxFreq;
      const logMin = Math.log10(minFreq);
      const logMax = Math.log10(maxFreq);
      const logFreq = Math.log10(Math.max(minFreq, freq));
      const norm = (logFreq - logMin) / (logMax - logMin);
      return Math.floor((1 - norm) * (height - 1));
    }
    return Math.floor((1 - bin / binCount) * (height - 1));
  }

  function magnitudeToIndex(db) {
    const clamped = Math.max(dbMin, Math.min(dbMax, db));
    const norm = (clamped - dbMin) / (dbMax - dbMin);
    return Math.floor(norm * 255);
  }

  function drawFrequencyGrid(w, h) {
    if (!showGrid || !audioContext) return;

    const sampleRate = audioContext.sampleRate;
    const freqs = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const binCount = analyser.frequencyBinCount;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "10px system-ui, sans-serif";
    ctx.lineWidth = 1;

    freqs.forEach((freq) => {
      if (freq > sampleRate / 2) return;
      const bin = freqToBin(freq, sampleRate, binCount);
      const y = binToY(bin, binCount, h, logScale) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      if (freq >= 1000) {
        ctx.fillText(`${freq / 1000}k`, 4, Math.max(12, y - 3));
      } else {
        ctx.fillText(`${freq}`, 4, Math.max(12, y - 3));
      }
    });

    ctx.restore();
  }

  function drawColumn(w, h) {
    if (!analyser || !frequencyData || !columnBuffer) return;

    const binCount = analyser.frequencyBinCount;
    if (!columnBuffer || columnBuffer.height !== h) {
      columnBuffer = ctx.createImageData(1, h);
    }
    const data = columnBuffer.data;
    const usedBins = new Uint8Array(h);

    for (let bin = 0; bin < binCount; bin++) {
      const db = frequencyData[bin];
      const colorIdx = magnitudeToIndex(db);
      const lutOff = colorIdx * 4;
      const y = binToY(bin, binCount, h, logScale);

      if (y >= 0 && y < h && !usedBins[y]) {
        usedBins[y] = 1;
        const off = y * 4;
        data[off] = colorLUT[lutOff];
        data[off + 1] = colorLUT[lutOff + 1];
        data[off + 2] = colorLUT[lutOff + 2];
        data[off + 3] = 255;
      }
    }

    for (let y = 0; y < h; y++) {
      if (!usedBins[y]) {
        let nearest = y;
        for (let d = 1; d < h && !usedBins[y]; d++) {
          if (y - d >= 0 && usedBins[y - d]) {
            nearest = y - d;
            break;
          }
          if (y + d < h && usedBins[y + d]) {
            nearest = y + d;
            break;
          }
        }
        const off = y * 4;
        const src = nearest * 4;
        data[off] = data[src];
        data[off + 1] = data[src + 1];
        data[off + 2] = data[src + 2];
        data[off + 3] = 255;
      }
    }

    ctx.drawImage(canvas, -1, 0);
    ctx.putImageData(columnBuffer, w - 1, 0);
    drawFrequencyGrid(w, h);
  }

  function updateStats() {
    if (!analyser || !frequencyData || !audioContext) return;

    const binCount = analyser.frequencyBinCount;
    const sampleRate = audioContext.sampleRate;
    let peakDb = -Infinity;
    let peakBin = 0;

    for (let i = 0; i < binCount; i++) {
      if (frequencyData[i] > peakDb) {
        peakDb = frequencyData[i];
        peakBin = i;
      }
    }

    const peakFreq = (peakBin / binCount) * (sampleRate / 2);
    sampleRateEl.textContent = `${(sampleRate / 1000).toFixed(1)} kHz`;
    peakFreqEl.textContent =
      peakFreq >= 1000 ? `${(peakFreq / 1000).toFixed(2)} kHz` : `${Math.round(peakFreq)} Hz`;
    peakLevelEl.textContent = `${peakDb.toFixed(1)} dB`;
  }

  function renderFrame() {
    if (!isRunning) return;

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    analyser.getFloatFrequencyData(frequencyData);
    drawColumn(w, h);
    updateStats();

    animationId = requestAnimationFrame(renderFrame);
  }

  async function startMic() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });

      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = parseInt(fftSizeSelect.value, 10);
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = dbMin;
      analyser.maxDecibels = dbMax;

      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      sourceNode.connect(analyser);

      frequencyData = new Float32Array(analyser.frequencyBinCount);
      isRunning = true;

      setUIActive(true);
      micHint.textContent = "Listening… speak or play audio near the mic.";
      micHint.classList.remove("hint--error");

      renderFrame();
    } catch (err) {
      micHint.textContent =
        err.name === "NotAllowedError"
          ? "Microphone permission denied. Allow access and try again."
          : `Could not access microphone: ${err.message}`;
      micHint.classList.add("hint--error");
      stopMic();
    }
  }

  function stopMic() {
    isRunning = false;
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    analyser = null;
    frequencyData = null;

    setUIActive(false);
    sampleRateEl.textContent = "—";
    peakFreqEl.textContent = "—";
    peakLevelEl.textContent = "—";
  }

  function setUIActive(active) {
    statusEl.classList.toggle("status--live", active);
    statusText.textContent = active ? "Microphone live" : "Microphone off";
    toggleMicBtn.classList.toggle("btn--stop", active);
    toggleMicBtn.innerHTML = active
      ? '<span class="btn-icon" id="micIcon">■</span> Stop microphone'
      : '<span class="btn-icon" id="micIcon">●</span> Start microphone';
  }

  function toggleMic() {
    if (isRunning) {
      stopMic();
    } else {
      startMic();
    }
  }

  function onAnalyserSettingsChange() {
    dbMin = parseInt(dbFloorInput.value, 10);
    dbFloorValue.textContent = `${dbMin} dB`;
    logScale = logScaleCheckbox.checked;
    showGrid = showGridCheckbox.checked;

    if (analyser) {
      analyser.minDecibels = dbMin;
      analyser.maxDecibels = dbMax;
      const newFft = parseInt(fftSizeSelect.value, 10);
      if (analyser.fftSize !== newFft) {
        analyser.fftSize = newFft;
        frequencyData = new Float32Array(analyser.frequencyBinCount);
        resizeCanvas();
      }
    }
  }

  toggleMicBtn.addEventListener("click", toggleMic);
  dbFloorInput.addEventListener("input", onAnalyserSettingsChange);
  fftSizeSelect.addEventListener("change", onAnalyserSettingsChange);
  logScaleCheckbox.addEventListener("change", onAnalyserSettingsChange);
  showGridCheckbox.addEventListener("change", onAnalyserSettingsChange);

  window.addEventListener("resize", () => {
    resizeCanvas();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isRunning) {
      /* keep running; browsers may throttle anyway */
    }
  });

  initGradientPicker();
  resizeCanvas();
  onAnalyserSettingsChange();
})();
