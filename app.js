/**
 * Bộ điều khiển trung tâm Ứng dụng Luyện Nói IELTS 1:1 K-12 (js/app.js)
 * Quản lý trạng thái 12 khối lớp (Lớp 1 - 12), 6 cấp độ CEFR (A1 - C2),
 * Phòng luyện nói 1:1, Chấm điểm AI 4 tiêu chí, Luyện phát âm Shadowing và Quản lý File từng Lớp.
 */
(function() {
  const state = {
    activeTab: "studio", // studio | curriculum | report | files
    selectedGrade: 6,
    selectedCefrFilter: "ALL", // ALL | A1 | A2 | B1 | B2 | C1 | C2
    selectedTopicIndex: 0,
    selectedPart: "part1", // part1 | part2 | part3 | shadowing
    selectedQuestionIndex: 0,
    selectedPersonaId: "emma",
    voiceRate: 1.0,
    voicePitch: 1.0,
    isRecording: false,
    isAISpeaking: false,
    recordingStartTime: 0,
    recordingSeconds: 0,
    recordingTimerId: null,
    part2TimerMode: "idle", // idle | prep (60s) | speak (120s)
    part2SecondsLeft: 60,
    part2IntervalId: null,
    chatMessages: [],
    latestEvaluation: null,
    historySessions: [],
    selectedCodeFileGrade: 1,
    waveformAnimId: null
  };

  function loadSavedState() {
    try {
      const savedHistory = localStorage.getItem("ielts_k12_history_v1");
      if (savedHistory) {
        state.historySessions = JSON.parse(savedHistory) || [];
      }
    } catch (e) {}
  }

  function saveHistoryState() {
    try {
      localStorage.setItem("ielts_k12_history_v1", JSON.stringify(state.historySessions.slice(0, 30)));
    } catch (e) {}
  }

  function showToast(message, type) {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    const bgClass = type === "success"
      ? "bg-emerald-600/95 border-emerald-400"
      : (type === "warning" ? "bg-amber-600/95 border-amber-400" : "bg-indigo-600/95 border-indigo-400");
    toast.className = "px-4 py-3 rounded-xl border text-white text-sm font-medium shadow-2xl transition-all duration-300 flex items-center gap-2 " + bgClass;
    toast.innerHTML = '<span>✨</span><span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3600);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCurrentGradeObj() {
    const grades = window.IELTS_K12_GRADES || {};
    return grades[state.selectedGrade] || grades[1];
  }

  function getCurrentTopicObj() {
    const g = getCurrentGradeObj();
    if (!g || !g.topics || g.topics.length === 0) return null;
    const idx = Math.min(state.selectedTopicIndex, g.topics.length - 1);
    return g.topics[idx];
  }

  function getCurrentPersonaObj() {
    const list = window.IELTS_K12_PERSONAS || [];
    return list.find(p => p.id === state.selectedPersonaId) || list[0];
  }

  function getActiveQuestionData() {
    const topic = getCurrentTopicObj();
    if (!topic) return { prompt: "", vi: "", starters: [], sample: "", followUp: "" };
    if (state.selectedPart === "part1") {
      const qList = topic.part1 || [];
      const item = qList[Math.min(state.selectedQuestionIndex, qList.length - 1)] || qList[0] || {};
      return {
        badge: "IELTS Speaking Part 1 • Phỏng vấn Phản xạ 1:1",
        prompt: item.q || "",
        vi: item.vi || "",
        starters: item.starters || [],
        sample: item.sample || "",
        followUp: item.followUp || "",
        bullets: []
      };
    } else if (state.selectedPart === "part2") {
      const p2 = topic.part2 || {};
      return {
        badge: "IELTS Speaking Part 2 • Độc thoại Cue Card (1p Chuẩn bị - 2p Nói)",
        prompt: p2.cueCard || "",
        vi: p2.viCueCard || "",
        starters: ["I would like to talk about...", "What impressed me most about this is...", "Overall, this experience taught me..."],
        sample: p2.sample || "",
        followUp: "Thank you! Let's move on to a quick follow-up question about your talk.",
        bullets: p2.bullets || []
      };
    } else if (state.selectedPart === "part3") {
      const qList = topic.part3 || [];
      const item = qList[Math.min(state.selectedQuestionIndex, qList.length - 1)] || qList[0] || {};
      return {
        badge: "IELTS Speaking Part 3 • Thảo luận Tư duy Học thuật 2 Chiều",
        prompt: item.q || "",
        vi: item.vi || "",
        starters: item.starters || [],
        sample: item.sample || "",
        followUp: item.followUp || "",
        bullets: []
      };
    } else {
      // Shadowing Mode
      const p1 = (topic.part1 && topic.part1[0]) || {};
      return {
        badge: "Shadowing Mode • Luyện Ngữ điệu & Phát âm Chuẩn Bản xứ",
        prompt: p1.sample || (topic.part2 && topic.part2.sample) || "",
        vi: "Hãy bấm nghe Giám khảo AI đọc mẫu câu trả lời chuẩn bên trên, sau đó thu âm đọc nhại lại đúng ngữ điệu và trọng âm!",
        starters: [],
        sample: p1.sample || "",
        followUp: "Great pronunciation effort! Keep practicing your intonation rhythm.",
        bullets: []
      };
    }
  }

  // Khởi tạo sóng âm trực quan trên Canvas
  function startWaveformLoop() {
    const canvas = document.getElementById("audioWaveCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let phase = 0;

    function renderWave() {
      const width = canvas.width = canvas.clientWidth || 320;
      const height = canvas.height = canvas.clientHeight || 48;
      ctx.clearRect(0, 0, width, height);

      const bars = 38;
      const barWidth = Math.max(3, Math.floor((width - bars * 3) / bars));
      const active = state.isAISpeaking || state.isRecording;
      phase += active ? 0.18 : 0.04;

      for (let i = 0; i < bars; i++) {
        let amp = 4;
        if (active) {
          amp = Math.abs(Math.sin(phase + i * 0.35) * Math.cos(phase * 0.6 - i * 0.2)) * (height * 0.78) + 5;
        } else {
          amp = Math.abs(Math.sin(phase + i * 0.25)) * 5 + 3;
        }
        const x = i * (barWidth + 3) + 4;
        const y = (height - amp) / 2;

        if (state.isRecording) {
          ctx.fillStyle = "#f43f5e";
        } else if (state.isAISpeaking) {
          ctx.fillStyle = "#38bdf8";
        } else {
          ctx.fillStyle = "rgba(148, 163, 184, 0.35)";
        }
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, amp, 3);
        ctx.fill();
      }
      state.waveformAnimId = requestAnimationFrame(renderWave);
    }
    if (state.waveformAnimId) cancelAnimationFrame(state.waveformAnimId);
    renderWave();
  }

  // Render Thanh chọn 12 Lớp & Bộ lọc 6 Cấp độ CEFR
  function renderGradeSelectorBar() {
    const gradeContainer = document.getElementById("gradeSelectorBar");
    if (!gradeContainer) return;
    const grades = window.IELTS_K12_GRADES || {};
    let html = "";
    for (let g = 1; g <= 12; g++) {
      const gObj = grades[g];
      if (!gObj) continue;
      if (state.selectedCefrFilter !== "ALL" && gObj.cefr !== state.selectedCefrFilter) {
        continue;
      }
      const isSelected = state.selectedGrade === g;
      const activeCls = isSelected
        ? "grade-pill-active"
        : "bg-slate-800/80 text-slate-300 border-slate-700 hover:border-indigo-400 hover:text-white";
      html += '<button type="button" data-grade="' + g + '" class="grade-select-btn px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ' + activeCls + '">'
        + '<span>Lớp ' + g + '</span>'
        + '<span class="px-1.5 py-0.5 rounded bg-black/25 text-[10px] font-bold">' + gObj.cefr + '</span>'
        + '</button>';
    }
    gradeContainer.innerHTML = html;

    gradeContainer.querySelectorAll(".grade-select-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const gNum = parseInt(this.getAttribute("data-grade"), 10);
        selectGrade(gNum);
      });
    });

    // Cập nhật nút lọc CEFR
    document.querySelectorAll(".cefr-filter-btn").forEach(btn => {
      const lv = btn.getAttribute("data-cefr");
      if (lv === state.selectedCefrFilter) {
        btn.className = "cefr-filter-btn px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow";
      } else {
        btn.className = "cefr-filter-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:text-white";
      }
    });
  }

  function selectGrade(gradeNum) {
    state.selectedGrade = gradeNum;
    state.selectedTopicIndex = 0;
    state.selectedQuestionIndex = 0;
    const gObj = getCurrentGradeObj();
    if (gObj && gObj.recommendedPersona) {
      state.selectedPersonaId = gObj.recommendedPersona;
    }
    resetStudioConversation();
    renderAll();
  }

  // Khởi tạo cuộc hội thoại 1:1 mới khi đổi bài/đổi giám khảo
  function resetStudioConversation() {
    const persona = getCurrentPersonaObj();
    const gObj = getCurrentGradeObj();
    const qData = getActiveQuestionData();
    state.chatMessages = [
      {
        sender: "ai",
        speakerName: persona.name,
        text: persona.greeting + " Welcome to " + gObj.title + " (" + gObj.cefr + ").",
        subtext: "Bấm vào biểu tượng loa cạnh tin nhắn bất kỳ để nghe lại giọng đọc tự nhiên của Giám khảo."
      },
      {
        sender: "ai",
        speakerName: persona.name,
        text: qData.prompt,
        subtext: qData.vi
      }
    ];
    renderChatStream();
  }

  // Render danh sách Giám khảo AI 1:1
  function renderPersonaCards() {
    const container = document.getElementById("personaCardsContainer");
    if (!container) return;
    const personas = window.IELTS_K12_PERSONAS || [];
    let html = "";
    personas.forEach(p => {
      const isSelected = p.id === state.selectedPersonaId;
      const borderCls = isSelected
        ? "border-sky-400 bg-sky-950/40 ring-2 ring-sky-400/30"
        : "border-slate-700/80 bg-slate-800/50 hover:border-slate-500";
      html += '<div data-persona="' + p.id + '" class="persona-card cursor-pointer p-2.5 rounded-xl border transition-all flex items-center gap-3 ' + borderCls + '">'
        + '<img src="' + p.avatar + '" alt="' + escapeHtml(p.name) + '" class="w-12 h-12 rounded-full object-cover border-2 ' + (isSelected ? 'border-sky-400' : 'border-slate-600') + ' shrink-0" />'
        + '<div class="min-w-0 flex-1">'
        + '<div class="flex items-center justify-between gap-1">'
        + '<p class="text-xs font-bold text-white truncate">' + escapeHtml(p.name) + '</p>'
        + '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-900/90 text-sky-300 font-medium shrink-0">' + escapeHtml(p.accentLabel) + '</span>'
        + '</div>'
        + '<p class="text-[11px] text-slate-300 truncate mt-0.5">' + escapeHtml(p.role) + '</p>'
        + '<p class="text-[10px] text-indigo-300 mt-0.5">Phù hợp: ' + escapeHtml(p.recommendedGrades) + '</p>'
        + '</div>'
        + '</div>';
    });
    container.innerHTML = html;

    container.querySelectorAll(".persona-card").forEach(card => {
      card.addEventListener("click", function() {
        const pid = this.getAttribute("data-persona");
        state.selectedPersonaId = pid;
        const pObj = getCurrentPersonaObj();
        renderPersonaCards();
        renderActiveStageHeader();
        speakAI(pObj.greeting);
      });
    });
  }

  // Render Header Giám khảo AI và câu hỏi hiện tại
  function renderActiveStageHeader() {
    const persona = getCurrentPersonaObj();
    const gObj = getCurrentGradeObj();
    const topic = getCurrentTopicObj();
    const qData = getActiveQuestionData();

    const avatarImg = document.getElementById("stageExaminerAvatar");
    if (avatarImg && persona) {
      avatarImg.src = persona.avatar;
      avatarImg.alt = persona.name;
      if (state.isAISpeaking) {
        avatarImg.classList.add("avatar-speaking");
      } else {
        avatarImg.classList.remove("avatar-speaking");
      }
    }

    const nameEl = document.getElementById("stageExaminerName");
    if (nameEl && persona) nameEl.textContent = persona.name;

    const roleEl = document.getElementById("stageExaminerRole");
    if (roleEl && persona) roleEl.textContent = persona.role + " • " + persona.accentLabel;

    const statusBadge = document.getElementById("stageAIStatusBadge");
    if (statusBadge) {
      if (state.isAISpeaking) {
        statusBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-400/40 flex items-center gap-1.5";
        statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span><span>Đang trò chuyện 1:1...</span>';
      } else if (state.isRecording) {
        statusBadge.className = "px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-400/40 flex items-center gap-1.5";
        statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span><span>Đang lắng nghe em nói...</span>';
      } else {
        statusBadge.className = "px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5";
        statusBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>Sẵn sàng tương tác 1:1</span>';
      }
    }

    // Render thông tin lớp & chủ đề
    const gradeBanner = document.getElementById("currentGradeInfoBanner");
    if (gradeBanner && gObj && topic) {
      gradeBanner.innerHTML = '<div class="flex flex-wrap items-center justify-between gap-2">'
        + '<div>'
        + '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-400/30">Khối Lớp ' + gObj.grade + ' • Cấp độ ' + gObj.cefr + '</span>'
        + '<span class="ml-2 text-xs text-slate-300 font-medium">Mục tiêu: ' + escapeHtml(gObj.bandTarget) + '</span>'
        + '<h2 class="text-base sm:text-lg font-bold text-white mt-1">' + escapeHtml(topic.title) + ' <span class="text-sm font-normal text-slate-400">(' + escapeHtml(topic.viTitle) + ')</span></h2>'
        + '</div>'
        + '<div class="flex items-center gap-2">'
        + '<label for="topicSelectDropdown" class="text-xs text-slate-400">Chủ đề:</label>'
        + '<select id="topicSelectDropdown" class="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-400">'
        + gObj.topics.map((t, idx) => '<option value="' + idx + '" ' + (idx === state.selectedTopicIndex ? 'selected' : '') + '>' + escapeHtml(t.title) + ' (' + t.cefr + ')</option>').join("")
        + '</select>'
        + '</div>'
        + '</div>';

      const dropdown = document.getElementById("topicSelectDropdown");
      if (dropdown) {
        dropdown.addEventListener("change", function() {
          state.selectedTopicIndex = parseInt(this.value, 10) || 0;
          state.selectedQuestionIndex = 0;
          resetStudioConversation();
          renderAll();
        });
      }
    }

    // Render các nút chọn Part (Part 1, Part 2, Part 3, Shadowing)
    document.querySelectorAll(".part-mode-btn").forEach(btn => {
      const pMode = btn.getAttribute("data-part");
      if (pMode === state.selectedPart) {
        btn.className = "part-mode-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500 text-slate-950 shadow";
      } else {
        btn.className = "part-mode-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700";
      }
    });

    // Render thẻ câu hỏi hiện tại
    const promptBadgeEl = document.getElementById("activePartBadge");
    if (promptBadgeEl) promptBadgeEl.textContent = qData.badge;

    const promptTextEl = document.getElementById("activeQuestionPrompt");
    if (promptTextEl) promptTextEl.textContent = qData.prompt;

    const promptViEl = document.getElementById("activeQuestionVi");
    if (promptViEl) promptViEl.textContent = qData.vi;

    // Render Cue Card Bullets & Bộ đếm giờ Part 2 nếu đang ở Part 2
    const part2Box = document.getElementById("part2CueCardBox");
    if (part2Box) {
      if (state.selectedPart === "part2") {
        part2Box.classList.remove("hidden");
        const ul = document.getElementById("part2BulletsList");
        if (ul) {
          ul.innerHTML = (qData.bullets || []).map(b => '<li class="flex items-start gap-2 text-xs text-slate-200"><span class="text-sky-400">•</span><span>' + escapeHtml(b) + '</span></li>').join("");
        }
      } else {
        part2Box.classList.add("hidden");
      }
    }

    // Render Gợi ý mở đầu câu (Sentence Starters) & Từ vựng chủ đề
    const startersBox = document.getElementById("sentenceStartersBox");
    if (startersBox) {
      const starters = qData.starters || [];
      if (starters.length > 0) {
        startersBox.innerHTML = starters.map(s =>
          '<button type="button" data-starter="' + escapeHtml(s) + '" class="starter-insert-btn px-2.5 py-1 rounded-lg bg-indigo-950/70 hover:bg-indigo-800/80 border border-indigo-500/30 text-xs text-indigo-200 transition-all">+ ' + escapeHtml(s) + '</button>'
        ).join("");
        startersBox.querySelectorAll(".starter-insert-btn").forEach(b => {
          b.addEventListener("click", function() {
            const st = this.getAttribute("data-starter");
            const input = document.getElementById("userSpeechInput");
            if (input) {
              const cleanStarter = st.replace(/\.\.\.$/, " ");
              input.value = (input.value ? input.value.trim() + " " : "") + cleanStarter;
              input.focus();
            }
          });
        });
      } else {
        startersBox.innerHTML = '<span class="text-xs text-slate-400">Hãy bấm nghe mẫu và nhại lại theo nhịp điệu của Giám khảo.</span>';
      }
    }

    // Render danh sách từ vựng chủ đề bên phải
    const vocabContainer = document.getElementById("topicVocabList");
    if (vocabContainer && topic) {
      const vList = topic.vocab || [];
      vocabContainer.innerHTML = vList.map(v =>
        '<div class="p-2.5 rounded-xl bg-slate-900/75 border border-slate-800 hover:border-indigo-500/40 transition-all">'
        + '<div class="flex items-center justify-between gap-2">'
        + '<div class="flex items-center gap-2">'
        + '<span class="text-xs font-bold text-sky-300">' + escapeHtml(v.word) + '</span>'
        + '<span class="text-[11px] font-mono text-slate-400">' + escapeHtml(v.ipa) + '</span>'
        + '<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">' + escapeHtml(v.level) + '</span>'
        + '</div>'
        + '<button type="button" data-word="' + escapeHtml(v.word) + '" class="vocab-speak-btn px-2 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-xs text-white transition-all" title="Nghe phát âm chuẩn">🔊 Nghe</button>'
        + '</div>'
        + '<p class="text-xs text-amber-200/90 font-medium mt-1">Nghĩa: ' + escapeHtml(v.meaning) + '</p>'
        + '<p class="text-[11px] text-slate-400 italic mt-0.5">"' + escapeHtml(v.example) + '"</p>'
        + '</div>'
      ).join("");

      vocabContainer.querySelectorAll(".vocab-speak-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const w = this.getAttribute("data-word");
          speakAI(w);
        });
      });
    }
  }

  // Render Luồng Hội thoại 1:1 (Chat Stream)
  function renderChatStream() {
    const stream = document.getElementById("chatStreamContainer");
    if (!stream) return;
    const persona = getCurrentPersonaObj();

    let html = "";
    state.chatMessages.forEach((msg, index) => {
      if (msg.sender === "ai") {
        html += '<div class="flex items-start gap-3">'
          + '<img src="' + persona.avatar + '" alt="AI" class="w-8 h-8 rounded-full object-cover border border-sky-400 shrink-0 mt-0.5" />'
          + '<div class="max-w-[85%] rounded-2xl rounded-tl-none bg-slate-800/90 border border-slate-700/80 px-3.5 py-2.5">'
          + '<div class="flex items-center justify-between gap-2 mb-1">'
          + '<span class="text-[11px] font-bold text-sky-300">' + escapeHtml(msg.speakerName || persona.name) + '</span>'
          + '<button type="button" data-msg-idx="' + index + '" class="replay-msg-btn text-[11px] text-slate-300 hover:text-sky-300 flex items-center gap-1">🔊 Nghe lại</button>'
          + '</div>'
          + '<p class="text-xs sm:text-sm text-slate-100 leading-relaxed">' + escapeHtml(msg.text) + '</p>'
          + (msg.subtext ? '<p class="text-[11px] text-slate-400 mt-1 italic">' + escapeHtml(msg.subtext) + '</p>' : '')
          + '</div>'
          + '</div>';
      } else {
        html += '<div class="flex items-start justify-end gap-3">'
          + '<div class="max-w-[85%] rounded-2xl rounded-tr-none bg-indigo-600/90 border border-indigo-400/40 px-3.5 py-2.5 text-white">'
          + '<div class="flex items-center justify-between gap-3 mb-1">'
          + '<span class="text-[11px] font-bold text-indigo-100">Học sinh (Bài nói của bạn)</span>'
          + (msg.band ? '<span class="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-extrabold">Band ' + msg.band + '</span>' : '')
          + '</div>'
          + '<p class="text-xs sm:text-sm leading-relaxed">' + escapeHtml(msg.text) + '</p>'
          + '</div>'
          + '</div>';
      }
    });

    stream.innerHTML = html;
    stream.scrollTop = stream.scrollHeight;

    stream.querySelectorAll(".replay-msg-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const idx = parseInt(this.getAttribute("data-msg-idx"), 10);
        if (state.chatMessages[idx]) {
          speakAI(state.chatMessages[idx].text);
        }
      });
    });
  }

  function speakAI(text, onDone) {
    const persona = getCurrentPersonaObj();
    window.SpeechEngine.setProsody(state.voiceRate, state.voicePitch);
    window.SpeechEngine.speakText(text, persona, {
      onStart: function() {
        state.isAISpeaking = true;
        renderActiveStageHeader();
      },
      onEnd: function() {
        state.isAISpeaking = false;
        renderActiveStageHeader();
        if (typeof onDone === "function") onDone();
      }
    });
  }

  // Bắt đầu hoặc Dừng Thu âm Giọng nói 1:1
  function toggleRecording() {
    const micBtn = document.getElementById("micRecordBtn");
    const inputEl = document.getElementById("userSpeechInput");

    if (state.isRecording) {
      window.SpeechEngine.stopRecognition();
      stopRecordingTimer();
      state.isRecording = false;
      if (micBtn) micBtn.classList.remove("mic-recording");
      renderActiveStageHeader();
      return;
    }

    const persona = getCurrentPersonaObj();
    const started = window.SpeechEngine.startRecognition(persona.accent || "en-US", {
      onStart: function() {
        state.isRecording = true;
        state.recordingStartTime = Date.now();
        startRecordingTimer();
        if (micBtn) micBtn.classList.add("mic-recording");
        renderActiveStageHeader();
        showToast("Micro đang thu âm! Hãy nói tự nhiên bằng tiếng Anh...", "info");
      },
      onResult: function(finalText, interimText) {
        if (inputEl) {
          inputEl.value = (finalText + " " + interimText).trim();
        }
      },
      onError: function(errMsg) {
        state.isRecording = false;
        stopRecordingTimer();
        if (micBtn) micBtn.classList.remove("mic-recording");
        renderActiveStageHeader();
        showToast(errMsg, "warning");
      },
      onEnd: function() {
        state.isRecording = false;
        stopRecordingTimer();
        if (micBtn) micBtn.classList.remove("mic-recording");
        renderActiveStageHeader();
      }
    });

    if (!started && inputEl && !inputEl.value.trim()) {
      // Điền sẵn gợi ý mẫu nếu môi trường sandbox không có micro vật lý để người dùng trải nghiệm ngay
      const qData = getActiveQuestionData();
      if (qData.sample) {
        inputEl.value = qData.sample;
      }
    }
  }

  function startRecordingTimer() {
    stopRecordingTimer();
    state.recordingSeconds = 0;
    const timerLabel = document.getElementById("recordingTimerDisplay");
    state.recordingTimerId = setInterval(() => {
      state.recordingSeconds++;
      if (timerLabel) {
        const mins = String(Math.floor(state.recordingSeconds / 60)).padStart(2, "0");
        const secs = String(state.recordingSeconds % 60).padStart(2, "0");
        timerLabel.textContent = mins + ":" + secs;
      }
    }, 1000);
  }

  function stopRecordingTimer() {
    if (state.recordingTimerId) {
      clearInterval(state.recordingTimerId);
      state.recordingTimerId = null;
    }
  }

  // Nộp câu trả lời để AI chấm điểm 4 tiêu chí & Phản hồi 1:1
  function submitUserSpeakingResponse() {
    const inputEl = document.getElementById("userSpeechInput");
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) {
      showToast("Hãy thu âm giọng nói hoặc nhập/chọn câu trả lời mẫu trước khi chấm điểm!", "warning");
      return;
    }

    if (state.isRecording) {
      toggleRecording();
    }

    const gObj = getCurrentGradeObj();
    const topic = getCurrentTopicObj();
    const qData = getActiveQuestionData();
    const persona = getCurrentPersonaObj();

    const evalResult = window.IELTSEvaluator.evaluateResponse(text, {
      cefr: gObj.cefr,
      vocab: topic ? topic.vocab : [],
      durationSec: state.recordingSeconds > 3 ? state.recordingSeconds : Math.max(8, Math.round(text.split(/\s+/).length / 2.2)),
      defaultFollowUp: qData.followUp
    });

    if (!evalResult) return;
    state.latestEvaluation = {
      grade: gObj.grade,
      cefr: gObj.cefr,
      topicTitle: topic ? topic.title : "",
      part: state.selectedPart,
      question: qData.prompt,
      userTranscript: text,
      sampleAnswer: qData.sample,
      timestamp: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      result: evalResult
    };

    state.historySessions.unshift(state.latestEvaluation);
    saveHistoryState();

    // Đẩy câu trả lời của học sinh và phản hồi thông minh của Giám khảo vào luồng 1:1
    state.chatMessages.push({
      sender: "user",
      text: text,
      band: evalResult.overallBand
    });

    const aiReply = "Band " + evalResult.overallBand + " — " + evalResult.dynamicFollowUp;
    state.chatMessages.push({
      sender: "ai",
      speakerName: persona.name,
      text: evalResult.dynamicFollowUp,
      subtext: evalResult.coachFeedback
    });

    inputEl.value = "";
    renderChatStream();
    renderInlineEvaluationPreview();
    renderDetailedReportTab();
    speakAI(evalResult.dynamicFollowUp);
    showToast("Đã chấm điểm AI: Overall Band " + evalResult.overallBand + "!", "success");
  }

  // Hiển thị kết quả chấm nhanh ngay dưới khung luyện nói
  function renderInlineEvaluationPreview() {
    const box = document.getElementById("inlineEvalSummaryBox");
    if (!box) return;
    if (!state.latestEvaluation) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    const ev = state.latestEvaluation.result;

    const wordBadges = ev.wordAnalysis.map(w => {
      let cls = "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
      if (w.status === "upgrade") cls = "bg-amber-500/25 text-amber-200 border-amber-400/40";
      else if (w.status === "filler") cls = "bg-rose-500/25 text-rose-200 border-rose-400/40 line-through";
      else if (w.status === "advanced") cls = "bg-sky-500/25 text-sky-200 border-sky-400/40 font-semibold";
      return '<button type="button" data-speak-word="' + escapeHtml(w.clean) + '" title="' + escapeHtml(w.tip) + '" class="inline-word-speak px-2 py-0.5 rounded-md border text-xs transition-transform hover:scale-105 ' + cls + '">' + escapeHtml(w.raw) + '</button>';
    }).join(" ");

    const boostersHtml = ev.boosterSuggestions.length > 0
      ? ev.boosterSuggestions.map(b =>
          '<div class="text-xs bg-slate-900/90 border border-amber-500/30 rounded-lg px-2.5 py-1.5">'
          + '<span class="line-through text-rose-300 mr-1">' + escapeHtml(b.original) + '</span>'
          + '<span class="text-emerald-300 font-bold">→ ' + escapeHtml(b.upgrade) + '</span>'
          + '<span class="ml-1.5 text-[10px] text-slate-400">(' + escapeHtml(b.note) + ')</span>'
          + '</div>'
        ).join("")
      : '<p class="text-xs text-emerald-300">Từ vựng của em rất tự nhiên, không phát hiện từ đơn điệu cần thay thế!</p>';

    box.innerHTML = '<div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/90 via-slate-900 to-slate-900 border border-indigo-500/40 shadow-xl">'
      + '<div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">'
      + '<div class="flex items-center gap-3">'
      + '<div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-slate-950 flex flex-col items-center justify-center font-extrabold shadow-lg">'
      + '<span class="text-[10px] uppercase tracking-wider">Band</span>'
      + '<span class="text-xl leading-none">' + ev.overallBand + '</span>'
      + '</div>'
      + '<div>'
      + '<h4 class="text-sm font-bold text-white">Kết quả Phân tích Giọng nói & Ngôn từ AI 1:1</h4>'
      + '<p class="text-xs text-slate-300 mt-0.5">Tốc độ: <strong class="text-sky-300">' + ev.wpm + ' WPM</strong> • Độ đa dạng từ: <strong class="text-emerald-300">' + ev.lexicalDiversity + '%</strong> • Số từ: <strong>' + ev.wordCount + ' từ</strong></p>'
      + '</div>'
      + '</div>'
      + '<button type="button" id="openFullReportBtn" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition-all">Xem Báo cáo Chuyên sâu →</button>'
      + '</div>'
      + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">'
      + '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800"><p class="text-[11px] text-slate-400">Fluency & Coherence</p><p class="text-base font-extrabold text-sky-300 mt-0.5">' + ev.fluencyScore + '</p></div>'
      + '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800"><p class="text-[11px] text-slate-400">Lexical Resource</p><p class="text-base font-extrabold text-emerald-300 mt-0.5">' + ev.lexicalScore + '</p></div>'
      + '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800"><p class="text-[11px] text-slate-400">Grammar Range</p><p class="text-base font-extrabold text-amber-300 mt-0.5">' + ev.grammarScore + '</p></div>'
      + '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800"><p class="text-[11px] text-slate-400">Pronunciation</p><p class="text-base font-extrabold text-purple-300 mt-0.5">' + ev.pronScore + '</p></div>'
      + '</div>'
      + '<div class="mt-2">'
      + '<p class="text-xs font-semibold text-slate-300 mb-1.5">Băng ghi âm Tương tác (Bấm vào bất kỳ từ nào để nghe phát âm chuẩn; <span class="text-sky-300">Xanh dương = Từ nâng cao</span>, <span class="text-amber-300">Vàng = Nên nâng cấp Band</span>):</p>'
      + '<div class="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">' + wordBadges + '</div>'
      + '</div>'
      + '<div class="mt-3">'
      + '<p class="text-xs font-semibold text-amber-300 mb-1.5">🚀 Gợi ý Nâng cấp Từ vựng (Band Booster):</p>'
      + '<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">' + boostersHtml + '</div>'
      + '</div>'
      + '</div>';

    box.querySelectorAll(".inline-word-speak").forEach(btn => {
      btn.addEventListener("click", function() {
        const w = this.getAttribute("data-speak-word");
        if (w) speakAI(w);
      });
    });

    const openBtn = document.getElementById("openFullReportBtn");
    if (openBtn) {
      openBtn.addEventListener("click", function() {
        switchMainTab("report");
      });
    }
  }

  // Bộ đếm giờ chuẩn phòng thi cho IELTS Part 2 (1 phút chuẩn bị + 2 phút nói)
  function startPart2Timer(mode) {
    if (state.part2IntervalId) {
      clearInterval(state.part2IntervalId);
      state.part2IntervalId = null;
    }
    state.part2TimerMode = mode;
    state.part2SecondsLeft = mode === "prep" ? 60 : 120;
    window.SpeechEngine.playCueTone("start");
    updatePart2TimerUI();

    state.part2IntervalId = setInterval(() => {
      state.part2SecondsLeft--;
      updatePart2TimerUI();
      if (state.part2SecondsLeft <= 0) {
        clearInterval(state.part2IntervalId);
        state.part2IntervalId = null;
        window.SpeechEngine.playCueTone("stop");
        if (mode === "prep") {
          showToast("Hết 1 phút chuẩn bị Part 2! Bắt đầu 2 phút trình bày bài nói Cue Card.", "info");
          startPart2Timer("speak");
        } else {
          showToast("Hoàn thành 2 phút trình bày IELTS Part 2!", "success");
        }
      }
    }, 1000);
  }

  function updatePart2TimerUI() {
    const disp = document.getElementById("part2CountdownDisplay");
    if (!disp) return;
    const mins = String(Math.floor(state.part2SecondsLeft / 60)).padStart(2, "0");
    const secs = String(state.part2SecondsLeft % 60).padStart(2, "0");
    const label = state.part2TimerMode === "prep" ? "Chuẩn bị (Prep)" : (state.part2TimerMode === "speak" ? "Đang nói (Speak)" : "Sẵn sàng");
    disp.textContent = label + " • " + mins + ":" + secs;
  }

  // Render Tab 2: Thư viện Chuyên đề 12 Lớp & 6 Cấp độ CEFR (A1 - C2)
  function renderCurriculumExplorerTab() {
    const container = document.getElementById("curriculumGridContainer");
    if (!container) return;
    const grades = window.IELTS_K12_GRADES || {};
    let html = "";

    for (let g = 1; g <= 12; g++) {
      const gObj = grades[g];
      if (!gObj) continue;
      if (state.selectedCefrFilter !== "ALL" && gObj.cefr !== state.selectedCefrFilter) continue;

      const topicsHtml = (gObj.topics || []).map((t, tIdx) =>
        '<div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between gap-2">'
        + '<div>'
        + '<div class="flex items-center justify-between gap-2">'
        + '<span class="text-[11px] font-bold text-sky-400">' + escapeHtml(t.category) + '</span>'
        + '<span class="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">CEFR ' + escapeHtml(t.cefr) + '</span>'
        + '</div>'
        + '<h4 class="text-sm font-bold text-white mt-1">' + escapeHtml(t.title) + '</h4>'
        + '<p class="text-xs text-slate-400">' + escapeHtml(t.viTitle) + '</p>'
        + '<p class="text-[11px] text-slate-300 mt-2">• Part 1: ' + (t.part1 ? t.part1.length : 0) + ' câu hỏi phản xạ 1:1</p>'
        + '<p class="text-[11px] text-slate-300">• Part 2 Cue Card: ' + escapeHtml(t.part2 ? t.part2.cueCard : "") + '</p>'
        + '<p class="text-[11px] text-slate-300">• Part 3: ' + (t.part3 ? t.part3.length : 0) + ' câu hỏi thảo luận học thuật</p>'
        + '</div>'
        + '<div class="flex items-center gap-2 pt-2 border-t border-slate-800/80">'
        + '<button type="button" data-practice-grade="' + g + '" data-practice-topic="' + tIdx + '" class="practice-now-btn flex-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white text-center transition-all">🎙️ Vào Phòng Luyện 1:1</button>'
        + '<button type="button" data-view-file="' + g + '" class="view-grade-file-btn px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-all" title="Xem mã nguồn file grade' + g + '.js">📄 grade' + g + '.js</button>'
        + '</div>'
        + '</div>'
      ).join("");

      html += '<div class="glass-card rounded-2xl p-4 border border-slate-800">'
        + '<div class="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">'
        + '<div>'
        + '<div class="flex items-center gap-2">'
        + '<span class="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-extrabold">LỚP ' + g + '</span>'
        + '<span class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-400/30 text-xs font-bold">Cấp độ ' + gObj.cefr + '</span>'
        + '<span class="text-xs text-emerald-300 font-semibold">' + escapeHtml(gObj.bandTarget) + '</span>'
        + '</div>'
        + '<h3 class="text-base font-bold text-white mt-1.5">' + escapeHtml(gObj.title) + '</h3>'
        + '<p class="text-xs text-slate-400 mt-0.5">' + escapeHtml(gObj.description) + '</p>'
        + '</div>'
        + '<span class="font-mono text-xs px-2.5 py-1 rounded-lg bg-slate-900 text-amber-300 border border-slate-700">data/grade' + g + '.js</span>'
        + '</div>'
        + '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' + topicsHtml + '</div>'
        + '</div>';
    }

    container.innerHTML = html;

    container.querySelectorAll(".practice-now-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const g = parseInt(this.getAttribute("data-practice-grade"), 10);
        const t = parseInt(this.getAttribute("data-practice-topic"), 10);
        state.selectedGrade = g;
        state.selectedTopicIndex = t;
        state.selectedQuestionIndex = 0;
        const gObj = getCurrentGradeObj();
        if (gObj && gObj.recommendedPersona) state.selectedPersonaId = gObj.recommendedPersona;
        resetStudioConversation();
        switchMainTab("studio");
        renderAll();
      });
    });

    container.querySelectorAll(".view-grade-file-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const g = parseInt(this.getAttribute("data-view-file"), 10);
        state.selectedCodeFileGrade = g;
        switchMainTab("files");
        renderModularFilesTab();
      });
    });
  }

  // Render Tab 3: Báo cáo Chấm điểm AI & Lịch sử Luyện tập
  function renderDetailedReportTab() {
    const container = document.getElementById("reportContentContainer");
    if (!container) return;

    if (!state.latestEvaluation && state.historySessions.length > 0) {
      state.latestEvaluation = state.historySessions[0];
    }

    if (!state.latestEvaluation) {
      container.innerHTML = '<div class="glass-card rounded-2xl p-8 text-center">'
        + '<p class="text-base font-bold text-white">Chưa có bài nói nào được chấm điểm trong phiên này</p>'
        + '<p class="text-xs text-slate-400 mt-1">Hãy vào tab Phòng Luyện Nói 1:1, thu âm hoặc chọn câu trả lời mẫu và bấm "Chấm điểm AI & Phản hồi 1:1" để xem phân tích chi tiết 4 tiêu chí IELTS.</p>'
        + '<button type="button" id="goToStudioFromEmptyReport" class="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white">🎙️ Bắt đầu Luyện nói ngay</button>'
        + '</div>';
      const btn = document.getElementById("goToStudioFromEmptyReport");
      if (btn) btn.addEventListener("click", () => switchMainTab("studio"));
      return;
    }

    const item = state.latestEvaluation;
    const ev = item.result;

    const historyHtml = state.historySessions.map((h, idx) =>
      '<div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">'
      + '<div>'
      + '<p class="text-xs font-bold text-white">Lớp ' + h.grade + ' (' + h.cefr + ') • ' + escapeHtml(h.topicTitle) + '</p>'
      + '<p class="text-[11px] text-slate-400 truncate max-w-md">"' + escapeHtml(h.userTranscript) + '"</p>'
      + '</div>'
      + '<div class="flex items-center gap-2 shrink-0">'
      + '<span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-extrabold text-xs">Band ' + h.result.overallBand + '</span>'
      + '<button type="button" data-hist-idx="' + idx + '" class="view-hist-btn px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-300">Xem</button>'
      + '</div>'
      + '</div>'
    ).join("");

    container.innerHTML = '<div class="grid grid-cols-1 lg:grid-cols-3 gap-4">'
      + '<div class="lg:col-span-2 space-y-4">'
      + '<div class="glass-card rounded-2xl p-5 border border-indigo-500/30">'
      + '<div class="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">'
      + '<div>'
      + '<span class="px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold">Lớp ' + item.grade + ' • CEFR ' + item.cefr + ' • ' + item.part.toUpperCase() + '</span>'
      + '<h3 class="text-lg font-bold text-white mt-1.5">' + escapeHtml(item.topicTitle) + '</h3>'
      + '<p class="text-xs text-slate-400">Câu hỏi: ' + escapeHtml(item.question) + '</p>'
      + '</div>'
      + '<div class="text-center px-4 py-2.5 rounded-2xl bg-gradient-to-br from-emerald-400 to-sky-500 text-slate-950 font-extrabold">'
      + '<div class="text-[10px] uppercase">Overall IELTS Band</div>'
      + '<div class="text-2xl">' + ev.overallBand + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">'
      + '<div class="p-3 rounded-xl bg-slate-900 border border-slate-800"><div class="text-xs text-slate-400">Fluency & Coherence</div><div class="text-xl font-extrabold text-sky-400 mt-1">' + ev.fluencyScore + '</div><div class="text-[11px] text-slate-400 mt-0.5">' + ev.wpm + ' từ/phút</div></div>'
      + '<div class="p-3 rounded-xl bg-slate-900 border border-slate-800"><div class="text-xs text-slate-400">Lexical Resource</div><div class="text-xl font-extrabold text-emerald-400 mt-1">' + ev.lexicalScore + '</div><div class="text-[11px] text-slate-400 mt-0.5">Đa dạng: ' + ev.lexicalDiversity + '%</div></div>'
      + '<div class="p-3 rounded-xl bg-slate-900 border border-slate-800"><div class="text-xs text-slate-400">Grammatical Range</div><div class="text-xl font-extrabold text-amber-400 mt-1">' + ev.grammarScore + '</div><div class="text-[11px] text-slate-400 mt-0.5">Cấu trúc: ' + (ev.usedComplex.length || 1) + ' mẫu</div></div>'
      + '<div class="p-3 rounded-xl bg-slate-900 border border-slate-800"><div class="text-xs text-slate-400">Pronunciation</div><div class="text-xl font-extrabold text-purple-400 mt-1">' + ev.pronScore + '</div><div class="text-[11px] text-slate-400 mt-0.5">Chuẩn ngữ điệu</div></div>'
      + '</div>'
      + '<div class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">'
      + '<p class="text-xs font-bold text-sky-300">💬 Nhận xét từ Giám khảo AI:</p>'
      + '<p class="text-xs text-slate-200 leading-relaxed">' + escapeHtml(ev.coachFeedback) + '</p>'
      + '</div>'
      + '<div class="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 mt-3">'
      + '<div class="flex items-center justify-between gap-2 mb-1">'
      + '<p class="text-xs font-bold text-emerald-300">🌟 Câu trả lời Mẫu Chuẩn IELTS Band 8.0+ (So sánh & Học hỏi):</p>'
      + '<button type="button" id="reportSpeakSampleBtn" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">🔊 Nghe bài mẫu</button>'
      + '</div>'
      + '<p class="text-xs sm:text-sm text-slate-100 leading-relaxed italic">"' + escapeHtml(item.sampleAnswer) + '"</p>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="glass-card rounded-2xl p-5 border border-slate-800">'
      + '<h4 class="text-sm font-bold text-white mb-3">📚 Lịch sử Phiên Luyện nói 1:1</h4>'
      + '<div class="space-y-2.5 max-h-96 overflow-y-auto">' + historyHtml + '</div>'
      + '</div>'
      + '</div>';

    const speakSampleBtn = document.getElementById("reportSpeakSampleBtn");
    if (speakSampleBtn) {
      speakSampleBtn.addEventListener("click", function() {
        speakAI(item.sampleAnswer);
      });
    }

    container.querySelectorAll(".view-hist-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        const idx = parseInt(this.getAttribute("data-hist-idx"), 10);
        if (state.historySessions[idx]) {
          state.latestEvaluation = state.historySessions[idx];
          renderDetailedReportTab();
        }
      });
    });
  }

  // Render Tab 4: Quản lý Mã nguồn Tách riêng 12 File Lớp (grade1.js ... grade12.js)
  function renderModularFilesTab() {
    const fileListEl = document.getElementById("modularFileTreeList");
    const codeViewerEl = document.getElementById("modularCodeEditorArea");
    const fileTitleEl = document.getElementById("activeModularFileName");
    if (!fileListEl || !codeViewerEl) return;

    const grades = window.IELTS_K12_GRADES || {};
    let treeHtml = "";
    for (let g = 1; g <= 12; g++) {
      const gObj = grades[g];
      const active = state.selectedCodeFileGrade === g;
      const cls = active
        ? "bg-indigo-600 text-white font-bold border-indigo-400"
        : "bg-slate-900/70 text-slate-300 border-slate-800 hover:border-slate-600";
      treeHtml += '<button type="button" data-file-grade="' + g + '" class="modular-file-btn w-full text-left px-3 py-2 rounded-xl border text-xs transition-all flex items-center justify-between ' + cls + '">'
        + '<span>📁 data/grade' + g + '.js</span>'
        + '<span class="px-1.5 py-0.5 rounded bg-black/30 text-[10px]">' + (gObj ? gObj.cefr : "") + '</span>'
        + '</button>';
    }
    fileListEl.innerHTML = treeHtml;

    const activeGObj = grades[state.selectedCodeFileGrade] || grades[1];
    if (fileTitleEl && activeGObj) {
      fileTitleEl.textContent = "data/grade" + activeGObj.grade + ".js — " + activeGObj.title + " (CEFR " + activeGObj.cefr + ")";
    }

    const generatedCode = [
      "/**",
      " * Tệp dữ liệu độc lập: data/grade" + activeGObj.grade + ".js",
      " * Khối lớp: Lớp " + activeGObj.grade + " | Cấp độ CEFR: " + activeGObj.cefr + " (" + activeGObj.bandTarget + ")",
      " */",
      "window.IELTS_K12_GRADES = window.IELTS_K12_GRADES || {};",
      "window.IELTS_K12_GRADES[" + activeGObj.grade + "] = " + JSON.stringify(activeGObj, null, 2) + ";"
    ].join(String.fromCharCode(10));

    codeViewerEl.value = generatedCode;

    fileListEl.querySelectorAll(".modular-file-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        state.selectedCodeFileGrade = parseInt(this.getAttribute("data-file-grade"), 10);
        renderModularFilesTab();
      });
    });
  }

  function downloadCurrentGradeFile() {
    const grades = window.IELTS_K12_GRADES || {};
    const activeGObj = grades[state.selectedCodeFileGrade] || grades[1];
    const codeViewerEl = document.getElementById("modularCodeEditorArea");
    const content = codeViewerEl ? codeViewerEl.value : "";
    const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grade" + activeGObj.grade + ".js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Đã tải xuống tệp mã nguồn data/grade" + activeGObj.grade + ".js!", "success");
  }

  function applyCustomGradeCodeEdit() {
    const codeViewerEl = document.getElementById("modularCodeEditorArea");
    if (!codeViewerEl) return;
    const raw = codeViewerEl.value;
    try {
      const jsonMatch = raw.match(/window\.IELTS_K12_GRADES\[\d+\]\s*=\s*(\{[\s\S]*\});?/);
      if (!jsonMatch) {
        showToast("Cú pháp file cần giữ nguyên cấu trúc window.IELTS_K12_GRADES[grade] = {...}", "warning");
        return;
      }
      const parsed = JSON.parse(jsonMatch[1].replace(/;\s*$/, ""));
      window.IELTS_K12_GRADES[state.selectedCodeFileGrade] = parsed;
      renderAll();
      showToast("Đã cập nhật dữ liệu trực tiếp cho file data/grade" + state.selectedCodeFileGrade + ".js!", "success");
    } catch (err) {
      showToast("Lỗi JSON trong mã nguồn chỉnh sửa: " + err.message, "warning");
    }
  }

  function switchMainTab(tabId) {
    state.activeTab = tabId;
    const sections = {
      studio: document.getElementById("tabSectionStudio"),
      curriculum: document.getElementById("tabSectionCurriculum"),
      report: document.getElementById("tabSectionReport"),
      files: document.getElementById("tabSectionFiles")
    };
    Object.keys(sections).forEach(k => {
      if (sections[k]) {
        if (k === tabId) sections[k].classList.remove("hidden");
        else sections[k].classList.add("hidden");
      }
    });

    document.querySelectorAll(".main-nav-tab").forEach(btn => {
      const t = btn.getAttribute("data-tab");
      if (t === tabId) {
        btn.className = "main-nav-tab px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-lg transition-all";
      } else {
        btn.className = "main-nav-tab px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all";
      }
    });

    if (tabId === "curriculum") renderCurriculumExplorerTab();
    if (tabId === "report") renderDetailedReportTab();
    if (tabId === "files") renderModularFilesTab();
  }

  function populateSystemVoiceSelect() {
    const selectEl = document.getElementById("systemVoiceSelector");
    if (!selectEl) return;
    const enVoices = window.SpeechEngine.getEnglishVoices();
    let html = '<option value="auto">✨ Tự động chọn Giọng Neural giống người thật nhất (Khuyên dùng)</option>';
    enVoices.forEach(v => {
      html += '<option value="' + escapeHtml(v.voiceURI || v.name) + '">' + escapeHtml(v.name) + ' (' + escapeHtml(v.lang) + ')</option>';
    });
    selectEl.innerHTML = html;
  }

  function renderAll() {
    renderGradeSelectorBar();
    renderPersonaCards();
    renderActiveStageHeader();
    renderChatStream();
    renderInlineEvaluationPreview();
  }

  // Gắn kết toàn bộ sự kiện điều khiển
  function bindEvents() {
    document.querySelectorAll(".main-nav-tab").forEach(btn => {
      btn.addEventListener("click", function() {
        switchMainTab(this.getAttribute("data-tab"));
      });
    });

    document.querySelectorAll(".cefr-filter-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        state.selectedCefrFilter = this.getAttribute("data-cefr");
        // Nếu lớp hiện tại không thuộc CEFR vừa chọn, tự động chuyển sang lớp đầu tiên thuộc CEFR đó
        if (state.selectedCefrFilter !== "ALL") {
          const grades = window.IELTS_K12_GRADES || {};
          const currentG = grades[state.selectedGrade];
          if (!currentG || currentG.cefr !== state.selectedCefrFilter) {
            for (let g = 1; g <= 12; g++) {
              if (grades[g] && grades[g].cefr === state.selectedCefrFilter) {
                state.selectedGrade = g;
                state.selectedTopicIndex = 0;
                state.selectedQuestionIndex = 0;
                break;
              }
            }
          }
        }
        renderAll();
        if (state.activeTab === "curriculum") renderCurriculumExplorerTab();
      });
    });

    document.querySelectorAll(".part-mode-btn").forEach(btn => {
      btn.addEventListener("click", function() {
        state.selectedPart = this.getAttribute("data-part");
        state.selectedQuestionIndex = 0;
        const qData = getActiveQuestionData();
        const persona = getCurrentPersonaObj();
        state.chatMessages.push({
          sender: "ai",
          speakerName: persona.name,
          text: qData.prompt,
          subtext: qData.vi
        });
        renderActiveStageHeader();
        renderChatStream();
        speakAI(qData.prompt);
      });
    });

    const speakQuestionBtn = document.getElementById("speakActiveQuestionBtn");
    if (speakQuestionBtn) {
      speakQuestionBtn.addEventListener("click", function() {
        const qData = getActiveQuestionData();
        speakAI(qData.prompt);
      });
    }

    const nextQuestionBtn = document.getElementById("nextQuestionBtn");
    if (nextQuestionBtn) {
      nextQuestionBtn.addEventListener("click", function() {
        const topic = getCurrentTopicObj();
        if (!topic) return;
        if (state.selectedPart === "part1" && topic.part1) {
          state.selectedQuestionIndex = (state.selectedQuestionIndex + 1) % topic.part1.length;
        } else if (state.selectedPart === "part3" && topic.part3) {
          state.selectedQuestionIndex = (state.selectedQuestionIndex + 1) % topic.part3.length;
        } else if (state.selectedPart === "part2") {
          state.selectedPart = "part3";
          state.selectedQuestionIndex = 0;
        }
        const qData = getActiveQuestionData();
        const persona = getCurrentPersonaObj();
        state.chatMessages.push({
          sender: "ai",
          speakerName: persona.name,
          text: qData.prompt,
          subtext: qData.vi
        });
        renderActiveStageHeader();
        renderChatStream();
        speakAI(qData.prompt);
      });
    }

    const sampleAnswerBtn = document.getElementById("fillSampleAnswerBtn");
    if (sampleAnswerBtn) {
      sampleAnswerBtn.addEventListener("click", function() {
        const qData = getActiveQuestionData();
        const inputEl = document.getElementById("userSpeechInput");
        if (inputEl && qData.sample) {
          inputEl.value = qData.sample;
          speakAI(qData.sample);
          showToast("Đã điền bài nói mẫu chuẩn IELTS và phát giọng đọc mẫu!", "info");
        }
      });
    }

    const micBtn = document.getElementById("micRecordBtn");
    if (micBtn) {
      micBtn.addEventListener("click", toggleRecording);
    }

    const submitBtn = document.getElementById("submitResponseBtn");
    if (submitBtn) {
      submitBtn.addEventListener("click", submitUserSpeakingResponse);
    }

    const voiceSelect = document.getElementById("systemVoiceSelector");
    if (voiceSelect) {
      voiceSelect.addEventListener("change", function() {
        window.SpeechEngine.setVoiceURI(this.value);
        const persona = getCurrentPersonaObj();
        speakAI("Voice updated! Let's continue practicing together.");
      });
    }

    const rateSlider = document.getElementById("voiceRateSlider");
    const rateValLabel = document.getElementById("voiceRateLabel");
    if (rateSlider) {
      rateSlider.addEventListener("input", function() {
        state.voiceRate = parseFloat(this.value) || 1.0;
        if (rateValLabel) rateValLabel.textContent = state.voiceRate.toFixed(2) + "x";
        window.SpeechEngine.setProsody(state.voiceRate, state.voicePitch);
      });
    }

    const pitchSlider = document.getElementById("voicePitchSlider");
    const pitchValLabel = document.getElementById("voicePitchLabel");
    if (pitchSlider) {
      pitchSlider.addEventListener("input", function() {
        state.voicePitch = parseFloat(this.value) || 1.0;
        if (pitchValLabel) pitchValLabel.textContent = state.voicePitch.toFixed(2);
        window.SpeechEngine.setProsody(state.voiceRate, state.voicePitch);
      });
    }

    const muteBtn = document.getElementById("muteToggleBtn");
    if (muteBtn) {
      muteBtn.addEventListener("click", function() {
        const muted = !window.SpeechEngine.isMuted();
        window.SpeechEngine.setMuted(muted);
        this.textContent = muted ? "🔇 Đang tắt tiếng" : "🔊 Âm thanh: Bật";
      });
    }

    const prepTimerBtn = document.getElementById("startPart2PrepBtn");
    if (prepTimerBtn) {
      prepTimerBtn.addEventListener("click", function() {
        startPart2Timer("prep");
      });
    }

    const speakTimerBtn = document.getElementById("startPart2SpeakBtn");
    if (speakTimerBtn) {
      speakTimerBtn.addEventListener("click", function() {
        startPart2Timer("speak");
      });
    }

    const dlGradeBtn = document.getElementById("downloadGradeFileBtn");
    if (dlGradeBtn) {
      dlGradeBtn.addEventListener("click", downloadCurrentGradeFile);
    }

    const saveCodeBtn = document.getElementById("saveGradeCodeBtn");
    if (saveCodeBtn) {
      saveCodeBtn.addEventListener("click", applyCustomGradeCodeEdit);
    }
  }

  window.addEventListener("DOMContentLoaded", function() {
    loadSavedState();
    window.SpeechEngine.initVoices(function() {
      populateSystemVoiceSelect();
    });
    populateSystemVoiceSelect();
    resetStudioConversation();
    bindEvents();
    renderAll();
    startWaveformLoop();
  });
})();
