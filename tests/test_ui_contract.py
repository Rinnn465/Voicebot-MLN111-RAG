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
        self.assertIn('id="answerLive"', html)
        self.assertNotIn('id="answerSummary"', html)

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

    def test_voicebot_hint_button_lists_two_principles_questions(self):
        html = read("web/index.html")
        js = read("static/app.js")

        self.assertIn('id="voiceHintBtn"', html)
        self.assertIn('id="voiceHintPanel"', html)
        self.assertIn('class="voice-controls"', html)
        self.assertIn('readonly', html)
        self.assertIn('aria-readonly="true"', html)
        self.assertIn("right: calc(100% + 14px)", html)
        self.assertIn("width: 62px", html)
        self.assertIn("height: 62px", html)
        self.assertIn("animation: hint-slide-left", html)
        self.assertIn("@keyframes hint-slide-left", html)
        self.assertIn("Câu hỏi mẫu cho chủ đề thuyết trình", html)
        self.assertIn("Hai nguyên lý của phép biện chứng duy vật gồm những nguyên lý nào?", html)
        self.assertIn("Vì sao mối liên hệ phổ biến và sự phát triển là hai nguyên lý cơ bản?", html)
        self.assertIn("Hai nguyên lý này có quan hệ với nhau như thế nào?", html)
        self.assertIn("Khi vận dụng hai nguyên lý này, cần tránh những cách nhìn sai lầm nào?", html)
        self.assertIn("Có thể liên hệ hai nguyên lý này với học tập hoặc AI như thế nào?", html)
        self.assertNotIn("data-hint-question", html)
        self.assertIn("voiceHintBtn.addEventListener", js)
        self.assertIn("function toggleVoiceHints()", js)
        self.assertNotIn("function applyHintQuestion(question)", js)
        self.assertNotIn('document.querySelectorAll("[data-hint-question]")', js)

    def test_voicebot_streams_answer_text_without_summary(self):
        html = read("web/index.html")
        js = read("static/app.js")

        self.assertIn('id="answerLive"', html)
        self.assertNotIn('id="summaryToggle"', html)
        self.assertNotIn('id="answerSummary"', html)
        self.assertIn("answer-live", html)
        self.assertNotIn("answer-summary-toggle", html)
        self.assertNotIn("Tóm tắt dễ hiểu", js)
        self.assertIn("function startAnswerLiveText(text, durationSeconds = 0)", js)
        self.assertIn("function finishAnswerLiveText(text)", js)
        self.assertIn("const normalized = normalizeAnswerText(text)", js)
        self.assertIn("normalized.slice(0, index)", js)
        self.assertIn("Math.max(18, Math.min(70", js)
        self.assertIn("answerLiveBox.textContent = normalizeAnswerText(text)", js)
        self.assertIn('answerLiveBox.classList.remove("hidden")', js)
        self.assertIn("function keepAnswerLiveTextInView()", js)
        self.assertIn("answerLiveBox.scrollTop = answerLiveBox.scrollHeight", js)
        self.assertNotIn("function buildAnswerSummary(text)", js)
        self.assertNotIn("function prepareAnswerSummary(text)", js)
        self.assertNotIn("function splitReadableSegments(text)", js)
        self.assertNotIn("function splitSummaryCandidates(text)", js)
        self.assertNotIn("function buildTopicSummary(text)", js)
        self.assertNotIn("function addUniquePoint(points, point)", js)
        self.assertNotIn("function extractKeyPhrase(text)", js)
        self.assertNotIn("function compactSummaryPoint(text)", js)
        self.assertNotIn("function isFillerSummaryPoint(text)", js)
        self.assertIn("content: none", html)
        self.assertIn("height: 92px", html)
        self.assertNotIn("max-height: clamp(128px, 24vh, 220px)", html)
        self.assertIn("overflow-y: auto", html)
        self.assertIn("scrollbar-width: none", html)
        self.assertIn(".answer-live::-webkit-scrollbar", html)
        self.assertNotIn("index - 220", js)
        self.assertNotIn("slice(0, 10).join", js)
        self.assertNotIn("!isFillerSummaryPoint(sentence)", js)
        self.assertNotIn("trimmed.slice(0, 112)", js)
        self.assertNotIn("summaryToggle.addEventListener", js)
        self.assertNotIn("Có thể xem tóm tắt", js)
        self.assertIn("audio.onended = () =>", js)
        self.assertNotIn('id="answer" class="answer-markdown"', html)
        self.assertNotIn("const answerBox", js)
        self.assertNotIn("marked.parse", js)

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

    def test_voicebot_uses_static_background_image_behind_avatar(self):
        html = read("web/index.html")
        avatar_js = read("static/avatar.js")

        avatar_start = html.index(".avatar-panel {")
        avatar_end = html.index(".app-shell", avatar_start)
        avatar_css = html[avatar_start:avatar_end]

        self.assertIn('url("/static/background/tracen_gate.jpg")', avatar_css)
        self.assertIn('body[data-active-tab="avatar"]', html)
        self.assertIn('url("/static/background/tracen_gate.jpg") center / cover no-repeat', html)
        self.assertIn("background-size: 48px 48px, 48px 48px, cover, cover", avatar_css)
        self.assertIn("alpha: true", avatar_js)
        self.assertIn("scene.background = null", avatar_js)
        self.assertIn("renderer.setClearColor(0x000000, 0)", avatar_js)
        self.assertIn("renderer.setClearAlpha(0)", avatar_js)
        self.assertNotIn("scene.background = new THREE.Color", avatar_js)
        self.assertNotIn(".model-stage::before", html)
        self.assertNotIn(".model-stage::after", html)
        self.assertNotIn("@keyframes slow-spin", html)

    def test_avatar_idle_blink_and_ear_wiggle_are_gentle(self):
        avatar_js = read("static/avatar.js")

        self.assertIn("const BLINK_INTERVAL_RANGE = [3.6, 7.8]", avatar_js)
        self.assertIn("const BLINK_RECOVERY_SPEED = 0.12", avatar_js)
        self.assertIn("let nextBlinkTime = 3.2", avatar_js)
        self.assertIn("const EAR_WIGGLE_INTERVAL_RANGE = [8.5, 15]", avatar_js)
        self.assertIn("const EAR_WIGGLE_DURATION = 1.08", avatar_js)
        self.assertIn("const EAR_WIGGLE_FREQUENCY = 13", avatar_js)
        self.assertIn("const EAR_WIGGLE_AMPLITUDE = 0.09", avatar_js)
        self.assertIn("let nextEarWiggleTime = 5.6", avatar_js)
        self.assertNotIn("Math.sin(elapsed * 24)", avatar_js)
        self.assertNotIn("randFloat(4.5, 8.5)", avatar_js)

    def test_development_steps_use_cards_not_slider(self):
        html = read("web/index.html")

        self.assertNotIn('id="phaseSlider"', html)
        self.assertNotIn('class="phase-slider"', html)
        self.assertIn('role="group" aria-label="Chọn giai đoạn phát triển"', html)
        self.assertEqual(html.count('class="step-card'), 4)
        self.assertIn('data-phase-card="0" aria-pressed="true"', html)
        self.assertIn('card.addEventListener("click"', html)
        self.assertIn('card.setAttribute("aria-pressed", String(isActive))', html)

    def test_lesson_title_line_height_allows_vietnamese_accents(self):
        html = read("web/index.html")

        h1_start = html.index("h1 {")
        h1_end = html.index(".lead", h1_start)
        h1_css = html[h1_start:h1_end]

        self.assertIn("line-height: 1.08", h1_css)
        self.assertNotIn("line-height: 0.95", h1_css)

    def test_quiz_wrong_answer_locks_after_showing_correct_answer_without_class_score(self):
        html = read("web/index.html")

        self.assertNotIn("quizScore", html)
        self.assertNotIn("Điểm lớp", html)
        self.assertNotIn("function updateQuizScore()", html)
        self.assertNotIn("is-muted", html)
        self.assertIn("const isSolved = selected === quiz.answer", html)
        self.assertIn('const disabled = isAnswered ? "disabled" : ""', html)
        self.assertIn("Đáp án đúng là", html)
        self.assertNotIn("Bạn vẫn có thể chọn lại", html)

    def test_quiz_stops_at_last_question_instead_of_restarting(self):
        html = read("web/index.html")

        self.assertIn('quizNext.disabled = currentQuizIndex === quizBank.length - 1', html)
        self.assertIn('currentQuizIndex === quizBank.length - 1 ? "Hết câu hỏi" : "Tiếp"', html)
        self.assertIn("if (currentQuizIndex < quizBank.length - 1)", html)
        self.assertNotIn('quizNext.textContent = currentQuizIndex === quizBank.length - 1 ? "Làm lại" : "Tiếp"', html)
        self.assertNotIn("quizAnswers.fill(null)", html)


if __name__ == "__main__":
    unittest.main()
