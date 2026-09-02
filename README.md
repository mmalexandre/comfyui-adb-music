# ComfyUI ADB Music Player

A small [ComfyUI](https://github.com/comfyanonymous/ComfyUI) custom node named **ADB Music Player**.

The node accepts a directory and returns it unchanged. By default, the ComfyUI editor lists audio files found recursively under `ComfyUI/audio` beneath the input. Relative directories are rooted at the ComfyUI directory; absolute paths are used as provided. Use the refresh control after saving a new file, then use a row's play button to listen to it.

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