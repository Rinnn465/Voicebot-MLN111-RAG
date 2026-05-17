const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("status");
const resultBox = document.getElementById("result");
const answerBox = document.getElementById("answer");
const suggestionButtons = document.querySelectorAll(".suggestion-btn");

askBtn.addEventListener("click", askQuestion);
clearBtn.addEventListener("click", clearForm);

questionInput.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    askQuestion();
  }
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.question || "";
    questionInput.focus();
  });
});

async function askQuestion() {
  const question = questionInput.value.trim();

  if (question.length < 2) {
    statusBox.textContent = "Hãy nhập câu hỏi hợp lệ.";
    return;
  }

  askBtn.disabled = true;
  clearBtn.disabled = true;
  suggestionButtons.forEach((button) => {
    button.disabled = true;
  });

  statusBox.textContent = "Đang truy xuất nội dung liên quan...";
  resultBox.classList.add("hidden");
  answerBox.innerHTML = "";

  const statusTimer = setTimeout(() => {
    statusBox.textContent = "Đang tổng hợp câu trả lời...";
  }, 900);

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ question }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Backend trả về lỗi.");
    }

    answerBox.innerHTML = marked.parse(
      data.answer || "Không có câu trả lời."
    );

    resultBox.classList.remove("hidden");
    statusBox.textContent = "Hoàn tất.";
  } catch (error) {
    statusBox.textContent = `Có lỗi: ${error.message}`;
  } finally {
    clearTimeout(statusTimer);
    askBtn.disabled = false;
    clearBtn.disabled = false;
    suggestionButtons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function clearForm() {
  questionInput.value = "";
  statusBox.textContent = "";
  resultBox.classList.add("hidden");
  answerBox.innerHTML = "";
  questionInput.focus();
}