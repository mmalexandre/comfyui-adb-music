import { app } from "../../scripts/app.js";

const LIST_URL = "/adb-music-player/audio-files";
const AUDIO_EXTENSIONS = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav)$/i;

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
        list.style.cssText = "display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto";
        container.append(list);

        const audio = new Audio();
        let currentButton;

        function resizeNode() {
            const width = Math.max(node.size[0], 240);
            node.setSize([width, node.computeSize()[1]]);
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
            for (const file of files) {
                const row = document.createElement("div");
                row.style.cssText = "display:flex;align-items:center;gap:6px;min-height:26px";

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

        async function refresh() {
            if (refreshInProgress) {
                return;
            }

            refreshInProgress = true;
            refreshButton.disabled = true;
            status.textContent = "Loading audio files...";
            try {
                const directory = node.widgets.find((item) => item.name === "directory")?.value || "audio";
                const response = await fetch(`${LIST_URL}?directory=${encodeURIComponent(directory)}`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const files = await response.json();
                render(files.filter((file) => AUDIO_EXTENSIONS.test(file.name)));
            } catch (error) {
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
        widget.computeSize = () => [node.size[0], Math.max(32, container.scrollHeight + 8)];
        await refresh();
    },
});
