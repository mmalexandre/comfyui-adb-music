import json
import os
from io import BytesIO

import av
import folder_paths


class ADBMusicPlayer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "audio": ("AUDIO",),
                "filename_prefix": ("STRING", {"default": "audio/ComfyUI"}),
                "format": (["wav", "mp3", "opus"], {"default": "wav"}),
                "quality": (["V0", "64k", "96k", "128k", "192k", "320k"], {"default": "128k"}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("AUDIO",)
    RETURN_NAMES = ("audio",)
    FUNCTION = "save_audio"
    CATEGORY = "audio"
    OUTPUT_NODE = True

    @staticmethod
    def _set_quality(stream, format, quality):
        if format == "mp3":
            if quality == "V0":
                stream.codec_context.qscale = 1
            elif quality in {"128k", "320k"}:
                stream.bit_rate = int(quality[:-1]) * 1000
        elif format == "opus" and quality in {"64k", "96k", "128k", "192k", "320k"}:
            stream.bit_rate = int(quality[:-1]) * 1000

    @staticmethod
    def _save_waveform(waveform, sample_rate, output_path, format, quality, metadata):
        if format == "opus":
            opus_rates = [8000, 12000, 16000, 24000, 48000]
            if sample_rate > 48000:
                output_rate = 48000
            else:
                output_rate = next((rate for rate in opus_rates if rate > sample_rate), 48000)
            if output_rate != sample_rate:
                import torchaudio

                waveform = torchaudio.functional.resample(waveform, sample_rate, output_rate)
            sample_rate = output_rate

        channels = waveform.shape[0]
        layout = "mono" if channels == 1 else "stereo"
        output_buffer = BytesIO()
        with av.open(output_buffer, mode="w", format=format) as container:
            for key, value in metadata.items():
                container.metadata[key] = value
            codec = "pcm_s16le" if format == "wav" else ("libmp3lame" if format == "mp3" else "libopus")
            stream = container.add_stream(codec, rate=sample_rate, layout=layout)
            ADBMusicPlayer._set_quality(stream, format, quality)
            frame = av.AudioFrame.from_ndarray(
                waveform.movedim(0, 1).reshape(1, -1).float().numpy(),
                format="flt",
                layout=layout,
            )
            frame.sample_rate = sample_rate
            frame.pts = 0
            container.mux(stream.encode(frame))
            container.mux(stream.encode(None))
        with open(output_path, "wb") as output_file:
            output_file.write(output_buffer.getvalue())

    @staticmethod
    def _save_workflow(workflow, audio_path):
        if workflow is None:
            return
        workflow_path = f"{audio_path}.workflow.json"
        with open(workflow_path, "w", encoding="utf-8") as workflow_file:
            json.dump(workflow, workflow_file, indent=2)

    def save_audio(self, audio, filename_prefix, format, quality, prompt=None, extra_pnginfo=None):
        if audio is None:
            raise ValueError("ADBMusicPlayer: input audio is None.")
        if format not in {"wav", "mp3", "opus"}:
            raise ValueError(f"Unsupported audio format: {format!r}")

        output_directory, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, folder_paths.get_output_directory()
        )
        metadata = {}
        if prompt is not None:
            metadata["prompt"] = json.dumps(prompt)
        if extra_pnginfo is not None:
            metadata.update({key: json.dumps(value) for key, value in extra_pnginfo.items()})
        workflow = extra_pnginfo.get("workflow") if extra_pnginfo else None

        results = []
        sample_rate = audio["sample_rate"]
        for batch_number, waveform in enumerate(audio["waveform"].cpu()):
            batch_filename = filename.replace("%batch_num%", str(batch_number))
            file = f"{batch_filename}_{counter:05}.{format}"
            audio_path = os.path.join(output_directory, file)
            self._save_waveform(waveform, sample_rate, audio_path, format, quality, metadata)
            self._save_workflow(workflow, audio_path)
            results.append({"filename": file, "subfolder": subfolder, "type": "output"})
            counter += 1

        return {"ui": {"audio": results}, "result": (audio,)}
