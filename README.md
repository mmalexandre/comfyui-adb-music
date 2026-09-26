# ComfyUI ADB Music Player

A small [ComfyUI](https://github.com/comfyanonymous/ComfyUI) custom node named **ADB Music Player**.

The node accepts an `AUDIO` input and saves it using ComfyUI's output naming convention. The filename prefix defaults to `audio/ComfyUI`, producing files such as `ComfyUI/output/audio/ComfyUI_00001.flac`. Entering `audio` as the filename prefix is shorthand for the same `output/audio` directory. Choose `flac`, `mp3`, or `opus`; the quality dropdown supports the MP3 V0/bitrate and Opus bitrate options. The audio is also passed through as the node output.
When ComfyUI provides the workflow, it is saved next to each audio file as `<audio-file>.workflow.json`, such as `myaudio.opus.workflow.json`.

The editor lists audio files recursively under the directory from the filename prefix. Use the refresh control after saving a new file, then use a row's play button to listen to it. Each row has a 16-color control, and clicking a filename downloads it and records that it was downloaded.

Adb Studio can upload an editable workflow to
`POST /adb-music-player/workflow`. The plugin stores it as
`output/audio/adbstudio-temp-workflow.json`. Opening ComfyUI with
`?adb-music-player=open-workflow` loads that file into the editor; the user can
then use ComfyUI's Save workflow action to choose a permanent filename.

Workflow upload/read and reference-audio upload require a Bearer token. Set
`ADB_MUSIC_PLAYER_API_TOKEN` in ComfyUI's environment before starting it, then
send `Authorization: Bearer <token>` with those requests. If the variable is
unset, the audio list and its playback, download, and color controls remain
available, but the workflow and reference-audio API endpoints reject requests.
Audio paths accepted by the plugin are restricted to ComfyUI's `output/`
directory.

### RunPod

For a RunPod ComfyUI template, open the Pod's **Edit Pod** settings and add
this environment variable:

```text
ADB_MUSIC_PLAYER_API_TOKEN=your-long-random-token
```

You can generate a token in the Pod terminal with:

```bash
openssl rand -hex 32
```

Save the Pod configuration and restart it so the ComfyUI process receives the
variable. You can verify it from the Pod terminal with:

```bash
echo "$ADB_MUSIC_PLAYER_API_TOKEN"
```

To open an Adb Studio workflow, append the token in the URL hash:

```text
https://YOUR-RUNPOD-COMFYUI-URL/?adb-music-player=open-workflow#adb-music-player-token=YOUR_TOKEN
```

The token must be in the URL hash, not the query string. The browser sends it
to ComfyUI as `Authorization: Bearer YOUR_TOKEN`.

Audio colors and download state are persisted in a sidecar file next to each audio file, named `<audio-file>.adb-music-player.json`. These metadata files are ignored by the audio list.
Each sidecar also stores the audio file's modification time and size; metadata is discarded automatically when the audio file changes.

## Install

Copy or clone this directory into ComfyUI's `custom_nodes` directory:

```text
ComfyUI/custom_nodes/AdbComfyUiPlayer/
```

Restart ComfyUI. The node is available in the `ADB` category as `ADB Music Player`.

## Files

- `adb_music_player.py` - ComfyUI node implementation.
- `__init__.py` - Node registration.
- `web/adb_music_player.js` - Frontend audio-file list and playback controls.