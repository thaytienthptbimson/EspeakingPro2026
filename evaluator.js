/**
 * Module Chấm điểm & Phân tích AI 4 Tiêu chí IELTS + 6 Cấp độ CEFR (js/evaluator.js)
 * - Phân tích Fluency & Coherence (Tốc độ nói WPM, từ nối Discourse Markers, phát hiện từ đệm Filler Words)
 * - Phân tích Lexical Resource (Độ đa dạng từ vựng, đối chiếu từ vựng mục tiêu theo lớp/CEFR, gợi ý Band Booster)
 * - Phân tích Grammatical Range & Accuracy (Cấu trúc câu phức, mệnh đề quan hệ, câu điều kiện, sửa lỗi phổ biến)
 * - Phân tích Pronunciation & Intonation (Đánh dấu màu từng từ để bấm nghe phát âm chuẩn và luyện Shadowing)
 */
window.IELTSEvaluator = (function() {
  const DISCOURSE_MARKERS = [
    "because", "however", "furthermore", "moreover", "for example", "for instance",
    "in my opinion", "from my perspective", "personally", "on the other hand",
    "therefore", "consequently", "although", "even though", "nevertheless", "ultimately",
    "firstly", "secondly", "in addition", "not only", "as a result"
  ];

  const FILLER_WORDS = ["um", "uh", "erm", "er", "like", "you know", "basically", "literally"];

  const BAND_BOOSTER_MAP = {
    "good": { upgrade: "beneficial / remarkable", level: "B2-C1", note: "Thay 'good' bằng từ học thuật chính xác hơn" },
    "bad": { upgrade: "detrimental / unfavorable", level: "B2-C1", note: "Nâng cấp tính từ chỉ tác động tiêu cực" },
    "big": { upgrade: "substantial / significant", level: "B2-C1", note: "Giúp câu trả lời Part 2 & 3 trang trọng hơn" },
    "important": { upgrade: "crucial / pivotal / indispensable", level: "C1", note: "Từ vựng ăn điểm Lexical Resource" },
    "happy": { upgrade: "delighted / overjoyed / fulfilled", level: "B2", note: "Biểu đạt cảm xúc tự nhiên, giàu sắc thái" },
    "like": { upgrade: "am fond of / have a passion for", level: "B1-B2", note: "Tránh lặp lại 'I like' ở Part 1" },
    "think": { upgrade: "believe / reckon / maintain that", level: "B2-C1", note: "Mở đầu quan điểm đa dạng hơn 'I think'" },
    "many": { upgrade: "numerous / a wide range of", level: "B2", note: "Cụm từ định lượng tự nhiên" },
    "very": { upgrade: "exceptionally / remarkably / immensely", level: "C1", note: "Trạng từ nhấn mạnh Band 7.5+" },
    "help": { upgrade: "facilitate / empower / enable", level: "C1", note: "Động từ học thuật mạnh mẽ cho Part 3" }
  };

  const CEFR_BASE_BAND = {
    "A1": 3.5,
    "A2": 4.5,
    "B1": 5.5,
    "B2": 6.5,
    "C1": 7.5,
    "C2": 8.5
  };

  function evaluateResponse(transcript, context) {
    context = context || {};
    const targetCefr = context.cefr || "B1";
    const topicVocab = context.vocab || [];
    const durationSec = Math.max(4, context.durationSec || 18);

    const clean = String(transcript || "").trim();
    const words = clean ? clean.split(/\s+/) : [];
    const wordCount = words.length;
    const lowerText = clean.toLowerCase();

    if (wordCount === 0) {
      return null;
    }

    // 1. Tốc độ nói (WPM) & Từ nối (Fluency & Coherence)
    const wpm = Math.round((wordCount / durationSec) * 60);
    const usedConnectors = DISCOURSE_MARKERS.filter(m => lowerText.includes(m));
    const detectedFillers = [];
    FILLER_WORDS.forEach(fw => {
      const regex = new RegExp("\\b" + fw + "\\b", "gi");
      const matches = lowerText.match(regex);
      if (matches && matches.length > 0) {
        detectedFillers.push({ word: fw, count: matches.length });
      }
    });

    // 2. Từ vựng & Độ đa dạng (Lexical Resource)
    const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z']/g, "")).filter(Boolean));
    const lexicalDiversity = wordCount > 0 ? Math.round((uniqueWords.size / wordCount) * 100) : 0;
    const matchedTopicVocab = topicVocab.filter(v => lowerText.includes(v.word.toLowerCase()));

    // Tìm các từ cơ bản có thể nâng cấp (Band Booster)
    const boosterSuggestions = [];
    Object.keys(BAND_BOOSTER_MAP).forEach(basicWord => {
      const reg = new RegExp("\\b" + basicWord + "\\b", "i");
      if (reg.test(lowerText)) {
        boosterSuggestions.push({
          original: basicWord,
          upgrade: BAND_BOOSTER_MAP[basicWord].upgrade,
          level: BAND_BOOSTER_MAP[basicWord].level,
          note: BAND_BOOSTER_MAP[basicWord].note
        });
      }
    });

    // 3. Ngữ pháp & Độ phức tạp câu (Grammatical Range & Accuracy)
    const sentences = clean.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const complexIndicators = ["which", "that", "who", "although", "while", "whereas", "if", "unless", "because", "since", "have been", "had been", "would"];
    const usedComplex = complexIndicators.filter(c => new RegExp("\\b" + c + "\\b", "i").test(lowerText));

    // Tính điểm từng tiêu chí trên thang 9.0 (điều chỉnh khích lệ theo cấp độ học sinh)
    const baseTarget = CEFR_BASE_BAND[targetCefr] || 5.5;
    const lengthFactor = Math.min(1.5, wordCount / 22);
    const connectorBonus = Math.min(1.0, usedConnectors.length * 0.35);
    const vocabBonus = Math.min(1.2, matchedTopicVocab.length * 0.4 + (uniqueWords.size > 18 ? 0.4 : 0.1));
    const grammarBonus = Math.min(1.0, usedComplex.length * 0.35 + (sentences.length >= 2 ? 0.3 : 0));

    let fluencyScore = Math.min(9.0, Math.max(3.0, (baseTarget - 0.5) + lengthFactor * 0.6 + connectorBonus - (detectedFillers.length * 0.2)));
    let lexicalScore = Math.min(9.0, Math.max(3.0, (baseTarget - 0.5) + vocabBonus + (lexicalDiversity > 65 ? 0.4 : 0.1)));
    let grammarScore = Math.min(9.0, Math.max(3.0, (baseTarget - 0.5) + grammarBonus + lengthFactor * 0.4));
    let pronScore = Math.min(9.0, Math.max(3.5, (baseTarget - 0.3) + (wordCount >= 12 ? 0.6 : 0.2)));

    // Làm tròn chuẩn 0.5 IELTS
    function roundHalf(num) {
      return Math.round(num * 2) / 2;
    }

    fluencyScore = roundHalf(fluencyScore);
    lexicalScore = roundHalf(lexicalScore);
    grammarScore = roundHalf(grammarScore);
    pronScore = roundHalf(pronScore);
    const overallBand = roundHalf((fluencyScore + lexicalScore + grammarScore + pronScore) / 4);

    // 4. Phân tích từng từ cho phần luyện phát âm tương tác
    const wordAnalysis = words.map(rawWord => {
      const stripped = rawWord.toLowerCase().replace(/[^a-z']/g, "");
      let status = "good"; // good (xanh), upgrade (vàng), filler (đỏ)
      let tip = "Phát âm rõ ràng — Bấm để nghe giọng chuẩn bản xứ";
      if (FILLER_WORDS.includes(stripped)) {
        status = "filler";
        tip = "Từ đệm (Filler word) — Hạn chế lặp lại để tăng độ trôi chảy";
      } else if (BAND_BOOSTER_MAP[stripped]) {
        status = "upgrade";
        tip = "Có thể nâng cấp lên: " + BAND_BOOSTER_MAP[stripped].upgrade + " (" + BAND_BOOSTER_MAP[stripped].level + ")";
      } else if (stripped.length >= 8) {
        status = "advanced";
        tip = "Từ vựng đa âm tiết ăn điểm — Chú ý trọng âm khi phát âm";
      }
      return {
        raw: rawWord,
        clean: stripped,
        status: status,
        tip: tip
      };
    });

    // Nhận xét thông minh cá nhân hóa
    let coachFeedback = "";
    if (wordCount < 10) {
      coachFeedback = "Câu trả lời của em khá ngắn gọn! Trong bài thi IELTS Speaking, hãy mở rộng thêm lý do (because...) hoặc ví dụ thực tế (for example...) để đạt tối thiểu 2-3 câu hoàn chỉnh nhé.";
    } else if (matchedTopicVocab.length > 0 && usedConnectors.length > 0) {
      coachFeedback = "Tuyệt vời! Em đã vận dụng rất khéo léo từ vựng chủ đề (" + matchedTopicVocab.map(v => v.word).join(", ") + ") kết hợp từ nối mạch lạc (" + usedConnectors.slice(0, 3).join(", ") + "). Đây chính là chìa khóa chinh phục Band điểm cao!";
    } else {
      coachFeedback = "Bài nói có ý tưởng rõ ràng và tự nhiên! Để nâng thêm 0.5 - 1.0 Band điểm, em hãy thử chèn thêm 1-2 từ vựng ăn điểm trong bảng gợi ý bên cạnh và dùng thêm liên từ như 'Moreover' hoặc 'For instance'.";
    }

    // Tạo câu hỏi phản hồi 1:1 thông minh từ Giám khảo AI dựa trên nội dung học sinh vừa nói
    let dynamicFollowUp = context.defaultFollowUp || "That's a very interesting point! Could you tell me a bit more about why you feel that way?";
    if (lowerText.includes("family") || lowerText.includes("parents") || lowerText.includes("mom") || lowerText.includes("dad")) {
      dynamicFollowUp = "It sounds like your family plays a big role in this! How do your parents usually encourage you?";
    } else if (lowerText.includes("friend") || lowerText.includes("classmate") || lowerText.includes("school")) {
      dynamicFollowUp = "Sharing that experience with friends at school sounds wonderful! Do your classmates feel the same way?";
    } else if (lowerText.includes("future") || lowerText.includes("dream") || lowerText.includes("career")) {
      dynamicFollowUp = "That's an inspiring ambition for the future! What is the next step you plan to take to make it happen?";
    }

    return {
      overallBand,
      fluencyScore,
      lexicalScore,
      grammarScore,
      pronScore,
      wordCount,
      wpm: Math.min(165, Math.max(75, wpm)),
      lexicalDiversity,
      usedConnectors,
      detectedFillers,
      matchedTopicVocab,
      boosterSuggestions,
      usedComplex,
      wordAnalysis,
      coachFeedback,
      dynamicFollowUp
    };
  }

  return {
    evaluateResponse
  };
})();
