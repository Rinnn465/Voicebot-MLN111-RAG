const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const waveform = document.getElementById("waveform");
const statusBox = document.getElementById("status");
const transcriptFinalBox = document.getElementById("transcriptFinal");
const transcriptPartialBox = document.getElementById("transcriptPartial");
const speakAnswerToggle = document.getElementById("speakAnswerToggle");
const resultBox = document.getElementById("result");
const answerBox = document.getElementById("answer");
const answerAudio = document.getElementById("answerAudio");
const suggestionButtons = document.querySelectorAll(".suggestion-btn");
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

askBtn.addEventListener("click", askQuestion);
recordBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
clearBtn.addEventListener("click", clearForm);

let activeStream = null;
let liveSocket = null;
let liveSocketReady = false;
let audioContext = null;
let processorNode = null;
let sourceNode = null;
let finalTranscriptSegments = [];
let realtimeStopRequested = false;
let stopFallbackTimer = null;
let answerAudioUrl = null;

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

async function askQuestion(options = {}) {
  const question = (options.questionOverride ?? questionInput.value).trim();
  const shouldSpeakAnswer = options.shouldSpeakAnswer ?? speakAnswerToggle.checked;

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
  resetAnswerAudio();

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
    statusBox.textContent = "Hoàn tất.";

    if (shouldSpeakAnswer && data.answer) {
      await speakAnswer(data.answer);
    }
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
  statusBox.textContent = "";
  finalTranscriptSegments = [];
  renderTranscript();
  resultBox.classList.add("hidden");
  answerBox.innerHTML = "";
  resetAnswerAudio();
  questionInput.focus();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    statusBox.textContent = "Trình duyệt chưa hỗ trợ ghi âm.";
    return;
  }

  try {
    await closeLiveSocket();
    cleanupAudioPipeline();
    finalTranscriptSegments = [];
    realtimeStopRequested = false;
    renderTranscript();
    statusBox.textContent = "Đang kết nối realtime STT...";
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    openLiveSocket();
  } catch (error) {
    statusBox.textContent = `Không thể bắt đầu ghi âm: ${error.message}`;
    cleanupAudioPipeline();
    await closeLiveSocket();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopRecording() {
  if (!liveSocket) {
    return;
  }

  stopBtn.disabled = true;
  realtimeStopRequested = true;
  statusBox.textContent = "Đang hoàn tất transcript realtime...";
  cleanupAudioPipeline();
  sendLiveMessage({ type: "audio.commit" });
  clearTimeout(stopFallbackTimer);
  stopFallbackTimer = window.setTimeout(() => {
    if (!realtimeStopRequested) {
      return;
    }

    statusBox.textContent = finalTranscriptSegments.length
      ? "Đã nhận transcript realtime."
      : "Không nhận diện được nội dung giọng nói.";
    sendLiveMessage({ type: "session.stop" });
    closeLiveSocket();
    if (finalTranscriptSegments.length) {
      askQuestion({
        questionOverride: finalTranscriptSegments.join(" "),
        shouldSpeakAnswer: speakAnswerToggle.checked,
      });
    }
    realtimeStopRequested = false;
  }, 1200);
}

function cleanupAudioPipeline() {
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
    processorNode = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }
}

function openLiveSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  liveSocket = new WebSocket(`${protocol}://${window.location.host}/ws/speech-to-text/live`);
  liveSocketReady = false;

  liveSocket.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);
    await handleLiveEvent(payload);
  });

  liveSocket.addEventListener("close", () => {
    liveSocket = null;
    liveSocketReady = false;
    clearTimeout(stopFallbackTimer);
    cleanupAudioPipeline();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
  });

  liveSocket.addEventListener("error", () => {
    statusBox.textContent = "Kết nối realtime STT bị lỗi.";
  });
}

async function handleLiveEvent(payload) {
  const messageType = payload.type;

  if (messageType === "session.created") {
    statusBox.textContent = "Đã kết nối Valsea realtime.";
    return;
  }

  if (messageType === "session.ready") {
    liveSocketReady = true;
    statusBox.textContent = "Đang nghe realtime...";
    await startAudioPipeline();
    return;
  }

  if (messageType === "transcript.partial") {
    transcriptPartialBox.textContent = payload.text || "";
    return;
  }

  if (messageType === "transcript.final") {
    const finalText = (payload.text || "").trim();
    if (finalText) {
      finalTranscriptSegments.push(finalText);
      questionInput.value = finalTranscriptSegments.join(" ");
      questionInput.focus();
    }
    transcriptPartialBox.textContent = "";
    renderTranscript();

    if (realtimeStopRequested) {
      clearTimeout(stopFallbackTimer);
      statusBox.textContent = finalTranscriptSegments.length
        ? "Đã nhận transcript realtime."
        : "Không nhận diện được nội dung giọng nói.";
      sendLiveMessage({ type: "session.stop" });
      await closeLiveSocket();
      if (finalTranscriptSegments.length) {
        await askQuestion({
          questionOverride: finalTranscriptSegments.join(" "),
          shouldSpeakAnswer: speakAnswerToggle.checked,
        });
      }
      realtimeStopRequested = false;
    }
    return;
  }

  if (messageType === "error") {
    statusBox.textContent = `Lỗi realtime: ${payload.message || "Không xác định"}`;
    await closeLiveSocket();
  }
}

async function startAudioPipeline() {
  if (audioContext || !liveSocketReady) {
    return;
  }

  activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContextClass();
  sourceNode = audioContext.createMediaStreamSource(activeStream);
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);

  processorNode.onaudioprocess = (event) => {
    if (!liveSocketReady || !liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const pcm16 = convertFloat32ToPCM16(
      event.inputBuffer.getChannelData(0),
      audioContext.sampleRate,
      16000
    );

    if (!pcm16.length) {
      return;
    }

    sendLiveMessage({
      type: "audio.append",
      audio: arrayBufferToBase64(pcm16.buffer),
    });
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);
}

function convertFloat32ToPCM16(float32Array, inputSampleRate, outputSampleRate) {
  const sampled = downsampleBuffer(float32Array, inputSampleRate, outputSampleRate);
  const pcm16 = new Int16Array(sampled.length);

  for (let i = 0; i < sampled.length; i += 1) {
    const s = Math.max(-1, Math.min(1, sampled[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return pcm16;
}

function downsampleBuffer(buffer, inputSampleRate, outputSampleRate) {
  if (outputSampleRate >= inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

function renderTranscript() {
  const combined = finalTranscriptSegments.join(" ").trim();
  transcriptFinalBox.textContent = combined || "Chưa có transcript.";
  transcriptPartialBox.textContent = "";
}

function sendLiveMessage(payload) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  liveSocket.send(JSON.stringify(payload));
}

async function closeLiveSocket() {
  if (!liveSocket) {
    return;
  }

  if (liveSocket.readyState === WebSocket.OPEN) {
    liveSocket.close();
  }

  liveSocket = null;
  liveSocketReady = false;
}

async function speakAnswer(text) {
  statusBox.textContent = "Đang tạo giọng đọc câu trả lời...";

  const response = await fetch("/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let detail = "Không thể tạo giọng đọc.";

    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch (error) {
      // ignore
    }

    throw new Error(detail);
  }

  const audioBlob = await response.blob();
  resetAnswerAudio();
  answerAudioUrl = URL.createObjectURL(audioBlob);
  answerAudio.src = answerAudioUrl;
  answerAudio.classList.remove("hidden");

  try {
    await answerAudio.play();
    statusBox.textContent = "Hoàn tất và đang phát câu trả lời.";
  } catch (error) {
    statusBox.textContent = "Hoàn tất. Nhấn play để nghe câu trả lời.";
  }
}

function resetAnswerAudio() {
  answerAudio.pause();
  answerAudio.removeAttribute("src");
  answerAudio.load();
  answerAudio.classList.add("hidden");

  if (answerAudioUrl) {
    URL.revokeObjectURL(answerAudioUrl);
    answerAudioUrl = null;
  }
}
