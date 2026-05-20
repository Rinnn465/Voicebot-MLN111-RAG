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
        usage_start = html.index('id="usageTab"')
        usage_end = html.index('id="avatarTab"')
        usage_html = html[usage_start:usage_end]

        self.assertIn('class="usage-shell"', usage_html)
        self.assertIn('<table class="usage-table"', usage_html)
        self.assertIn('<th scope="col">Công cụ</th>', usage_html)
        self.assertIn('<th scope="col">Mục đích</th>', usage_html)
        self.assertNotIn('class="lesson-grid"', usage_html)
        self.assertIn('NotebookLM', html)
        self.assertIn('Qwen/Qwen3-Embedding-4B', html)
        self.assertIn('OpenAI API', html)
        self.assertIn('Liêm chính học thuật', html)
        self.assertIn('Không để AI làm thay hoàn toàn', html)

    def test_quiz_is_its_own_tab_before_ai_usage(self):
        html = read("web/index.html")

        self.assertIn('data-tab-target="quiz"', html)
        self.assertIn('id="quizTab"', html)
        self.assertLess(html.index('data-tab-target="quiz"'), html.index('data-tab-target="usage"'))

        lesson_html = html[html.index('id="lessonTab"'):html.index('id="quizTab"')]
        quiz_html = html[html.index('id="quizTab"'):html.index('id="usageTab"')]

        self.assertNotIn('id="quizQuestion"', lesson_html)
        self.assertIn('Quiz tương tác cho lớp', quiz_html)
        self.assertIn('id="quizQuestion"', quiz_html)

    def test_voicebot_status_is_top_right(self):
        html = read("web/index.html")

        top_status_start = html.index(".top-status {")
        top_status_end = html.index(".top-status i", top_status_start)
        top_status_css = html[top_status_start:top_status_end]

        self.assertIn("position: fixed", top_status_css)
        self.assertIn("right: 18px", top_status_css)
        self.assertIn("top: 78px", top_status_css)
        self.assertNotIn("left: 50%", top_status_css)
        self.assertNotIn("translateX(-50%)", top_status_css)


if __name__ == "__main__":
    unittest.main()
