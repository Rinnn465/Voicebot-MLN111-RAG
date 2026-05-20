const questionInput = document.getElementById("question");
const micBtn = document.getElementById("micBtn");
const micStatus = document.getElementById("micStatus");
const statusBox = document.getElementById("status");
const transcriptFinalBox = document.getElementById("transcriptFinal");
const transcriptPartialBox = document.getElementById("transcriptPartial");
const resultBox = document.getElementById("result");
const answerLiveBox = document.getElementById("answerLive");
const stateIcon = document.getElementById("stateIcon");
const stateLabel = document.getElementById("stateLabel");
const voiceHintBtn = document.getElementById("voiceHintBtn");
const voiceHintPanel = document.getElementById("voiceHintPanel");
let answerAudio = document.getElementById("answerAudio");

const AudioContextClass = window.AudioContext || window.webkitAudioContext;

micBtn.addEventListener("click", toggleMic);
voiceHintBtn.addEventListener("click", toggleVoiceHints);
questionInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    askQuestion({ shouldSpeakAnswer: true });
  }
});

let isAsking = false;
let isListening = false;
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
let submitAfterStopStarted = false;
let liveTextTimer = null;

const stateConfig = {
  idle: { label: "Idle", icon: "sparkles", message: "Nhấn mic để bắt đầu nói." },
  listening: { label: "Listening", icon: "radio", message: "Đang nghe... nhấn mic lần nữa để gửi." },
  thinking: { label: "Thinking", icon: "loader-circle", message: "Đang truy xuất và tổng hợp câu trả lời..." },
  speaking: { label: "Speaking", icon: "volume-2", message: "Đang phát câu trả lời." },
  error: { label: "Error", icon: "triangle-alert", message: "Có lỗi xảy ra." },
};

function setAvatarState(state) {
  document.body.dataset.avatarState = state;
  window.voiceAvatar?.setState(state);
}

function setVisualState(state, message) {
  const config = stateConfig[state] || stateConfig.idle;
  document.body.dataset.state = state;
  stateLabel.textContent = config.label;
  stateIcon.setAttribute("data-lucide", config.icon);
  statusBox.textContent = message ?? config.message;
  setAvatarState(state);

  if (window.lucide) {
    lucide.createIcons();
  }
}

function isAnswerAudioPlaying() {
  const audio = getAnswerAudio();
  return Boolean(audio.src) && !audio.paused && !audio.ended;
}

function setListeningUi(listening) {
  isListening = listening;
  micBtn.classList.toggle("is-listening", listening);
  micBtn.setAttribute("aria-pressed", String(listening));
  micBtn.setAttribute("aria-label", listening ? "Tắt mic và gửi transcript" : "Bật mic để nói với AI");
  micStatus.textContent = listening ? "Đang nghe" : "Mic sẵn sàng";
  micStatus.classList.toggle("is-listening", listening);
}

function setBusy(isBusy) {
  micBtn.disabled = isBusy && !isListening;
  questionInput.disabled = isBusy;
}

function toggleVoiceHints() {
  const willOpen = voiceHintPanel.hidden;
  voiceHintPanel.hidden = !willOpen;
  voiceHintBtn.setAttribute("aria-expanded", String(willOpen));
}

function normalizeAnswerText(text = "") {
  return text
    .replace(/[#*_`>~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keepAnswerLiveTextInView() {
  answerLiveBox.scrollTop = answerLiveBox.scrollHeight;
}

function startAnswerLiveText(text, durationSeconds = 0) {
  clearInterval(liveTextTimer);
  const normalized = normalizeAnswerText(text);

  if (!normalized) {
    return;
  }

  answerLiveBox.textContent = "";
  answerLiveBox.classList.remove("hidden");
  keepAnswerLiveTextInView();
  const intervalMs = durationSeconds > 0
    ? Math.max(18, Math.min(70, (durationSeconds * 1000) / normalized.length))
    : 32;
  let index = 0;

  liveTextTimer = window.setInterval(() => {
    index = Math.min(normalized.length, index + 1);
    answerLiveBox.textContent = normalized.slice(0, index);
    keepAnswerLiveTextInView();

    if (index >= normalized.length) {
      clearInterval(liveTextTimer);
      liveTextTimer = null;
    }
  }, intervalMs);
}

function finishAnswerLiveText(text) {
  clearInterval(liveTextTimer);
  liveTextTimer = null;
  answerLiveBox.textContent = normalizeAnswerText(text);
  answerLiveBox.classList.remove("hidden");
  keepAnswerLiveTextInView();
}

function getAnswerAudio() {
  if (answerAudio) {
    return answerAudio;
  }

  answerAudio = document.createElement("audio");
  answerAudio.id = "answerAudio";
  answerAudio.controls = false;
  answerAudio.classList.add("hidden");
  resultBox.appendChild(answerAudio);
  return answerAudio;
}

async function toggleMic() {
  if (isAsking) {
    return;
  }

  if (isListening || liveSocket) {
    stopRecording();
    return;
  }

  await startRecording();
}

async function askQuestion(options = {}) {
  const question = (options.questionOverride ?? questionInput.value).trim();
  const shouldSpeakAnswer = options.shouldSpeakAnswer ?? true;

  if (question.length < 2) {
    setVisualState("idle", "Không có transcript đủ dài để gửi.");
    questionInput.focus();
    return;
  }

  isAsking = true;
  setBusy(true);
  setVisualState("thinking");
  resultBox.classList.add("hidden");
  answerLiveBox.textContent = "";
  answerLiveBox.classList.add("hidden");
  resetAnswerAudio();

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail || "Backend trả về lỗi.");
    }

    resultBox.classList.remove("hidden");

    if (shouldSpeakAnswer && data.answer) {
      await speakAnswer(data.answer);
    } else {
      finishAnswerLiveText(data.answer || "Không có câu trả lời.");
      setVisualState("idle", "Hoàn tất.");
    }
  } catch (error) {
    setVisualState("error", `Có lỗi: ${error.message}`);
  } finally {
    isAsking = false;
    setBusy(false);
  }
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    setVisualState("error", "Trình duyệt chưa hỗ trợ ghi âm.");
    return;
  }

  try {
    await closeLiveSocket();
    cleanupAudioPipeline();
    finalTranscriptSegments = [];
    realtimeStopRequested = false;
    submitAfterStopStarted = false;
    questionInput.value = "";
    renderTranscript();
    resetAnswerAudio();
    resultBox.classList.add("hidden");
    setListeningUi(true);
    setVisualState("listening", "Đang kết nối realtime STT...");
    openLiveSocket();
  } catch (error) {
    setVisualState("error", `Không thể bắt đầu ghi âm: ${error.message}`);
    cleanupAudioPipeline();
    await closeLiveSocket();
    setListeningUi(false);
  }
}

function stopRecording() {
  if (!liveSocket) {
    setListeningUi(false);
    submitTranscriptAfterStop();
    return;
  }

  realtimeStopRequested = true;
  setListeningUi(false);
  setVisualState("thinking", "Đang hoàn tất transcript và gửi tới AI...");
  cleanupAudioPipeline();
  sendLiveMessage({ type: "audio.commit" });
  clearTimeout(stopFallbackTimer);
  stopFallbackTimer = window.setTimeout(async () => {
    if (!realtimeStopRequested) {
      return;
    }

    sendLiveMessage({ type: "session.stop" });
    await closeLiveSocket();
    await submitTranscriptAfterStop();
  }, 1200);
}

async function submitTranscriptAfterStop() {
  if (submitAfterStopStarted) {
    return;
  }

  submitAfterStopStarted = true;
  realtimeStopRequested = false;
  const transcript = (finalTranscriptSegments.join(" ") || questionInput.value).trim();
  questionInput.value = transcript;
  renderTranscript();

  if (!transcript) {
    submitAfterStopStarted = false;
    setVisualState("idle", "Không nhận diện được nội dung giọng nói.");
    return;
  }

  await askQuestion({
    questionOverride: transcript,
    shouldSpeakAnswer: true,
  });
  submitAfterStopStarted = false;
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
    cleanupAudioPipeline();
    setListeningUi(false);

    if (!isAsking && !isAnswerAudioPlaying()) {
      setAvatarState("idle");
    }
  });

  liveSocket.addEventListener("error", () => {
    setVisualState("error", "Kết nối realtime STT bị lỗi.");
    setListeningUi(false);
  });
}

async function handleLiveEvent(payload) {
  const messageType = payload.type;

  if (messageType === "session.created") {
    setVisualState("listening", "Đã kết nối realtime STT...");
    return;
  }

  if (messageType === "session.ready") {
    liveSocketReady = true;
    setVisualState("listening");
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
    }
    transcriptPartialBox.textContent = "";
    renderTranscript();

    if (realtimeStopRequested) {
      clearTimeout(stopFallbackTimer);
      sendLiveMessage({ type: "session.stop" });
      await closeLiveSocket();
      await submitTranscriptAfterStop();
    }
    return;
  }

  if (messageType === "error") {
    setVisualState("error", `Lỗi realtime: ${payload.message || "Không xác định"}`);
    await closeLiveSocket();
    setAvatarState("idle");
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
  const combined = (finalTranscriptSegments.join(" ") || questionInput.value).trim();
  transcriptFinalBox.textContent = combined || "Nhấn mic để nói. Tắt mic sẽ tự gửi câu hỏi và phát câu trả lời.";
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
  setVisualState("speaking", "Đang tạo giọng đọc câu trả lời...");
  window.voiceAvatar?.setSpeechText(text);

  const response = await fetch("/text-to-speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    let detail = "Không thể tạo giọng đọc.";

    try {
      const errorData = await response.json();
      detail = errorData.detail || detail;
    } catch (error) {
      // Keep the default error.
    }

    throw new Error(detail);
  }

  const audioBlob = await response.blob();
  resetAnswerAudio();
  answerAudioUrl = URL.createObjectURL(audioBlob);
  const audio = getAnswerAudio();
  audio.src = answerAudioUrl;
  audio.onended = () => {
    finishAnswerLiveText(text);
    setVisualState("idle", "Hoàn tất phát câu trả lời.");
  };
  audio.controls = false;
  audio.classList.add("hidden");
  window.voiceAvatar?.connectAudio(audio);

  try {
    await audio.play();
    startAnswerLiveText(text, audio.duration);
    setVisualState("speaking");
  } catch (error) {
    setVisualState("speaking", "Trình duyệt chặn autoplay. Nhấn play để nghe câu trả lời.");
    setAvatarState("idle");
  }
}

function resetAnswerAudio() {
  const audio = getAnswerAudio();
  clearInterval(liveTextTimer);
  liveTextTimer = null;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio.classList.add("hidden");
  answerLiveBox.textContent = "";
  answerLiveBox.classList.add("hidden");

  if (answerAudioUrl) {
    URL.revokeObjectURL(answerAudioUrl);
    answerAudioUrl = null;
  }
}

if (window.lucide) {
  lucide.createIcons();
}
setVisualState("idle");

