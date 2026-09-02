import json
import os
import tempfile

from aiohttp import web
from server import PromptServer
import folder_paths

from .adb_music_player import ADBMusicPlayer


def resolve_audio_directory(directory):
    if os.path.isabs(directory):
        return os.path.abspath(directory)
    return os.path.abspath(os.path.join(folder_paths.base_path, directory))


def metadata_path(audio_path):
    return f"{audio_path}.adb-music-player.json"


def read_metadata(audio_path):
    try:
        with open(metadata_path(audio_path), encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    except (OSError, ValueError):
        return {}
    return metadata if isinstance(metadata, dict) else {}


def write_metadata(audio_path, metadata):
    metadata_file_path = metadata_path(audio_path)
    metadata_directory = os.path.dirname(metadata_file_path)
    file_descriptor, temporary_path = tempfile.mkstemp(dir=metadata_directory, prefix=".adb-metadata-", text=True)
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as metadata_file:
            file_descriptor = None
            json.dump(metadata, metadata_file)
        os.replace(temporary_path, metadata_file_path)
    except Exception:
        if file_descriptor is not None:
            os.close(file_descriptor)
        try:
            os.unlink(temporary_path)
        except OSError:
            pass
        raise


@PromptServer.instance.routes.get("/adb-music-player/audio-files")
async def list_audio_files(request):
    audio_directory = resolve_audio_directory(request.query.get("directory", "output/audio"))
    audio_extensions = {".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".opus"}
    files = []

    for directory, _, filenames in os.walk(audio_directory):
        for filename in filenames:
            if os.path.splitext(filename)[1].lower() in audio_extensions:
                path = os.path.join(directory, filename)
                relative_path = os.path.relpath(path, audio_directory)
                metadata = read_metadata(path)
                files.append({
                    "name": relative_path.replace(os.path.sep, "/"),
                    "path": path,
                    "color": metadata.get("color"),
                    "downloaded": bool(metadata.get("downloaded", False)),
                })

    files.sort(key=lambda file: file["name"].casefold())
    return web.json_response(files)


@PromptServer.instance.routes.post("/adb-music-player/audio-metadata")
async def update_audio_metadata(request):
    path = request.query.get("path", "")
    if not path or not os.path.isfile(path):
        raise web.HTTPNotFound()

    try:
        payload = await request.json()
    except (json.JSONDecodeError, TypeError):
        raise web.HTTPBadRequest(text="Invalid metadata")
    if not isinstance(payload, dict):
        raise web.HTTPBadRequest(text="Invalid metadata")

    metadata = read_metadata(path)
    if "color" in payload:
        color = payload["color"]
        if color is not None and (not isinstance(color, str) or not color.startswith("#") or len(color) not in (4, 7)):
            raise web.HTTPBadRequest(text="Invalid color")
        metadata["color"] = color
    if payload.get("downloaded") is True:
        metadata["downloaded"] = True
    write_metadata(path, metadata)
    return web.json_response(metadata)


@PromptServer.instance.routes.get("/adb-music-player/audio-file")
async def serve_audio_file(request):
    path = request.query.get("path", "")
    if not path or not os.path.isfile(path):
        raise web.HTTPNotFound()
    return web.FileResponse(path)


@PromptServer.instance.routes.get("/adb-music-player/audio-download")
async def download_audio_file(request):
    path = request.query.get("path", "")
    if not path or not os.path.isfile(path):
        raise web.HTTPNotFound()
    metadata = read_metadata(path)
    metadata["downloaded"] = True
    write_metadata(path, metadata)
    return web.FileResponse(path, headers={"Content-Disposition": f'attachment; filename="{os.path.basename(path)}"'})


WEB_DIRECTORY = "./web"


NODE_CLASS_MAPPINGS = {
    "ADBMusicPlayer": ADBMusicPlayer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ADBMusicPlayer": "ADB Music Player",
}
