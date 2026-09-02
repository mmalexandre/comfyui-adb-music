import { app } from "../../scripts/app.js";

const LIST_URL = "/adb-music-player/audio-files";
const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;
const LIST_HEIGHT = 180;
const LIST_CHROME_HEIGHT = 40;

function audioUrl(path) {
    return `/adb-music-player/audio-file?path=${encodeURIComponent(path)}`;
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

        function resizeNode() {
            const width = Math.max(node.size[0], 240);
            node.setSize([width, Math.max(node.size[1], node.computeSize()[1])]);
        }

        function stopCurrent() {
            if (currentButton) {
                currentButton.textContent = "▶";
                currentButton = undefined;
            }
            audio.pause();
        }

        function playFile(file, button) {
            if (currentButton === button && !audio.paused) {
                stopCurrent();
                return;
            }

            stopCurrent();
            audio.src = audioUrl(file.path);
            audio.play().then(() => {
                currentButton = button;
                button.textContent = "Ⅱ";
            }).catch(() => {
                status.textContent = "Unable to play file";
            });
        }

        audio.addEventListener("ended", stopCurrent);

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
                row.style.cssText = `box-sizing:border-box;display:flex;align-items:center;gap:6px;min-height:26px;padding:2px 4px;background:${index % 2 === 0 ? "rgba(128,128,128,0.16)" : "transparent"}`;

                const label = document.createElement("span");
                label.textContent = file.name;
                label.title = file.name;
                label.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px";

                const playButton = document.createElement("button");
                playButton.type = "button";
                playButton.textContent = "▶";
                playButton.title = `Play ${file.name}`;
                playButton.style.cssText = "cursor:pointer;flex:0 0 30px;padding:2px 5px";
                playButton.addEventListener("click", () => playFile(file, playButton));

                row.append(label, playButton);
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
            refreshButton.disabled = true;
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
                refreshButton.disabled = false;
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
