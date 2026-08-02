(() => {
  "use strict";

  const CONTENT_FLAG = "crvbContentReady";
  const SET_VOLUME_EVENT = "crvb:set-volume";
  const STATE_EVENT = "crvb:audio-state";
  const STORAGE_KEY = "volumePercent";
  const MAX_PERCENT = 600;
  const NATIVE_LIMIT = 100;
  const RANGE_MAX = 150;
  const KEY_STEP = 5;
  const BOOST_KEY_STEP = 10;

  if (document.documentElement?.dataset[CONTENT_FLAG] === "true") {
    return;
  }

  document.documentElement.dataset[CONTENT_FLAG] = "true";

  let desiredPercent = 100;
  let playerMuted = false;
  let scanQueued = false;
  let renderQueued = false;
  let saveTimer = 0;

  const attachedSliders = new WeakMap();

  function clampPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 100;
    }

    return Math.min(MAX_PERCENT, Math.max(0, Math.round(number)));
  }

  // preserve fine control for native volume
  // top third of slider for the boosted volume.
  function rangeValueToPercent(value) {
    const rangeValue = Math.min(RANGE_MAX, Math.max(0, Number(value) || 0));
    if (rangeValue <= NATIVE_LIMIT) {
      return Math.round(rangeValue);
    }

    return Math.round(NATIVE_LIMIT + ((rangeValue - NATIVE_LIMIT) * 10));
  }

  function percentToRangeValue(percent) {
    if (percent <= NATIVE_LIMIT) {
      return percent;
    }

    return NATIVE_LIMIT + ((percent - NATIVE_LIMIT) / 10);
  }

  function dispatchVolume(userInitiated) {
    window.dispatchEvent(new CustomEvent(SET_VOLUME_EVENT, {
      detail: {
        percent: desiredPercent,
        userInitiated
      }
    }));
  }

  function saveLater() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      chrome.storage.local.set({ [STORAGE_KEY]: desiredPercent }).catch((error) => {
        console.warn("[Crunchyroll Volume Boost] Could not save volume:", error);
      });
    }, 150);
  }

  function updateDesired(percent, userInitiated) {
    desiredPercent = clampPercent(percent);
    if (userInitiated && desiredPercent > 0) {
      playerMuted = false;
    }

    dispatchVolume(userInitiated);
    saveLater();
    scheduleRender();
  }

  function stopCrunchyrollRangeHandler(event) {
    event.stopImmediatePropagation();
    event.stopPropagation();
  }

  function onRangeInput(event) {
    stopCrunchyrollRangeHandler(event);
    updateDesired(rangeValueToPercent(event.currentTarget.value), true);
  }

  function onContainerKeydown(event) {
    let nextPercent = playerMuted ? 0 : desiredPercent;
    const step = nextPercent >= NATIVE_LIMIT ? BOOST_KEY_STEP : KEY_STEP;

    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        nextPercent += step;
        break;
      case "ArrowDown":
      case "ArrowLeft":
        nextPercent -= step;
        break;
      case "PageUp":
        nextPercent += 50;
        break;
      case "PageDown":
        nextPercent -= 50;
        break;
      case "Home":
        nextPercent = 0;
        break;
      case "End":
        nextPercent = MAX_PERCENT;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
    updateDesired(nextPercent, true);
  }

  function attachContainer(container) {
    const slider = container.querySelector("input[data-testid='volume-slider']");
    if (!slider || attachedSliders.get(container) === slider) {
      return;
    }

    attachedSliders.set(container, slider);
    container.addEventListener("keydown", onContainerKeydown, true);
    slider.addEventListener("input", onRangeInput, true);
    slider.addEventListener("change", stopCrunchyrollRangeHandler, true);
    renderContainer(container);
  }

  function renderContainer(container) {
    const slider = container.querySelector("input[data-testid='volume-slider']");
    const label = container.querySelector("[data-testid='volume-slider-percentage']");
    if (!slider) {
      return;
    }

    const shownPercent = playerMuted ? 0 : desiredPercent;
    const rangeValue = percentToRangeValue(shownPercent);
    const fillPercent = (rangeValue / RANGE_MAX) * 100;
    const labelText = String(shownPercent);

    slider.min = "0";
    slider.max = String(RANGE_MAX);
    slider.step = "1";
    slider.value = String(rangeValue);
    slider.style.setProperty("--volume-percent", `${fillPercent}%`);

    container.setAttribute("aria-valuemin", "0");
    container.setAttribute("aria-valuemax", String(MAX_PERCENT));
    container.setAttribute("aria-valuenow", String(shownPercent));
    container.setAttribute("aria-valuetext", `${shownPercent}%`);

    if (label && label.textContent.trim() !== labelText) {
      label.textContent = labelText;
    }
  }

  function renderAll() {
    renderQueued = false;
    document.querySelectorAll("[data-testid='volume-slider-container']").forEach((container) => {
      attachContainer(container);
      renderContainer(container);
    });
  }

  function scheduleRender() {
    if (renderQueued) {
      return;
    }

    renderQueued = true;
    requestAnimationFrame(renderAll);
  }

  function scan() {
    scanQueued = false;
    document.querySelectorAll("[data-testid='volume-slider-container']").forEach(attachContainer);
    scheduleRender();
  }

  function scheduleScan() {
    if (scanQueued) {
      return;
    }

    scanQueued = true;
    queueMicrotask(scan);
  }

  window.addEventListener(STATE_EVENT, (event) => {
    playerMuted = Boolean(event.detail?.muted);
    scheduleRender();
  });

  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true
  });

  scheduleScan();

  chrome.storage.local.get({ [STORAGE_KEY]: 100 }).then((stored) => {
    desiredPercent = clampPercent(stored[STORAGE_KEY]);
    dispatchVolume(false);
    scheduleScan();
  }).catch((error) => {
    console.warn("[Crunchyroll Volume Boost] Could not restore volume:", error);
    dispatchVolume(false);
    scheduleScan();
  });
})();
