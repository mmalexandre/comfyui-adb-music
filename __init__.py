import os

from aiohttp import web
from server import PromptServer
import folder_paths

from .adb_music_player import ADBMusicPlayer


def resolve_audio_directory(directory):
    if os.path.isabs(directory):
        return os.path.abspath(directory)
    return os.path.abspath(os.path.join(folder_paths.base_path, directory))


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
                files.append({
                    "name": relative_path.replace(os.path.sep, "/"),
                    "path": path,
                })

    files.sort(key=lambda file: file["name"].casefold())
    return web.json_response(files)


@PromptServer.instance.routes.get("/adb-music-player/audio-file")
async def serve_audio_file(request):
    path = request.query.get("path", "")
    if not path or not os.path.isfile(path):
        raise web.HTTPNotFound()
    return web.FileResponse(path)


WEB_DIRECTORY = "./web"


NODE_CLASS_MAPPINGS = {
    "ADBMusicPlayer": ADBMusicPlayer,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ADBMusicPlayer": "ADB Music Player",
}
