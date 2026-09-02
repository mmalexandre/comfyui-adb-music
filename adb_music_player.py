class ADBMusicPlayer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Test1": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("Test1",)
    FUNCTION = "play"
    CATEGORY = "ADB"

    def play(self, Test1):
        return (Test1,)
