import unittest

from prompt_contract import (
    FIRST_RESPONSE_INTRO,
    SYSTEM_PROMPT,
    build_user_prompt,
    ensure_first_response_intro,
    sanitize_tts_text,
)


class PromptContractTest(unittest.TestCase):
    def test_build_user_prompt_wraps_context_and_query(self):
        prompt = build_user_prompt("đoạn giáo trình", "câu hỏi MC")

        self.assertIn("[CONTEXT]\nđoạn giáo trình\n[/CONTEXT]", prompt)
        self.assertIn("[USER_QUERY]\ncâu hỏi MC\n[/USER_QUERY]", prompt)
        self.assertIn("văn phong Podcast tự nhiên", prompt)

    def test_first_response_intro_is_prepended_once(self):
        answer, introduced = ensure_first_response_intro("Câu hỏi rất hay.", False)

        self.assertTrue(introduced)
        self.assertTrue(answer.startswith(FIRST_RESPONSE_INTRO))
        self.assertIn("Câu hỏi rất hay.", answer)

        answer_again, introduced_again = ensure_first_response_intro(answer, False)
        self.assertTrue(introduced_again)
        self.assertEqual(answer_again.count(FIRST_RESPONSE_INTRO), 1)

    def test_sanitize_tts_text_removes_common_markdown(self):
        raw = "**Tiêu đề**\n- Ý một\n1. Ý hai"

        clean = sanitize_tts_text(raw)

        self.assertNotIn("**", clean)
        self.assertNotIn("- Ý", clean)
        self.assertNotIn("1. Ý", clean)
        self.assertIn("Tiêu đề", clean)
        self.assertIn("Ý một", clean)
        self.assertIn("Ý hai", clean)

    def test_system_prompt_keeps_voicebot_as_supporting_guest(self):
        self.assertIn("VoiceBot", SYSTEM_PROMPT)
        self.assertIn("không thay thế toàn bộ phần thuyết trình", SYSTEM_PROMPT)
        self.assertIn("phong cách podcast", SYSTEM_PROMPT.lower())
        self.assertIn("ngoài kịch bản", SYSTEM_PROMPT)


if __name__ == "__main__":
    unittest.main()
