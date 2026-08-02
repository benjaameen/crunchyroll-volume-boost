(() => {
  "use strict";

  const BRIDGE_FLAG = "__crunchyrollVolumeBoostBridgeV1__";
  const SET_VOLUME_EVENT = "crvb:set-volume";
  const STATE_EVENT = "crvb:audio-state";
  const MAX_PERCENT = 600;

  if (window[BRIDGE_FLAG]) {
    return;
  }

  Object.defineProperty(window, BRIDGE_FLAG, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });

  let desiredPercent = 100;
  let activeVideo = null;
  let userHasInteracted = false;
  let scanPending = false;

  const graphs = new WeakMap();
  const failedVideos = new WeakSet();

  function clampPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 100;
    }

    return Math.min(MAX_PERCENT, Math.max(0, Math.round(number)));
  }

  function emitState() {
    window.dispatchEvent(new CustomEvent(STATE_EVENT, {
      detail: {
        muted: Boolean(activeVideo?.muted || activeVideo?.volume === 0)
      }
    }));
  }

  function selectVideo() {
    const preferred = document.querySelector(
      ".player-container video, [data-testid='player-controls-root'] video, .video-player video"
    );

    if (preferred) {
      return preferred;
    }

    const videos = [...document.querySelectorAll("video")];
    return videos.find((video) => !video.ended) || videos[0] || null;
  }

  function setCompressorMode(graph, boosting) {
    const now = graph.context.currentTime;
    graph.compressor.threshold.cancelScheduledValues(now);
    graph.compressor.ratio.cancelScheduledValues(now);

    if (boosting) {
      graph.compressor.threshold.setValueAtTime(-3, now);
      graph.compressor.knee.setValueAtTime(6, now);
      graph.compressor.ratio.setValueAtTime(20, now);
    } else {
      graph.compressor.threshold.setValueAtTime(0, now);
      graph.compressor.knee.setValueAtTime(0, now);
      graph.compressor.ratio.setValueAtTime(1, now);
    }
  }

  function createGraph(video) {
    const existing = graphs.get(video);
    if (existing) {
      return existing;
    }

    if (failedVideos.has(video)) {
      return null;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      failedVideos.add(video);
      console.warn("[Crunchyroll Volume Boost] This browser does not support Web Audio.");
      return null;
    }

    let context = null;

    try {
      context = new AudioContextClass();
      const source = context.createMediaElementSource(video);
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();

      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      gain.gain.value = 1;

      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(context.destination);

      const graph = { context, source, gain, compressor };
      graphs.set(video, graph);
      setCompressorMode(graph, false);
      return graph;
    } catch (error) {
      failedVideos.add(video);
      console.warn(
        "[Crunchyroll Volume Boost] Audio boost could not attach. Reload the tab and try again.",
        error
      );

      if (context && context.state !== "closed") {
        context.close().catch(() => {});
      }

      return null;
    }
  }

  function resumeGraph(graph) {
    if (graph?.context.state === "suspended") {
      graph.context.resume().catch((error) => {
        console.warn("[Crunchyroll Volume Boost] Could not resume audio:", error);
      });
    }
  }

  function applyVolume({ userInitiated = false } = {}) {
    const video = activeVideo || selectVideo();
    if (!video) {
      emitState();
      return;
    }

    if (video !== activeVideo) {
      attachVideo(video);
      return;
    }

    if (userInitiated && desiredPercent > 0 && video.muted) {
      video.muted = false;
    }

    if (desiredPercent <= 100) {
      const graph = graphs.get(video);
      if (graph) {
        const now = graph.context.currentTime;
        graph.gain.gain.cancelScheduledValues(now);
        graph.gain.gain.setValueAtTime(1, now);
        setCompressorMode(graph, false);
        resumeGraph(graph);
      }

      video.volume = desiredPercent / 100;
      emitState();
      return;
    }

    // native volume stays at 100% in the boosted range
	// the web audio gain begins at 1, making the handoff at 100% continuous.
    video.volume = 1;

    if (!userHasInteracted) {
      // browsers require a user gesture before a web audio graph can start
      emitState();
      return;
    }

    const graph = createGraph(video);
    if (!graph) {
      emitState();
      return;
    }

    const now = graph.context.currentTime;
    setCompressorMode(graph, true);
    graph.gain.gain.cancelScheduledValues(now);
    graph.gain.gain.setTargetAtTime(desiredPercent / 100, now, 0.015);
    resumeGraph(graph);
    emitState();
  }

  function onNativeVolumeChange() {
    emitState();
  }

  function attachVideo(video) {
    if (video === activeVideo) {
      applyVolume();
      return;
    }

    if (activeVideo) {
      activeVideo.removeEventListener("volumechange", onNativeVolumeChange);
    }

    activeVideo = video;
    video.addEventListener("volumechange", onNativeVolumeChange);
    video.addEventListener("play", () => {
      resumeGraph(graphs.get(video));
    }, { passive: true });

    applyVolume();
  }

  function scanForVideo() {
    scanPending = false;
    const video = selectVideo();
    if (video && video !== activeVideo) {
      attachVideo(video);
    }
  }

  function scheduleScan() {
    if (scanPending) {
      return;
    }

    scanPending = true;
    queueMicrotask(scanForVideo);
  }

  function registerUserInteraction() {
    userHasInteracted = true;
    scheduleScan();
    applyVolume();
  }

  window.addEventListener(SET_VOLUME_EVENT, (event) => {
    desiredPercent = clampPercent(event.detail?.percent);
    applyVolume({ userInitiated: Boolean(event.detail?.userInitiated) });
  });

  document.addEventListener("pointerdown", registerUserInteraction, {
    capture: true,
    passive: true
  });
  document.addEventListener("keydown", registerUserInteraction, {
    capture: true,
    passive: true
  });

  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true
  });

  scheduleScan();
})();
