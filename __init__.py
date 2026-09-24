import json
import hashlib
import hmac
import os
import tempfile

from aiohttp import web
from server import PromptServer
import folder_paths

from .adb_music_player import ADBMusicPlayer

COLOR_PALETTE = {
    "#5b5b5b", "#a6a6a6", "#d94f4f", "#e58f2a",
    "#d6b52c", "#66a34a", "#39a89e", "#3b9fc4",
    "#4f78c4", "#6d5acb", "#a052b5", "#d45d9a",
    "#c87954", "#8d6e63", "#78909c", "#f0f0f0",
}
TEMP_WORKFLOW_FILENAME = "adbstudio-temp-workflow.json"
REFERENCE_AUDIO_DIRECTORY = os.path.join("adb-studio", "reference-audio")
REFERENCE_AUDIO_EXTENSIONS = {".aac", ".aiff", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a", ".aac", ".opus"}
API_TOKEN_ENVIRONMENT_VARIABLE = "ADB_MUSIC_PLAYER_API_TOKEN"


def temporary_workflow_path():
    return os.path.join(folder_paths.get_output_directory(), "audio", TEMP_WORKFLOW_FILENAME)


def output_directory():
    return os.path.realpath(folder_paths.get_output_directory())


def resolve_output_path(path):
    path = path.replace("\\", "/")
    if os.path.isabs(path):
        candidate = path
    else:
        relative_path = path.strip("/")
        if relative_path == "output":
            relative_path = ""
        elif relative_path.startswith("output/"):
            relative_path = relative_path[len("output/"):]
        candidate = os.path.join(output_directory(), relative_path)

    resolved_path = os.path.realpath(candidate)
    output_root = output_directory()
    try:
        inside_output = os.path.commonpath((output_root, resolved_path)) == output_root
    except ValueError:
        inside_output = False
    if not inside_output:
        raise web.HTTPForbidden(text="Path must be inside the ComfyUI output directory")
    return resolved_path


def resolve_audio_directory(directory):
    return resolve_output_path(directory)


def resolve_audio_file(path):
    audio_path = resolve_output_path(path)
    if not os.path.isfile(audio_path) or os.path.splitext(audio_path)[1].lower() not in AUDIO_EXTENSIONS:
        raise web.HTTPNotFound()
    return audio_path


def require_api_token(request):
    configured_token = os.environ.get(API_TOKEN_ENVIRONMENT_VARIABLE, "").strip()
    authorization = request.headers.get("Authorization", "")
    scheme, separator, provided_token = authorization.partition(" ")
    token = provided_token.strip() if separator and scheme.lower() == "bearer" else ""
    if not configured_token or not hmac.compare_digest(token, configured_token):
        raise web.HTTPUnauthorized(
            text=f"Set {API_TOKEN_ENVIRONMENT_VARIABLE} and provide it as a Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def metadata_path(audio_path):
    return f"{audio_path}.adb-music-player.json"


def audio_identity(audio_path):
    audio_stat = os.stat(audio_path)
    return {
        "file_mtime_ns": audio_stat.st_mtime_ns,
        "file_size": audio_stat.st_size,
    }


def audio_checksum(audio_path):
    digest = hashlib.sha256()
    with open(audio_path, "rb") as audio_file:
        for chunk in iter(lambda: audio_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reference_audio_path(checksum, extension):
    return os.path.join(
        folder_paths.get_input_directory(),
        REFERENCE_AUDIO_DIRECTORY,
        f"{checksum}{extension}",
    )


def valid_checksum(value):
    return isinstance(value, str) and len(value) == 64 and all(
        character in "0123456789abcdefABCDEF" for character in value
    )


def read_metadata(audio_path):
    try:
        identity = audio_identity(audio_path)
        with open(metadata_path(audio_path), encoding="utf-8") as metadata_file:
            metadata = json.load(metadata_file)
    except (OSError, ValueError):
        return {}
    if not isinstance(metadata, dict):
        return {}
    if metadata.get("file_mtime_ns") != identity["file_mtime_ns"] or metadata.get("file_size") != identity["file_size"]:
        return {}
    return metadata


def write_metadata(audio_path, metadata):
    metadata.update(audio_identity(audio_path))
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
    files = []

    for directory, _, filenames in os.walk(audio_directory):
        for filename in filenames:
            if os.path.splitext(filename)[1].lower() in AUDIO_EXTENSIONS:
                path = os.path.join(directory, filename)
                path = resolve_audio_file(path)
                relative_path = os.path.relpath(path, output_directory())
                metadata = read_metadata(path)
                checksum = metadata.get("checksum")
                if not isinstance(checksum, str) or not checksum:
                    checksum = audio_checksum(path)
                    metadata["checksum"] = checksum
                    write_metadata(path, metadata)
                modified = os.stat(path).st_mtime_ns
                files.append((modified, {
                    "name": relative_path.replace(os.path.sep, "/"),
                    "path": relative_path.replace(os.path.sep, "/"),
                    "modified": modified,
                    "checksum": checksum,
                    "color": metadata.get("color") if metadata.get("color") in COLOR_PALETTE else None,
                    "downloaded": bool(metadata.get("downloaded", False)),
                }))

    files.sort(key=lambda item: item[0])
    return web.json_response([file for _, file in files])


@PromptServer.instance.routes.post("/adb-music-player/workflow")
async def upload_workflow(request):
    require_api_token(request)
    try:
        workflow = await request.json()
    except (json.JSONDecodeError, TypeError):
        raise web.HTTPBadRequest(text="Invalid workflow JSON")
    if not isinstance(workflow, dict):
        raise web.HTTPBadRequest(text="Workflow must be a JSON object")

    workflow_path = temporary_workflow_path()
    os.makedirs(os.path.dirname(workflow_path), exist_ok=True)
    file_descriptor, temporary_path = tempfile.mkstemp(
        dir=os.path.dirname(workflow_path), prefix=".adb-workflow-", text=True
    )
    try:
        with os.fdopen(file_descriptor, "w", encoding="utf-8") as workflow_file:
            file_descriptor = None
            json.dump(workflow, workflow_file, indent=2)
            workflow_file.write("\n")
        os.replace(temporary_path, workflow_path)
    except Exception:
        if file_descriptor is not None:
            os.close(file_descriptor)
        try:
            os.unlink(temporary_path)
        except OSError:
            pass
        raise
    return web.json_response({"filename": TEMP_WORKFLOW_FILENAME})


@PromptServer.instance.routes.post("/adb-music-player/reference-audio/ensure")
async def ensure_reference_audio(request):
    require_api_token(request)
    reader = await request.multipart()
    fields = {}
    temporary_path = None
    try:
        while True:
            field = await reader.next()
            if field is None:
                break
            if field.name == "file":
                if temporary_path is not None:
                    raise web.HTTPBadRequest(text="Only one reference audio file is allowed")
                os.makedirs(folder_paths.get_input_directory(), exist_ok=True)
                file_descriptor, temporary_path = tempfile.mkstemp(
                    dir=folder_paths.get_input_directory(), prefix=".adb-reference-"
                )
                with os.fdopen(file_descriptor, "wb") as output_file:
                    while True:
                        chunk = await field.read_chunk()
                        if not chunk:
                            break
                        output_file.write(chunk)
            else:
                fields[field.name] = await field.text()

        raw_filename = fields.get("filename", "")
        filename = os.path.basename(raw_filename)
        checksum = fields.get("checksum", "").lower()
        extension = os.path.splitext(filename)[1].lower()
        if (
            not filename
            or filename != raw_filename
            or "/" in raw_filename
            or "\\" in raw_filename
            or extension not in REFERENCE_AUDIO_EXTENSIONS
        ):
            raise web.HTTPBadRequest(text="Invalid reference audio filename")
        if not valid_checksum(checksum):
            raise web.HTTPBadRequest(text="Invalid reference audio checksum")
        if temporary_path is None:
            raise web.HTTPBadRequest(text="Reference audio file is required")

        audio_path = reference_audio_path(checksum, extension)
        audio_directory = os.path.dirname(audio_path)
        os.makedirs(audio_directory, exist_ok=True)
        if not os.path.islink(audio_path) and os.path.isfile(audio_path) and audio_checksum(audio_path) == checksum:
            os.unlink(temporary_path)
            temporary_path = None
            return web.json_response({
                "filename": os.path.relpath(audio_path, folder_paths.get_input_directory()).replace(os.path.sep, "/"),
                "checksum": checksum,
                "status": "exists",
            })

        if audio_checksum(temporary_path) != checksum:
            raise web.HTTPBadRequest(text="Reference audio checksum mismatch")
        os.replace(temporary_path, audio_path)
        temporary_path = None
    except web.HTTPException:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except OSError:
                pass
        raise
    except Exception:
        if temporary_path is not None:
            try:
                os.unlink(temporary_path)
            except OSError:
                pass
        raise

    return web.json_response({
        "filename": os.path.relpath(audio_path, folder_paths.get_input_directory()).replace(os.path.sep, "/"),
        "checksum": checksum,
        "status": "created",
    })


@PromptServer.instance.routes.get("/adb-music-player/workflow")
async def get_workflow(request):
    require_api_token(request)
    workflow_path = temporary_workflow_path()
    if not os.path.isfile(workflow_path):
        raise web.HTTPNotFound()
    try:
        with open(workflow_path, encoding="utf-8") as workflow_file:
            workflow = json.load(workflow_file)
    except (OSError, json.JSONDecodeError):
        raise web.HTTPInternalServerError(text="Stored workflow is invalid")
    return web.json_response(workflow)


@PromptServer.instance.routes.post("/adb-music-player/audio-metadata")
async def update_audio_metadata(request):
    path = resolve_audio_file(request.query.get("path", ""))

    try:
        payload = await request.json()
    except (json.JSONDecodeError, TypeError):
        raise web.HTTPBadRequest(text="Invalid metadata")
    if not isinstance(payload, dict):
        raise web.HTTPBadRequest(text="Invalid metadata")

    metadata = read_metadata(path)
    if "color" in payload:
        color = payload["color"]
        if color is not None and color not in COLOR_PALETTE:
            raise web.HTTPBadRequest(text="Invalid color")
        metadata["color"] = color
    if payload.get("downloaded") is True:
        metadata["downloaded"] = True
    write_metadata(path, metadata)
    return web.json_response(metadata)


@PromptServer.instance.routes.get("/adb-music-player/audio-file")
async def serve_audio_file(request):
    path = resolve_audio_file(request.query.get("path", ""))
    return web.FileResponse(path)


@PromptServer.instance.routes.get("/adb-music-player/audio-download")
async def download_audio_file(request):
    path = resolve_audio_file(request.query.get("path", ""))
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
