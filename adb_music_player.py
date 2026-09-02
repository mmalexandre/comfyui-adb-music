class ADBMusicPlayer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "directory": ("STRING", {"default": "output/audio"}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("directory",)
    FUNCTION = "play"
    CATEGORY = "ADB"

    def play(self, directory):
        return (directory,)
