"use strict";

const genres = [
  { id: "pop", name: "Pop", color: "#79436d" },
  { id: "rock", name: "Rock", color: "#854546" },
  { id: "hiphop", name: "Hip-Hop", color: "#895d36" },
  { id: "jazz", name: "Jazz", color: "#766035" },
  { id: "classical", name: "Classical", color: "#526477" },
  { id: "electronic", name: "Electronic", color: "#485b83" },
  { id: "rnb", name: "R&B", color: "#754c76" },
  { id: "country", name: "Country", color: "#776042" },
  { id: "reggae", name: "Reggae", color: "#416b53" },
  { id: "metal", name: "Metal", color: "#4d505a" },
  { id: "blues", name: "Blues", color: "#415b80" },
  { id: "folk", name: "Folk", color: "#596b44" },
  { id: "latin", name: "Latin", color: "#936045" },
  { id: "soul", name: "Soul", color: "#705380" },
  { id: "kpop", name: "K-Pop", color: "#955d80" },
  { id: "afrobeat", name: "Afrobeat", color: "#987140" },
  { id: "lofi", name: "Lo-Fi", color: "#515783" },
  { id: "gospel", name: "Gospel", color: "#887747" },
  { id: "indie", name: "Indie", color: "#3f736d" },
  { id: "ambient", name: "Ambient", color: "#4e7380" }
];

const $ = id => document.getElementById(id);
const audio = $("audio");

const state = {
  tracks: [],
  urls: new Map(),
  favorites: new Set(),
  genre: "all",
  favoritesOnly: false,
  currentId: null,
  queue: [],
  shuffle: false,
  repeat: false
};

let toastTimer;

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function genreName(id) {
  return genres.find(genre => genre.id === id)?.name || "Other";
}

function detectGenre(file) {
  const path = (file.webkitRelativePath || "").toLowerCase();
  const folders = path.split("/").slice(0, -1)
    .map(part => part.replace(/[^a-z0-9]/g, ""));

  return genres.find(genre =>
    folders.includes(genre.id.replace(/[^a-z0-9]/g, "")) ||
    folders.includes(genre.name.toLowerCase().replace(/[^a-z0-9]/g, ""))
  )?.id || "other";
}

function readName(file) {
  const base = file.name.replace(/\.[^.]+$/, "");
  const separator = base.indexOf(" - ");

  return separator === -1
    ? { title: base, artist: "Unknown artist" }
    : {
        artist: base.slice(0, separator).trim() || "Unknown artist",
        title: base.slice(separator + 3).trim() || base
      };
}

/* Save imported audio files in this browser. */
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("musoffed-library", 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore("tracks", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function databaseRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("tracks", mode);
    const request = action(transaction.objectStore("tracks"));

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function loadLibrary() {
  try {
    const db = await openDatabase();
    state.tracks = await databaseRequest(db, "readonly", store => store.getAll());
    db.close();
    render();
  } catch (error) {
    console.error(error);
    notify("Could not open browser storage. Try a local server.");
  }
}

async function importFiles(fileList) {
  const files = Array.from(fileList).filter(file =>
    file.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)
  );

  if (!files.length) {
    notify("No supported audio files were selected.");
    return;
  }

  try {
    const db = await openDatabase();
    let added = 0;

    for (const file of files) {
      const id = `${file.webkitRelativePath || file.name}|${file.size}|${file.lastModified}`;
      if (state.tracks.some(track => track.id === id)) continue;

      const track = {
        id,
        ...readName(file),
        genre: detectGenre(file),
        file
      };

      await databaseRequest(db, "readwrite", store => store.put(track));
      state.tracks.push(track);
      added++;
    }

    db.close();
    render();
    notify(added ? `Added ${added} track${added === 1 ? "" : "s"}.` : "Those tracks are already in your library.");
  } catch (error) {
    console.error(error);
    notify("Import failed. Your browser may be out of storage space.");
  }
}

function filteredTracks() {
  const search = $("searchInput").value.trim().toLowerCase();

  return state.tracks.filter(track => {
    if (state.genre !== "all" && track.genre !== state.genre) return false;
    if (state.favoritesOnly && !state.favorites.has(track.id)) return false;

    return `${track.title} ${track.artist} ${genreName(track.genre)}`
      .toLowerCase().includes(search);
  });
}

function renderGenres() {
  const grid = $("genreGrid");
  grid.replaceChildren();

  for (const genre of genres) {
    const button = document.createElement("button");
    const count = state.tracks.filter(track => track.genre === genre.id).length;

    button.type = "button";
    button.className = `genre-card${state.genre === genre.id ? " active" : ""}`;
    button.style.setProperty("--genre-color", genre.color);
    button.textContent = genre.name;

    const small = document.createElement("small");
    small.textContent = `${count} track${count === 1 ? "" : "s"}`;
    button.append(small);

    button.addEventListener("click", () => {
      state.genre = state.genre === genre.id ? "all" : genre.id;
      render();
    });

    grid.append(button);
  }
}

function renderTracks() {
  const tracks = filteredTracks();
  const list = $("trackList");
  list.replaceChildren();

  $("tracksHeading").textContent = state.favoritesOnly
    ? "Favorites"
    : state.genre === "all" ? "All tracks" : `${genreName(state.genre)} tracks`;

  $("trackCount").textContent = `${tracks.length} track${tracks.length === 1 ? "" : "s"}`;
  $("emptyState").hidden = tracks.length > 0;
  $("clearLibraryBtn").hidden = state.tracks.length === 0;

  tracks.forEach((track, index) => {
    const row = document.createElement("div");
    row.className = `track-row${track.id === state.currentId ? " active" : ""}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Play ${track.title} by ${track.artist}`);

    const number = document.createElement("span");
    number.className = "track-number";
    number.textContent = String(index + 1);

    const info = document.createElement("div");
    info.className = "track-info";

    const name = document.createElement("span");
    name.className = "track-name";
    name.textContent = track.title;

    const artist = document.createElement("span");
    artist.className = "track-artist";
    artist.textContent = track.artist;
    info.append(name, artist);

    const genre = document.createElement("span");
    genre.className = "track-genre";
    genre.textContent = genreName(track.genre);

    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = `row-favorite${state.favorites.has(track.id) ? " active" : ""}`;
    favorite.textContent = state.favorites.has(track.id) ? "♥" : "♡";
    favorite.setAttribute("aria-label", `Toggle favorite for ${track.title}`);
    favorite.addEventListener("click", event => {
      event.stopPropagation();
      toggleFavorite(track.id);
    });

    row.append(number, info, genre, favorite);
    row.addEventListener("click", () => playTrack(track.id, tracks.map(item => item.id)));
    row.addEventListener("keydown", event => {
      if (event.target !== row) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        playTrack(track.id, tracks.map(item => item.id));
      }
    });

    list.append(row);
  });
}

function render() {
  $("allBtn").classList.toggle("selected", !state.favoritesOnly);
  $("favoritesBtn").classList.toggle("selected", state.favoritesOnly);
  renderGenres();
  renderTracks();
  updateFavoriteButton();
}

function updateFavoriteButton() {
  const active = !!state.currentId && state.favorites.has(state.currentId);
  $("playerFavorite").classList.toggle("active", active);
  $("playerFavorite").textContent = active ? "♥" : "♡";
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);

  localStorage.setItem("musoffed-favorites", JSON.stringify([...state.favorites]));
  render();
}

function playTrack(id, queue = state.queue) {
  const track = state.tracks.find(item => item.id === id);
  if (!track) return;

  state.queue = queue;
  state.currentId = id;

  if (!state.urls.has(id)) {
    state.urls.set(id, URL.createObjectURL(track.file));
  }

  audio.src = state.urls.get(id);
  $("playerTitle").textContent = track.title;
  $("playerArtist").textContent = track.artist;
  $("cover").textContent = track.title.charAt(0).toUpperCase() || "M";
  $("progressBar").value = 0;
  $("duration").textContent = "0:00";

  render();
  audio.play().catch(() => notify("This file could not be played by your browser."));
}

function moveTrack(direction) {
  if (!state.queue.length) return;

  const currentIndex = state.queue.indexOf(state.currentId);
  let nextIndex = (currentIndex + direction + state.queue.length) % state.queue.length;

  if (state.shuffle && direction === 1 && state.queue.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * state.queue.length);
    } while (nextIndex === currentIndex);
  }

  playTrack(state.queue[nextIndex]);
}

function resetPlayer() {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  state.currentId = null;
  state.queue = [];
  $("playerTitle").textContent = "Nothing playing";
  $("playerArtist").textContent = "Choose a track";
  $("cover").textContent = "M";
  $("currentTime").textContent = "0:00";
  $("duration").textContent = "0:00";
  $("progressBar").value = 0;
  $("playBtn").textContent = "▶";
  $("playBtn").setAttribute("aria-label", "Play");
}

function savedFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem("musoffed-favorites") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

/* Buttons and player events */
$("importFilesBtn").onclick = () => $("fileInput").click();
$("heroImportBtn").onclick = () => $("fileInput").click();
$("emptyImportBtn").onclick = () => $("fileInput").click();
$("importFolderBtn").onclick = () => $("folderInput").click();

for (const id of ["fileInput", "folderInput"]) {
  $(id).addEventListener("change", event => {
    importFiles(event.target.files);
    event.target.value = "";
  });
}

$("allBtn").onclick = () => { state.favoritesOnly = false; render(); };
$("favoritesBtn").onclick = () => { state.favoritesOnly = true; render(); };
$("clearGenreBtn").onclick = () => { state.genre = "all"; render(); };
$("searchInput").addEventListener("input", renderTracks);

$("playerFavorite").onclick = () => {
  if (state.currentId) toggleFavorite(state.currentId);
};

$("playBtn").onclick = () => {
  if (!state.currentId) {
    const first = filteredTracks();
    if (first.length) playTrack(first[0].id, first.map(track => track.id));
    return;
  }

  if (audio.paused) audio.play().catch(() => notify("Could not play this track."));
  else audio.pause();
};

$("previousBtn").onclick = () => {
  if (audio.currentTime > 3) audio.currentTime = 0;
  else moveTrack(-1);
};
$("nextBtn").onclick = () => moveTrack(1);

$("shuffleBtn").onclick = () => {
  state.shuffle = !state.shuffle;
  $("shuffleBtn").classList.toggle("active", state.shuffle);
};

$("repeatBtn").onclick = () => {
  state.repeat = !state.repeat;
  $("repeatBtn").classList.toggle("active", state.repeat);
};

$("volumeBar").addEventListener("input", event => {
  audio.volume = Number(event.target.value) / 100;
});

$("progressBar").addEventListener("input", event => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Number(event.target.value) / 100 * audio.duration;
  }
});

audio.addEventListener("play", () => {
  $("playBtn").textContent = "Ⅱ";
  $("playBtn").setAttribute("aria-label", "Pause");
});
audio.addEventListener("pause", () => {
  $("playBtn").textContent = "▶";
  $("playBtn").setAttribute("aria-label", "Play");
});
audio.addEventListener("loadedmetadata", () => {
  $("duration").textContent = formatTime(audio.duration);
});
audio.addEventListener("timeupdate", () => {
  $("currentTime").textContent = formatTime(audio.currentTime);
  $("progressBar").value = Number.isFinite(audio.duration) && audio.duration > 0
    ? String(audio.currentTime / audio.duration * 100)
    : "0";
});
audio.addEventListener("ended", () => {
  if (state.repeat) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    moveTrack(1);
  }
});
audio.addEventListener("error", () => {
  if (state.currentId) notify("Unable to play this file. Try another format.");
});

$("clearLibraryBtn").onclick = async () => {
  if (!confirm("Remove all imported tracks from this browser?")) return;

  try {
    const db = await openDatabase();
    await databaseRequest(db, "readwrite", store => store.clear());
    db.close();

    resetPlayer();
    for (const url of state.urls.values()) URL.revokeObjectURL(url);
    state.urls.clear();
    state.tracks = [];
    state.favorites.clear();
    localStorage.removeItem("musoffed-favorites");
    render();
    notify("Library cleared.");
  } catch (error) {
    console.error(error);
    notify("Could not clear the library.");
  }
};

audio.volume = 0.8;
state.favorites = savedFavorites();
render();
loadLibrary();