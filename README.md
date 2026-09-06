# ComfyUI ADB Music Player

A small [ComfyUI](https://github.com/comfyanonymous/ComfyUI) custom node named **ADB Music Player**.

The node accepts an `AUDIO` input and saves it using ComfyUI's output naming convention. The filename prefix defaults to `audio/ComfyUI`, producing files such as `ComfyUI/output/audio/ComfyUI_00001.flac`. Entering `audio` as the filename prefix is shorthand for the same `output/audio` directory. Choose `flac`, `mp3`, or `opus`; the quality dropdown supports the MP3 V0/bitrate and Opus bitrate options. The audio is also passed through as the node output.
When ComfyUI provides the workflow, it is saved next to each audio file as `<audio-file>.workflow.json`, such as `myaudio.opus.workflow.json`.

The editor lists audio files recursively under the directory from the filename prefix. Use the refresh control after saving a new file, then use a row's play button to listen to it. Each row has a 16-color control, and clicking a filename downloads it and records that it was downloaded.

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