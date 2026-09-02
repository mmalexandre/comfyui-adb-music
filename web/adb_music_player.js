import { app } from "../../scripts/app.js";

const LIST_URL = "/adb-music-player/audio-files";
const METADATA_URL = "/adb-music-player/audio-metadata";
const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;
const LIST_HEIGHT = 180;
const LIST_CHROME_HEIGHT = 40;

function audioUrl(path) {
    return `/adb-music-player/audio-file?path=${encodeURIComponent(path)}`;
}

function downloadUrl(path) {
    return `/adb-music-player/audio-download?path=${encodeURIComponent(path)}`;
}

function tintedColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) {
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

        const list = document.createElement("div");
        list.style.cssText = `box-sizing:border-box;display:flex;flex-direction:column;gap:2px;height:${LIST_HEIGHT}px;min-height:0;overflow-y:auto;padding:2px 0`;
        container.append(list);

        const audio = new Audio();
        let currentButton;
        let currentProgress;
        let currentTimeLabel;
        let currentDurationLabel;

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
            audio.pause();
        }

        function playFile(file, button, progress, timeLabel, durationLabel) {
            if (currentButton === button && !audio.paused) {
                stopCurrent();
                return;
            }

            stopCurrent();
            audio.src = audioUrl(file.path);
            audio.play().then(() => {
                currentButton = button;
                currentProgress = progress;
                currentTimeLabel = timeLabel;
                currentDurationLabel = durationLabel;
                button.textContent = "Ⅱ";
                updateProgress();
            }).catch(() => {
                status.textContent = "Unable to play file";
            });
        }

        audio.addEventListener("ended", stopCurrent);
        audio.addEventListener("timeupdate", updateProgress);
        audio.addEventListener("loadedmetadata", updateProgress);

        function render(files) {
            list.replaceChildren();
            if (!files.length) {
                status.textContent = "No audio files";
                resizeNode();
                return;
            }

            status.textContent = `${files.length} audio file${files.length === 1 ? "" : "s"}`;
            for (const [index, file] of files.entries()) {
                const row = document.createElement("div");
                row.style.cssText = `box-sizing:border-box;display:flex;align-items:center;gap:6px;min-height:26px;padding:2px 4px;background:${tintedColor(file.color) || (index % 2 === 0 ? "rgba(128,128,128,0.16)" : "transparent")}`;

                const colorPicker = document.createElement("input");
                colorPicker.type = "color";
                colorPicker.value = /^#[0-9a-f]{6}$/i.test(file.color || "") ? file.color : "#808080";
                colorPicker.tabIndex = -1;
                colorPicker.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:1px;height:1px";

                const colorButton = document.createElement("button");
                colorButton.type = "button";
                colorButton.title = `Set color for ${file.name}`;
                colorButton.style.cssText = `background:${file.color || "transparent"};border:2px solid ${file.color || "var(--descrip-text)"};border-radius:50%;cursor:pointer;flex:0 0 14px;height:14px;padding:0;width:14px`;
                colorButton.addEventListener("click", () => colorPicker.click());
                colorPicker.addEventListener("input", async () => {
                    file.color = colorPicker.value;
                    row.style.background = tintedColor(file.color);
                    colorButton.style.background = file.color;
                    colorButton.style.borderColor = file.color;
                    try {
                        await fetch(`${METADATA_URL}?path=${encodeURIComponent(file.path)}`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ color: file.color }),
                        });
                    } catch (error) {
                        status.textContent = "Could not save file color";
                        console.error("ADB Music Player: failed to save file color", error);
                    }
                });

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

                const playButton = document.createElement("button");
                playButton.type = "button";
                playButton.textContent = "▶";
                playButton.title = `Play ${file.name}`;
                playButton.style.cssText = "cursor:pointer;flex:0 0 30px;padding:2px 5px";
                playButton.addEventListener("click", () => playFile(file, playButton, progress, timeLabel, durationLabel));

                row.append(colorButton, colorPicker, label, playback, playButton);
                list.append(row);
            }
            resizeNode();
        }

        let refreshInProgress = false;
        let lastFilesSignature;

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
                const files = (await response.json()).filter((file) => AUDIO_EXTENSIONS.test(file.name));
                const filesSignature = JSON.stringify(files);
                if (filesSignature !== lastFilesSignature) {
                    lastFilesSignature = filesSignature;
                    render(files);
                }
            } catch (error) {
                lastFilesSignature = undefined;
                list.replaceChildren();
                status.textContent = "Could not load audio files";
                resizeNode();
                console.error("ADB Music Player: failed to load audio files", error);
            } finally {
                refreshInProgress = false;
            }
        }

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
            hideOnZoom: true,
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
