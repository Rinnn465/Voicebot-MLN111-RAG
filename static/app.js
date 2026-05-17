const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const clearBtn = document.getElementById("clearBtn");
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const waveform = document.getElementById("waveform");
const statusBox = document.getElementById("status");
const resultBox = document.getElementById("result");
const answerBox = document.getElementById("answer");
const suggestionButtons = document.querySelectorAll(".suggestion-btn");

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

let recognition = null;
let isListening = false;
let isAsking = false;
let baseTranscript = "";
let finalTranscript = "";

if (window.lucide) {
  window.lucide.createIcons();
}

askBtn.addEventListener("click", askQuestion);
clearBtn.addEventListener("click", clearForm);
micBtn.addEventListener("click", toggleMic);

questionInput.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    askQuestion();
  }
});

suggestionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.question || "";
    questionInput.focus();
    setStatus("Đã đưa gợi ý vào ô hỏi.");
  });
});

setupSpeechRecognition();

async function askQuestion() {
  const question = questionInput.value.trim();

  if (question.length < 2) {
    setStatus("Hãy nhập hoặc đọc một câu hỏi hợp lệ.");
    questionInput.focus();
    return;
  }

  if (isListening) {
    recognition.stop();
  }

  isAsking = true;
  setBusy(true);
  setStatus("Đang truy xuất nội dung liên quan...");
  resultBox.classList.add("hidden");
  answerBox.innerHTML = "";

  const statusTimer = setTimeout(() => {
    setStatus("Đang tổng hợp câu trả lời...");
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

    answerBox.innerHTML = window.marked
      ? marked.parse(data.answer || "Không có câu trả lời.")
      : escapeHtml(data.answer || "Không có câu trả lời.");

    resultBox.classList.remove("hidden");
    setStatus("Hoàn tất.");
  } catch (error) {
    setStatus(`Có lỗi: ${error.message}`);
  } finally {
    clearTimeout(statusTimer);
    isAsking = false;
    setBusy(false);
  }
}

function clearForm() {
  if (isListening) {
    recognition.stop();
  }

  questionInput.value = "";
  baseTranscript = "";
  finalTranscript = "";
  setStatus("");
  resultBox.classList.add("hidden");
  answerBox.innerHTML = "";
  questionInput.focus();
}

function setupSpeechRecognition() {
  if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = "Trình duyệt chưa hỗ trợ nhập giọng nói.";
    micStatus.textContent = "Mic chưa hỗ trợ";
    setStatus("Trình duyệt này chưa hỗ trợ Web Speech API. Hãy thử Chrome hoặc Edge.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "vi-VN";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    isListening = true;
    baseTranscript = questionInput.value.trim();
    finalTranscript = "";
    updateMicUi();
    setStatus("Đang nghe... nói câu hỏi của bạn bằng tiếng Việt.");
    sendVoiceEvent("mic_started");
  });

  recognition.addEventListener("result", (event) => {
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();

      if (event.results[index].isFinal) {
        finalTranscript = joinText(finalTranscript, transcript);
      } else {
        interimTranscript = joinText(interimTranscript, transcript);
      }
    }

    questionInput.value = joinText(baseTranscript, finalTranscript, interimTranscript);
  });

  recognition.addEventListener("end", () => {
    isListening = false;
    updateMicUi();
    sendVoiceEvent("mic_stopped");

    if (isAsking) {
      return;
    }

    if (questionInput.value.trim().length > 1) {
      setStatus("Đã ghi âm xong. Kiểm tra câu hỏi rồi gửi.");
    } else {
      setStatus("Mic đã dừng. Chưa nhận được nội dung rõ ràng.");
    }
  });

  recognition.addEventListener("error", (event) => {
    isListening = false;
    updateMicUi();
    setStatus(getSpeechErrorMessage(event.error));
    sendVoiceEvent("mic_error", { error: event.error });
  });
}

function toggleMic() {
  if (!recognition) {
    return;
  }

  if (isListening) {
    recognition.stop();
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    setStatus("Mic đang khởi động. Chờ một chút rồi thử lại.");
  }
}

function setBusy(isBusy) {
  askBtn.disabled = isBusy;
  clearBtn.disabled = isBusy;
  micBtn.disabled = isBusy || !SpeechRecognition;
  suggestionButtons.forEach((button) => {
    button.disabled = isBusy;
  });
}

function updateMicUi() {
  micBtn.classList.toggle("is-listening", isListening);
  waveform.classList.toggle("is-listening", isListening);
  micStatus.classList.toggle("is-listening", isListening);
  micBtn.setAttribute("aria-pressed", String(isListening));
  micBtn.setAttribute(
    "aria-label",
    isListening ? "Tắt mic" : "Bật mic để nhập câu hỏi"
  );
  micStatus.textContent = isListening ? "Đang nghe" : "Mic sẵn sàng";
}

function setStatus(message) {
  statusBox.textContent = message;
}

function joinText(...parts) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSpeechErrorMessage(errorCode) {
  const messages = {
    "not-allowed": "Trình duyệt chưa được cấp quyền mic.",
    "service-not-allowed": "Dịch vụ nhận dạng giọng nói đang bị chặn.",
    "no-speech": "Chưa nghe thấy giọng nói. Thử nói gần mic hơn.",
    "audio-capture": "Không tìm thấy thiết bị mic.",
    network: "Lỗi mạng khi nhận dạng giọng nói.",
    aborted: "Mic đã dừng.",
  };

  return messages[errorCode] || `Mic gặp lỗi: ${errorCode}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function sendVoiceEvent(type, extra = {}) {
  fetch("/voice/event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type,
      timestamp: new Date().toISOString(),
      ...extra,
    }),
  }).catch(() => {});
}
