/**
 * Module Âm thanh & Giọng nói AI Thông minh (js/speechEngine.js)
 * - Tự động nhận diện và xếp hạng các giọng đọc Neural / Natural giống người thật nhất trên trình duyệt
 * - Điều chỉnh nhịp điệu tự nhiên (prosody chunking, câu hỏi lên giọng, ngắt nghỉ tự nhiên)
 * - Nhận diện giọng nói thời gian thực (Web Speech API SpeechRecognition)
 * - Bộ phân tích sóng âm trực tiếp (Web Audio API AnalyserNode + mô phỏng sinh động khi AI nói)
 */
window.SpeechEngine = (function() {
  let synth = window.speechSynthesis || null;
  let voices = [];
  let recognition = null;
  let isRecognizing = false;
  let isSpeaking = false;
  let currentTranscript = "";
  let interimTranscript = "";
  let selectedSystemVoiceURI = "auto";
  let customRateMultiplier = 1.0;
  let customPitchMultiplier = 1.0;
  let audioCtx = null;
  let soundMuted = false;

  function initVoices(onLoaded) {
    if (!synth) return;
    function load() {
      voices = synth.getVoices() || [];
      if (typeof onLoaded === "function") onLoaded(voices);
    }
    load();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = load;
    }
  }

  // Xếp hạng độ tự nhiên của giọng nói (Ưu tiên Neural, Online Natural, Google, Enhanced, Premium)
  function scoreVoiceForPersona(voice, persona) {
    if (!voice) return -100;
    let score = 0;
    const name = (voice.name || "").toLowerCase();
    const lang = (voice.lang || "").toLowerCase();
    const targetLang = (persona.accent || "en-US").toLowerCase();

    if (lang.startsWith("en")) score += 30;
    else return -50;

    if (lang === targetLang) score += 40;
    else if (lang.includes(targetLang.split("-")[1] || "")) score += 25;

    // Ưu tiên các giọng Neural / Natural hiện đại nhất
    if (name.includes("natural") || name.includes("neural") || name.includes("online")) score += 60;
    if (name.includes("google") || name.includes("premium") || name.includes("enhanced") || name.includes("siri")) score += 45;

    if (Array.isArray(persona.voiceKeywords)) {
      persona.voiceKeywords.forEach((kw, idx) => {
        if (name.includes(kw.toLowerCase())) {
          score += (50 - idx * 4);
        }
      });
    }
    return score;
  }

  function getBestVoice(persona) {
    if (!voices || voices.length === 0) {
      if (synth) voices = synth.getVoices() || [];
    }
    if (selectedSystemVoiceURI !== "auto") {
      const found = voices.find(v => v.voiceURI === selectedSystemVoiceURI || v.name === selectedSystemVoiceURI);
      if (found) return found;
    }
    let best = null;
    let bestScore = -999;
    voices.forEach(v => {
      const s = scoreVoiceForPersona(v, persona);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    });
    return best || voices.find(v => (v.lang || "").toLowerCase().startsWith("en")) || voices[0] || null;
  }

  function getEnglishVoices() {
    if (!voices || voices.length === 0) {
      if (synth) voices = synth.getVoices() || [];
    }
    const enVoices = voices.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
    return enVoices.length > 0 ? enVoices : voices;
  }

  // Hiệu ứng âm thanh nhẹ nhàng bằng Web Audio API (chime khi bắt đầu/kết thúc ghi âm)
  function playCueTone(type) {
    if (soundMuted) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === "start") {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.14); // E5
      } else if (type === "stop") {
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.14);
      } else {
        osc.frequency.setValueAtTime(783.99, now); // G5
      }
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.19);
    } catch (e) {
      // Ignore audio context restriction
    }
  }

  // Phát giọng nói AI với ngữ điệu tự nhiên theo câu
  function speakText(text, persona, callbacks) {
    callbacks = callbacks || {};
    if (soundMuted) {
      if (callbacks.onStart) callbacks.onStart();
      setTimeout(() => {
        if (callbacks.onEnd) callbacks.onEnd();
      }, 600);
      return;
    }
    if (!synth) {
      if (callbacks.onEnd) callbacks.onEnd();
      return;
    }
    try {
      synth.cancel();
    } catch (e) {}

    const cleanText = String(text || "").replace(/[*_#`]/g, "").trim();
    if (!cleanText) {
      if (callbacks.onEnd) callbacks.onEnd();
      return;
    }

    // Chia thành các mệnh đề tự nhiên để tạo nhịp thở và ngữ điệu giống người thật
    const sentences = cleanText.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanText];
    const chosenVoice = getBestVoice(persona || {});
    let idx = 0;
    isSpeaking = true;
    if (callbacks.onStart) callbacks.onStart(chosenVoice);

    function speakNext() {
      if (!isSpeaking || idx >= sentences.length) {
        isSpeaking = false;
        if (callbacks.onEnd) callbacks.onEnd();
        return;
      }
      const chunk = sentences[idx].trim();
      idx++;
      if (!chunk) {
        speakNext();
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunk);
      if (chosenVoice) {
        utter.voice = chosenVoice;
        utter.lang = chosenVoice.lang || (persona && persona.accent) || "en-US";
      } else {
        utter.lang = (persona && persona.accent) || "en-US";
      }

      // Tinh chỉnh cao độ & tốc độ linh hoạt theo ngữ cảnh câu hỏi / câu cảm thán
      const baseRate = (persona && persona.rate ? persona.rate : 0.98) * customRateMultiplier;
      const basePitch = (persona && persona.pitch ? persona.pitch : 1.0) * customPitchMultiplier;
      const isQuestion = chunk.endsWith("?");
      const isExclaim = chunk.endsWith("!");

      utter.rate = Math.max(0.65, Math.min(1.35, isQuestion ? baseRate * 0.97 : baseRate));
      utter.pitch = Math.max(0.7, Math.min(1.4, isQuestion ? basePitch * 1.05 : (isExclaim ? basePitch * 1.04 : basePitch)));

      utter.onend = function() {
        if (idx < sentences.length && isSpeaking) {
          setTimeout(speakNext, 110);
        } else {
          isSpeaking = false;
          if (callbacks.onEnd) callbacks.onEnd();
        }
      };
      utter.onerror = function() {
        isSpeaking = false;
        if (callbacks.onEnd) callbacks.onEnd();
      };
      synth.speak(utter);
    }

    speakNext();
  }

  function stopSpeaking() {
    isSpeaking = false;
    if (synth) {
      try { synth.cancel(); } catch (e) {}
    }
  }

  // Nhận diện giọng nói Speech-to-Text
  function startRecognition(lang, callbacks) {
    callbacks = callbacks || {};
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      if (callbacks.onError) {
        callbacks.onError("Trình duyệt hiện tại hoặc khung xem trước đang giới hạn quyền Micro trực tiếp. Bạn có thể bấm 'Mô phỏng Giọng nói Mẫu' hoặc nhập/chỉnh sửa trực tiếp câu trả lời ở khung bên dưới để AI chấm điểm chi tiết!");
      }
      return false;
    }

    if (isRecognizing && recognition) {
      try { recognition.stop(); } catch (e) {}
    }

    stopSpeaking();
    playCueTone("start");

    recognition = new SR();
    recognition.lang = lang || "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    currentTranscript = "";
    interimTranscript = "";
    isRecognizing = true;

    recognition.onstart = function() {
      isRecognizing = true;
      if (callbacks.onStart) callbacks.onStart();
    };

    recognition.onresult = function(event) {
      interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentTranscript += event.results[i][0].transcript + " ";
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (callbacks.onResult) {
        callbacks.onResult(currentTranscript.trim(), interimTranscript.trim());
      }
    };

    recognition.onerror = function(event) {
      isRecognizing = false;
      if (callbacks.onError) {
        callbacks.onError("Không thể thu âm từ Micro (" + (event.error || "permission") + "). Hãy sử dụng nút 'Nói thử mẫu' hoặc nhập văn bản trực tiếp vào ô trả lời để AI phân tích Band điểm!");
      }
    };

    recognition.onend = function() {
      isRecognizing = false;
      playCueTone("stop");
      if (callbacks.onEnd) callbacks.onEnd(currentTranscript.trim());
    };

    try {
      recognition.start();
      return true;
    } catch (err) {
      isRecognizing = false;
      if (callbacks.onError) callbacks.onError("Không thể khởi động Micro trong khung hiện tại.");
      return false;
    }
  }

  function stopRecognition() {
    if (recognition && isRecognizing) {
      isRecognizing = false;
      try { recognition.stop(); } catch (e) {}
    }
  }

  function setVoiceURI(uri) {
    selectedSystemVoiceURI = uri || "auto";
  }

  function setProsody(rateMult, pitchMult) {
    customRateMultiplier = parseFloat(rateMult) || 1.0;
    customPitchMultiplier = parseFloat(pitchMult) || 1.0;
  }

  function setMuted(m) {
    soundMuted = !!m;
    if (soundMuted) stopSpeaking();
  }

  function isMuted() {
    return soundMuted;
  }

  return {
    initVoices,
    getEnglishVoices,
    getBestVoice,
    speakText,
    stopSpeaking,
    startRecognition,
    stopRecognition,
    setVoiceURI,
    setProsody,
    setMuted,
    isMuted,
    playCueTone
  };
})();
