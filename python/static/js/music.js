(function () {
  "use strict";
  const PLAYLISTS = {
    starry: ["track 15.mp3", "track 14.mp3", "track 20.mp3"],
    deepsea: ["track 06.mp3", "after the rain.mp3"],
    sky: ["明快干脆 13.mp3", "track 14.mp3", "track 08.mp3"],
    flower: ["慢 钢琴04.mp3", "after the rain.mp3"],
    dragon: ["较快的 02.mp3", "track 20.mp3"],
    qingli: ["after the rain.mp3", "慢 钢琴04.mp3"]
  };
  const STORAGE_KEY = "projecthub_music_v1";
  const root = document.getElementById("music-player");
  if (!root) return;
  const audio = new Audio();
  audio.preload = "metadata";
  const toggle = root.querySelector("#music-toggle");
  const panel = root.querySelector(".music-panel");
  const close = root.querySelector("[data-music-close]");
  const title = root.querySelector("#music-track");
  const progress = root.querySelector("#music-progress");
  const current = root.querySelector("#music-current");
  const duration = root.querySelector("#music-duration");
  const playButton = root.querySelector("[data-music-play]");
  const volume = root.querySelector("#music-volume");
  const loopButton = root.querySelector("[data-music-loop]");
  const randomButton = root.querySelector("[data-music-random]");
  let theme = document.documentElement.dataset.theme || "starry";
  let index = 0;
  let playing = false;
  let fadeTimer = null;
  let petRestoreTimer = null;
  const settings = restore();
  function restore() {
    const defaults = { volume: 0.48, loop: "all", random: false, collapsed: true };
    try { return Object.assign(defaults, JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"), { collapsed: true }); }
    catch (e) { return defaults; }
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) {} }
  function tracks() { return PLAYLISTS[theme] || PLAYLISTS.starry; }
  function trackUrl(name) { return "assets/music/" + encodeURIComponent(name); }
  function format(seconds) { if (!Number.isFinite(seconds) || seconds < 0) return "0:00"; const min = Math.floor(seconds / 60); const sec = Math.floor(seconds % 60); return min + ":" + String(sec).padStart(2, "0"); }
  function pet(state) { const api = window.ProjectHubPet; if (!api) return; if (state === "music" && api.music) api.music(); else if (state === "idle" && api.idle) api.idle(); else if (state === "happy" && api.happy) api.happy(); else if (api.pulse) api.pulse(state, 900); }
  function petHappyThenMusic() { if (!playing) return; clearTimeout(petRestoreTimer); pet("happy"); petRestoreTimer = setTimeout(function () { if (playing) pet("music"); }, 1000); }
  function updateUI() {
    playButton.innerHTML = '<i class="fa-solid fa-' + (playing ? "pause" : "play") + '"></i>';
    playButton.setAttribute("aria-label", playing ? "暂停" : "播放");
    root.classList.toggle("is-collapsed", settings.collapsed);
    toggle.setAttribute("aria-expanded", String(!settings.collapsed));
    panel.hidden = settings.collapsed;
    volume.value = String(settings.volume);
    loopButton.dataset.mode = settings.loop;
    loopButton.innerHTML = '<i class="fa-solid fa-' + (settings.loop === "one" ? "repeat-1" : settings.loop === "all" ? "repeat" : "arrow-right-arrow-left") + '"></i>';
    randomButton.classList.toggle("is-on", settings.random);
    randomButton.innerHTML = '<i class="fa-solid fa-shuffle"></i>';
    title.textContent = tracks()[index] ? tracks()[index].replace(/\.mp3$/i, "") : "暂无音乐";
  }
  function loadTrack(nextIndex, autoplay) { const list = tracks(); index = (nextIndex + list.length) % list.length; audio.src = trackUrl(list[index]); audio.load(); updateUI(); if (autoplay) play(); }
  function fadeTo(target, duration, done) { clearInterval(fadeTimer); if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { audio.volume = target; if (done) done(); return; } const start = audio.volume; const started = performance.now(); fadeTimer = setInterval(function () { const p = Math.min(1, (performance.now() - started) / duration); audio.volume = start + (target - start) * p; if (p >= 1) { clearInterval(fadeTimer); fadeTimer = null; if (done) done(); } }, 30); }
  function play() { clearTimeout(petRestoreTimer); if (!audio.src) loadTrack(index, false); audio.volume = 0; const result = audio.play(); playing = true; if (result && result.catch) result.catch(function () { playing = false; updateUI(); }); fadeTo(settings.volume, 1000); pet("music"); updateUI(); }
  function pause() { clearTimeout(petRestoreTimer); fadeTo(0, 800, function () { audio.pause(); playing = false; pet("idle"); updateUI(); }); }
  function togglePlay() { if (playing) pause(); else play(); }
  function next(direction) { const wasPlaying = playing; fadeTo(0, 600, function () { let nextIndex = index + direction; if (settings.random) nextIndex = Math.floor(Math.random() * tracks().length); loadTrack(nextIndex, wasPlaying); if (wasPlaying) petHappyThenMusic(); }); }
  function setCollapsed(value) { settings.collapsed = value; save(); updateUI(); }
  toggle.addEventListener("click", function () { setCollapsed(!settings.collapsed); });
  close.addEventListener("click", function () { setCollapsed(true); });
  playButton.addEventListener("click", togglePlay);
  root.querySelector("[data-music-prev]").addEventListener("click", function () { next(-1); });
  root.querySelector("[data-music-next]").addEventListener("click", function () { next(1); });
  volume.addEventListener("input", function () { settings.volume = Number(volume.value); audio.volume = settings.volume; save(); });
  loopButton.addEventListener("click", function () { settings.loop = settings.loop === "all" ? "one" : settings.loop === "one" ? "off" : "all"; save(); updateUI(); });
  randomButton.addEventListener("click", function () { settings.random = !settings.random; save(); updateUI(); });
  progress.addEventListener("input", function () { if (audio.duration) audio.currentTime = (Number(progress.value) / 100) * audio.duration; });
  audio.addEventListener("timeupdate", function () { if (audio.duration) progress.value = String((audio.currentTime / audio.duration) * 100); current.textContent = format(audio.currentTime); });
  audio.addEventListener("loadedmetadata", function () { duration.textContent = format(audio.duration); });
  audio.addEventListener("ended", function () { if (settings.loop === "one") { play(); return; } const atEnd = index === tracks().length - 1; if (settings.loop === "off" && atEnd && !settings.random) { playing = false; updateUI(); pet("idle"); return; } next(1); });
  new MutationObserver(function () { const nextTheme = document.documentElement.dataset.theme || "starry"; if (nextTheme === theme) return; const wasPlaying = playing; theme = nextTheme; index = 0; loadTrack(0, wasPlaying); if (wasPlaying) petHappyThenMusic(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  audio.volume = settings.volume; loadTrack(0, false); updateUI();
  window.ProjectHubMusic = { play: play, pause: pause, next: function () { next(1); }, previous: function () { next(-1); }, state: function () { return { theme: theme, index: index, playing: playing }; } };
})();