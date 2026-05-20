const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const clearBtn = document.getElementById("clearBtn");
const micStatus = document.getElementById("micStatus");
const statusBox = document.getElementById("status");
const transcriptFinalBox = document.getElementById("transcriptFinal");
const transcriptPartialBox = document.getElementById("transcriptPartial");
const speakAnswerToggle = document.getElementById("speakAnswerToggle");
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

let answerAudio = document.getElementById("answerAudio");
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

recordBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
clearBtn.addEventListener("click", clearConversation);

if (window.lucide) {
  window.lucide.createIcons();
}

setAvatarState("idle");

async function startRecording() {
  if (isListening || isAsking) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {
    setStatus("Trình duyệt chưa hỗ trợ ghi âm realtime.");
    return;
  }

  try {
    await closeLiveSocket();
    cleanupAudioPipeline();
    resetAnswerAudio();
    finalTranscriptSegments = [];
    realtimeStopRequested = false;
    renderTranscript();
    setListeningUi(true);
    setAvatarState("listening");
    setStatus("Đang kết nối realtime STT...");
    openLiveSocket();
  } catch (error) {
    setStatus(`Không thể bắt đầu ghi âm: ${error.message}`);
    cleanupAudioPipeline();
    await closeLiveSocket();
    setListeningUi(false);
    setAvatarState("idle");
  }
}

function stopRecording() {
  if (!liveSocket && !isListening) {
    return;
  }

  stopBtn.disabled = true;
  realtimeStopRequested = true;
  setStatus("Đang hoàn tất transcript...");
  cleanupAudioPipeline();
  sendLiveMessage({ type: "audio.commit" });

  window.clearTimeout(stopFallbackTimer);
  stopFallbackTimer = window.setTimeout(() => {
    if (realtimeStopRequested) {
      finishRealtimeTurn();
    }
  }, 1200);
}

async function finishRealtimeTurn() {
  const transcript = finalTranscriptSegments.join(" ").trim();

  setStatus(transcript ? "Đã nhận transcript." : "Không nhận diện được nội dung giọng nói.");
  sendLiveMessage({ type: "session.stop" });
  await closeLiveSocket();
  setListeningUi(false);
  realtimeStopRequested = false;

  if (transcript) {
    await askFromTranscript(transcript);
  } else {
    setAvatarState("idle");
  }
}

async function askFromTranscript(question) {
  isAsking = true;
  setBusy(true);
  setAvatarState("thinking");
  setStatus("Đang truy xuất RAG từ transcript...");

  const statusTimer = window.setTimeout(() => {
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

    if (speakAnswerToggle.checked && data.answer) {
      window.voiceAvatar?.setSpeechText(data.answer);
      await speakAnswer(data.answer);
    } else {
      setStatus("Đã có câu trả lời. TTS đang tắt.");
      setAvatarState("idle");
    }
  } catch (error) {
    setStatus(`Có lỗi: ${error.message}`);
    setAvatarState("idle");
  } finally {
    window.clearTimeout(statusTimer);
    isAsking = false;
    setBusy(false);
  }
}

function clearConversation() {
  if (isListening) {
    stopRecording();
  }

  finalTranscriptSegments = [];
  renderTranscript();
  resetAnswerAudio();
  setStatus("");
  setAvatarState("idle");
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
    window.clearTimeout(stopFallbackTimer);
    cleanupAudioPipeline();
    setListeningUi(false);

    if (!isAsking && !isAnswerAudioPlaying()) {
      setAvatarState("idle");
    }
  });

  liveSocket.addEventListener("error", () => {
    setStatus("Kết nối realtime STT bị lỗi.");
    setAvatarState("idle");
  });
}

async function handleLiveEvent(payload) {
  const messageType = payload.type;

  if (messageType === "session.created") {
    setStatus("Đã kết nối realtime STT.");
    return;
  }

  if (messageType === "session.ready") {
    liveSocketReady = true;
    setListeningUi(true);
    setAvatarState("listening");
    setStatus("Đang nghe...");
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
    }

    transcriptPartialBox.textContent = "";
    renderTranscript();

    if (realtimeStopRequested) {
      window.clearTimeout(stopFallbackTimer);
      await finishRealtimeTurn();
    }
    return;
  }

  if (messageType === "error") {
    setStatus(`Lỗi realtime: ${payload.message || "Không xác định"}`);
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
  setAvatarState("thinking");
  setStatus("Đang tạo giọng đọc ElevenLabs...");

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
      // Ignore invalid JSON error bodies.
    }

    throw new Error(detail);
  }

  const audioBlob = await response.blob();
  resetAnswerAudio();
  answerAudioUrl = URL.createObjectURL(audioBlob);

  const audio = getAnswerAudio();
  audio.src = answerAudioUrl;
  audio.classList.remove("hidden");
  window.voiceAvatar?.connectAudio(audio);

  try {
    await audio.play();
    setAvatarState("speaking");
    setStatus("Avatar đang đọc câu trả lời.");
  } catch (error) {
    setAvatarState("idle");
    setStatus("Đã tạo giọng đọc. Bấm play để nghe.");
  }
}

function getAnswerAudio() {
  if (answerAudio) {
    return answerAudio;
  }

  answerAudio = document.createElement("audio");
  answerAudio.id = "answerAudio";
  answerAudio.controls = true;
  answerAudio.classList.add("hidden");
  document.getElementById("audioSlot").appendChild(answerAudio);

  answerAudio.addEventListener("play", () => {
    setAvatarState("speaking");
  });
  answerAudio.addEventListener("ended", () => {
    setAvatarState("idle");
    setStatus("Hoàn tất.");
  });
  answerAudio.addEventListener("pause", () => {
    if (answerAudio.ended) {
      setAvatarState("idle");
    }
  });

  return answerAudio;
}

function resetAnswerAudio() {
  const audio = getAnswerAudio();
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  audio.classList.add("hidden");

  if (answerAudioUrl) {
    URL.revokeObjectURL(answerAudioUrl);
    answerAudioUrl = null;
  }
}

function setAvatarState(state) {
  document.body.dataset.avatarState = state;
  window.voiceAvatar?.setState(state);
}

function setListeningUi(nextIsListening) {
  isListening = nextIsListening;
  recordBtn.disabled = nextIsListening;
  stopBtn.disabled = !nextIsListening;
  recordBtn.classList.toggle("is-listening", nextIsListening);
  micStatus.textContent = nextIsListening ? "Đang nghe..." : "Mic sẵn sàng";
}

function setBusy(isBusy) {
  recordBtn.disabled = isBusy || isListening;
  clearBtn.disabled = isBusy;
}

function setStatus(message) {
  statusBox.textContent = message;
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

function isAnswerAudioPlaying() {
  const audio = getAnswerAudio();
  return !audio.paused && !audio.ended;
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
