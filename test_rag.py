from rag import RAGPipeline

rag = RAGPipeline()

questions = [
    "Chủ nghĩa hiện sinh là gì?",
    "Tư tưởng Hồ Chí Minh về đạo đức là gì?",
]

for question in questions:
    print("=" * 100)
    print("Câu hỏi:", question)

    result = rag.answer(question)

    print("\nTrả lời:")
    print(result["answer"])

    print("\nSố đoạn ngữ cảnh đã dùng:", result["context_count"])
    print("Nguồn:")
    for source in result["sources"]:
        print(source)

    print()