import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


class FocusUiContractTest(unittest.TestCase):
    def test_focus_ui_exposes_center_model_and_compact_voice_widget(self):
        html = read("web/index.html")

        self.assertIn('id="modelRenderer"', html)
        self.assertIn('id="stateIcon"', html)
        self.assertIn('id="voiceWidget"', html)
        self.assertIn('id="micBtn"', html)
        self.assertIn('id="transcriptFinal"', html)
        self.assertIn('id="answer"', html)

        self.assertNotIn('id="recordBtn"', html)
        self.assertNotIn('id="stopBtn"', html)
        self.assertNotIn('suggestion-btn', html)

    def test_mic_toggle_auto_submits_transcript_and_forces_tts(self):
        js = read("static/app.js")

        self.assertIn('micBtn.addEventListener("click", toggleMic)', js)
        self.assertIn('async function toggleMic()', js)
        self.assertIn('async function submitTranscriptAfterStop()', js)
        self.assertIn('shouldSpeakAnswer: true', js)
        self.assertIn('setVisualState("listening")', js)
        self.assertIn('setVisualState("thinking")', js)
        self.assertIn('setVisualState("speaking")', js)

    def test_ai_usage_tab_is_present_and_transparent(self):
        html = read("web/index.html")

        self.assertIn('data-tab-target="usage"', html)
        self.assertIn('id="usageTab"', html)
        self.assertIn('NotebookLM', html)
        self.assertIn('Qwen/Qwen3-Embedding-4B', html)
        self.assertIn('OpenAI API', html)
        self.assertIn('Liêm chính học thuật', html)
        self.assertIn('Không để AI làm thay hoàn toàn', html)


if __name__ == "__main__":
    unittest.main()
