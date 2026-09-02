import { app } from "../../scripts/app.js";

const LIST_URL = "/adb-music-player/audio-files";
const METADATA_URL = "/adb-music-player/audio-metadata";
const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;
const COLOR_PALETTE = [
    "#5b5b5b", "#a6a6a6", "#d94f4f", "#e58f2a",
    "#d6b52c", "#66a34a", "#39a89e", "#3b9fc4",
    "#4f78c4", "#6d5acb", "#a052b5", "#d45d9a",
    "#c87954", "#8d6e63", "#78909c", "#f0f0f0",
];
const LIST_HEIGHT = 180;
const LIST_CHROME_HEIGHT = 68;

const progressStyles = document.createElement("style");
progressStyles.textContent = `
    .adb-music-player-progress {
        --progress: 0%;
        accent-color: #fff;
    }
    .adb-music-player-progress::-webkit-slider-runnable-track {
        background: linear-gradient(to right, #fff var(--progress), var(--descrip-text) var(--progress));
        border-radius: 2px;
        height: 3px;
    }
    .adb-music-player-progress::-webkit-slider-thumb {
        appearance: none;
        background: transparent;
        border: 0;
        height: 12px;
        margin-top: -6.5px;
        opacity: 0;
        width: 12px;
    }
    .adb-music-player-progress:hover::-webkit-slider-thumb {
        background: #fff;
        opacity: 1;
    }
    .adb-music-player-progress::-moz-range-track {
        background: var(--descrip-text);
        border-radius: 2px;
        height: 3px;
    }
    .adb-music-player-progress::-moz-range-progress {
        background: #fff;
        border-radius: 2px;
        height: 3px;
    }
    .adb-music-player-progress::-moz-range-thumb {
        background: transparent;
        border: 0;
        height: 12px;
        opacity: 0;
        width: 12px;
    }
    .adb-music-player-progress:hover::-moz-range-thumb {
        background: #fff;
        opacity: 1;
    }
`;
document.head.append(progressStyles);

function audioUrl(path) {
    return `/adb-music-player/audio-file?path=${encodeURIComponent(path)}`;
}

function downloadUrl(path) {
    return `/adb-music-player/audio-download?path=${encodeURIComponent(path)}`;
}

function tintedColor(color) {
    if (!COLOR_PALETTE.includes(color)) {
        return "";
    }
    return `${color}33`;
}

app.registerExtension({
    name: "ADB.MusicPlayer",

    async nodeCreated(node) {
        if (node.comfyClass !== "ADBMusicPlayer") {
            return;
        }

        const container = document.createElement("div");
        container.style.cssText = [
            "box-sizing: border-box",
            "display: flex",
            "flex-direction: column",
            "gap: 4px",
            "padding: 4px 0",
            "width: 100%",
        ].join(";");

        const header = document.createElement("div");
        header.style.cssText = "display:flex;align-items:center;justify-content:space-between;min-height:24px";

        const status = document.createElement("span");
        status.style.cssText = "color:var(--descrip-text);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        header.append(status);

        const refreshButton = document.createElement("button");
        refreshButton.type = "button";
        refreshButton.textContent = "↻";
        refreshButton.title = "Refresh audio files";
        refreshButton.style.cssText = "cursor:pointer;font-size:16px;line-height:20px;padding:0 6px";
        header.append(refreshButton);
        container.append(header);

        const filterInput = document.createElement("input");
        filterInput.type = "search";
        filterInput.placeholder = "Filter files";
        filterInput.title = "Filter audio files";
        filterInput.setAttribute("aria-label", "Filter audio files");
        filterInput.style.cssText = "box-sizing:border-box;min-height:24px;padding:2px 4px;width:100%";
        container.append(filterInput);

        const list = document.createElement("div");
        list.style.cssText = `box-sizing:border-box;display:flex;flex-direction:column;gap:2px;height:${LIST_HEIGHT}px;min-height:0;overflow-y:auto;padding:2px 0`;
        container.append(list);

        const audio = new Audio();
        let currentButton;
        let currentProgress;
        let currentTimeLabel;
        let currentDurationLabel;
        let currentFilePath;
        let pendingSeekFraction;

        function formatTime(seconds) {
            if (!Number.isFinite(seconds) || seconds < 0) {
                return "0:00";
            }
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
            return `${minutes}:${remainingSeconds}`;
        }

        function updateProgress() {
            if (!currentProgress) {
                return;
            }
            if (Number.isFinite(audio.duration)) {
                currentProgress.max = audio.duration;
            }
            currentProgress.value = audio.currentTime;
            const progressFraction = audio.duration > 0 ? audio.currentTime / audio.duration : 0;
            currentProgress.style.setProperty("--progress", `${progressFraction * 100}%`);
            currentTimeLabel.textContent = formatTime(audio.currentTime);
            currentDurationLabel.textContent = formatTime(audio.duration);
        }

        function resizeNode() {
            const width = Math.max(node.size[0], 240);
            node.setSize([width, Math.max(node.size[1], node.computeSize()[1])]);
        }

        function stopCurrent() {
            if (currentButton) {
                currentButton.textContent = "▶";
                currentButton = undefined;
            }
            if (currentProgress) {
                currentProgress.value = 0;
                currentTimeLabel.textContent = "0:00";
                currentDurationLabel.textContent = "0:00";
                currentProgress = undefined;
                currentTimeLabel = undefined;
                currentDurationLabel = undefined;
            }
            currentFilePath = undefined;
            pendingSeekFraction = undefined;
            audio.pause();
        }

        function playFile(file, button, progress, timeLabel, durationLabel, startFraction) {
            if (currentButton === button && !audio.paused) {
                stopCurrent();
                return;
            }

            stopCurrent();
            currentFilePath = file.path;
            pendingSeekFraction = Number.isFinite(startFraction) ? startFraction : undefined;
            audio.src = audioUrl(file.path);
            audio.play().then(() => {
                currentButton = button;
                currentProgress = progress;
                currentTimeLabel = timeLabel;
                currentDurationLabel = durationLabel;
                button.textContent = "Ⅱ";
                if (pendingSeekFraction !== undefined && Number.isFinite(audio.duration)) {
                    audio.currentTime = pendingSeekFraction * audio.duration;
                    pendingSeekFraction = undefined;
                }
                updateProgress();
            }).catch(() => {
                status.textContent = "Unable to play file";
            });
        }

        audio.addEventListener("ended", stopCurrent);
        audio.addEventListener("timeupdate", updateProgress);
        audio.addEventListener("loadedmetadata", () => {
            if (pendingSeekFraction !== undefined && currentProgress && Number.isFinite(audio.duration)) {
                audio.currentTime = pendingSeekFraction * audio.duration;
                pendingSeekFraction = undefined;
            }
            updateProgress();
        });

        function render(files) {
            const activeFilePath = currentFilePath;
            currentButton = undefined;
            currentProgress = undefined;
            currentTimeLabel = undefined;
            currentDurationLabel = undefined;
            list.replaceChildren();
            if (!files.length) {
                status.textContent = filterInput.value ? "No matching audio files" : "No audio files";
                resizeNode();
                return;
            }

            status.textContent = `${files.length} audio file${files.length === 1 ? "" : "s"}`;
            let openPalette;
            for (const [index, file] of files.entries()) {
                const row = document.createElement("div");
                row.style.cssText = `box-sizing:border-box;display:flex;align-items:center;gap:6px;min-height:26px;padding:2px 4px;position:relative;background:${tintedColor(file.color) || (index % 2 === 0 ? "rgba(128,128,128,0.16)" : "transparent")}`;

                const colorButton = document.createElement("button");
                colorButton.type = "button";
                colorButton.title = `Set color for ${file.name}`;
                colorButton.setAttribute("aria-label", `Set color for ${file.name}`);
                colorButton.style.cssText = `background:${COLOR_PALETTE.includes(file.color) ? file.color : "transparent"};border:2px solid ${COLOR_PALETTE.includes(file.color) ? file.color : "var(--descrip-text)"};border-radius:50%;cursor:pointer;flex:0 0 14px;height:14px;padding:0;width:14px`;

                const palette = document.createElement("div");
                palette.style.cssText = "background:var(--comfy-menu-bg);border:1px solid var(--border-color);box-shadow:0 3px 8px rgba(0,0,0,0.35);display:none;grid-template-columns:repeat(4,18px);gap:5px;padding:6px;position:absolute;left:2px;top:22px;z-index:2";
                for (const color of COLOR_PALETTE) {
                    const swatch = document.createElement("button");
                    swatch.type = "button";
                    swatch.title = color;
                    swatch.setAttribute("aria-label", color);
                    swatch.style.cssText = `background:${color};border:${file.color === color ? "2px solid var(--fg-color)" : "1px solid rgba(255,255,255,0.5)"};border-radius:50%;cursor:pointer;height:18px;padding:0;width:18px`;
                    swatch.addEventListener("click", async () => {
                        file.color = color;
                        palette.style.display = "none";
                        openPalette = undefined;
                        row.style.background = tintedColor(file.color);
                        colorButton.style.background = file.color;
                        colorButton.style.borderColor = file.color;
                        try {
                            const response = await fetch(`${METADATA_URL}?path=${encodeURIComponent(file.path)}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ color: file.color }),
                            });
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                        } catch (error) {
                            status.textContent = "Could not save file color";
                            console.error("ADB Music Player: failed to save file color", error);
                        }
                    });
                    palette.append(swatch);
                }

                colorButton.addEventListener("click", (event) => {
                    event.stopPropagation();
                    if (openPalette && openPalette !== palette) {
                        openPalette.style.display = "none";
                    }
                    const isOpening = palette.style.display === "none";
                    palette.style.display = isOpening ? "grid" : "none";
                    openPalette = isOpening ? palette : undefined;
                });
                row.append(colorButton, palette);

                const label = document.createElement("a");
                label.href = downloadUrl(file.path);
                label.download = file.name;
                label.textContent = file.name;
                label.title = file.name;
                label.style.cssText = `color:var(--fg-color);cursor:pointer;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;text-decoration:${file.downloaded ? "underline" : "none"}`;
                label.addEventListener("mouseenter", () => { if (!file.downloaded) label.style.textDecoration = "underline"; });
                label.addEventListener("mouseleave", () => { if (!file.downloaded) label.style.textDecoration = "none"; });
                label.addEventListener("click", () => {
                    file.downloaded = true;
                    label.style.textDecoration = "underline";
                });

                const playback = document.createElement("div");
                playback.style.cssText = "display:flex;flex:0 1 345px;flex-direction:column;gap:1px;min-width:70px";

                const progress = document.createElement("input");
                progress.type = "range";
                progress.min = "0";
                progress.max = "0";
                progress.step = "0.1";
                progress.value = "0";
                progress.title = `Seek ${file.name}`;
                progress.className = "adb-music-player-progress";
                progress.style.cssText = "box-sizing:border-box;cursor:pointer;height:12px;margin:0;width:100%";

                const timeRow = document.createElement("div");
                timeRow.style.cssText = "display:flex;justify-content:space-between;color:var(--descrip-text);font-size:9px;line-height:10px";

                const timeLabel = document.createElement("span");
                timeLabel.textContent = "0:00";
                const durationLabel = document.createElement("span");
                durationLabel.textContent = "0:00";
                timeRow.append(timeLabel, durationLabel);
                playback.append(progress, timeRow);

                progress.addEventListener("input", () => {
                    if (currentProgress === progress && Number.isFinite(audio.duration)) {
                        audio.currentTime = Number(progress.value);
                        updateProgress();
                    }
                });
                progress.addEventListener("click", (event) => {
                    if (currentProgress === progress) {
                        return;
                    }
                    const bounds = progress.getBoundingClientRect();
                    const fraction = bounds.width > 0
                        ? Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
                        : 0;
                    playFile(file, playButton, progress, timeLabel, durationLabel, fraction);
                });

                const playButton = document.createElement("button");
                playButton.type = "button";
                playButton.textContent = "▶";
                playButton.title = `Play ${file.name}`;
                playButton.style.cssText = "cursor:pointer;flex:0 0 30px;padding:2px 5px";
                playButton.addEventListener("click", () => playFile(file, playButton, progress, timeLabel, durationLabel));

                if (file.path === activeFilePath) {
                    currentButton = playButton;
                    currentProgress = progress;
                    currentTimeLabel = timeLabel;
                    currentDurationLabel = durationLabel;
                    playButton.textContent = audio.paused ? "▶" : "Ⅱ";
                    updateProgress();
                }

                row.append(label, playback, playButton);
                list.append(row);
            }
            resizeNode();
        }

        let refreshInProgress = false;
        let lastFilesSignature;
        let files = [];

        function renderFilteredFiles() {
            const filter = filterInput.value.trim().toLocaleLowerCase();
            render(filter ? files.filter((file) => file.name.toLocaleLowerCase().includes(filter)) : files);
        }

        async function refresh() {
            if (refreshInProgress) {
                return;
            }

            refreshInProgress = true;
            try {
                const directory = node.widgets.find((item) => item.name === "directory")?.value || "audio";
                const response = await fetch(`${LIST_URL}?directory=${encodeURIComponent(directory)}`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                files = (await response.json()).filter((file) => AUDIO_EXTENSIONS.test(file.name));
                const filesSignature = JSON.stringify(files);
                if (filesSignature !== lastFilesSignature) {
                    lastFilesSignature = filesSignature;
                    renderFilteredFiles();
                }
            } catch (error) {
                status.textContent = "Could not refresh audio files";
                console.error("ADB Music Player: failed to load audio files", error);
            } finally {
                refreshInProgress = false;
            }
        }

        filterInput.addEventListener("input", renderFilteredFiles);
        refreshButton.addEventListener("click", refresh);
        const refreshInterval = setInterval(refresh, 2000);
        node.onRemoved = () => clearInterval(refreshInterval);
        const directoryWidget = node.widgets.find((item) => item.name === "directory");
        if (directoryWidget) {
            const originalCallback = directoryWidget.callback;
            directoryWidget.callback = (value) => {
                originalCallback?.(value);
                refresh();
            };
        }
        const widget = node.addDOMWidget("audio_files", "audio_files", container, {
            serialize: false,
            hideOnZoom: false,
        });
        let listHeight = LIST_HEIGHT;
        widget.computeSize = () => [node.size[0], listHeight + LIST_CHROME_HEIGHT];
        const minimumNodeHeight = node.computeSize()[1];
        const originalOnResize = node.onResize;
        node.onResize = (size) => {
            originalOnResize?.(size);
            size[1] = Math.max(size[1], minimumNodeHeight);
            listHeight = LIST_HEIGHT + Math.max(0, size[1] - minimumNodeHeight);
            list.style.height = `${listHeight}px`;
        };
        await refresh();
    },
});
