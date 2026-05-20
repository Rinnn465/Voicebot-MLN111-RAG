import unittest

from prompt_contract import (
    FIRST_RESPONSE_INTRO,
    SYSTEM_PROMPT,
    apply_intro_policy,
    build_user_prompt,
    is_intro_request,
    sanitize_tts_text,
)


class PromptContractTest(unittest.TestCase):
    def test_build_user_prompt_wraps_context_and_query(self):
        prompt = build_user_prompt("đoạn giáo trình", "câu hỏi MC")

        self.assertIn("[CONTEXT]\nđoạn giáo trình\n[/CONTEXT]", prompt)
        self.assertIn("[USER_QUERY]\ncâu hỏi MC\n[/USER_QUERY]", prompt)
        self.assertIn("văn phong Podcast tự nhiên", prompt)

    def test_intro_is_added_only_when_mc_requests_intro(self):
        answer = apply_intro_policy(
            "Câu hỏi rất hay.",
            "VoiceBot ơi, bạn có thể gửi lời chào và giới thiệu vai trò không?",
        )

        self.assertTrue(answer.startswith(FIRST_RESPONSE_INTRO))
        self.assertIn("Câu hỏi rất hay.", answer)

    def test_intro_is_not_added_to_normal_question(self):
        answer = apply_intro_policy(
            "Câu hỏi rất hay.",
            "Nguyên lý mối liên hệ phổ biến là gì?",
        )

        self.assertFalse(answer.startswith(FIRST_RESPONSE_INTRO))
        self.assertEqual(answer, "Câu hỏi rất hay.")

    def test_intro_prefix_is_removed_from_normal_question_if_model_adds_it(self):
        answer = apply_intro_policy(
            f"{FIRST_RESPONSE_INTRO} Câu hỏi rất hay.",
            "Nguyên lý sự phát triển là gì?",
        )

        self.assertEqual(answer, "Câu hỏi rất hay.")

    def test_intro_request_detection(self):
        self.assertTrue(is_intro_request("VoiceBot gửi lời chào đến lớp nhé"))
        self.assertTrue(is_intro_request("Bạn giới thiệu vai trò của mình đi"))
        self.assertFalse(is_intro_request("Trình bày nguyên lý mối liên hệ phổ biến"))

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
        self.assertIn("chỉ nói câu giới thiệu", SYSTEM_PROMPT.lower())


if __name__ == "__main__":
    unittest.main()

