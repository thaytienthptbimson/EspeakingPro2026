# SpeakMaster AI 1:1 — Ứng dụng Luyện Nói Tiếng Anh Chuẩn Format IELTS (Lớp 1 - Lớp 12 | CEFR A1 - C2)

## 1. Kiến trúc thư mục phân tách theo từng khối lớp
Dự án được thiết kế theo kiến trúc module hóa rõ ràng, trong đó **mỗi lớp từ Lớp 1 đến Lớp 12 nằm ở một file độc lập** trong thư mục `data/` để dễ dàng quản lý, bảo trì và mở rộng ngân hàng đề:

```text
ielts_speaking_k12/
├── index.html               # Giao diện chính của ứng dụng
├── README.md                # Hướng dẫn cấu trúc & vận hành
├── css/
│   └── styles.css           # Giao diện thông minh, hiệu ứng sóng âm & vòng tròn hội thoại 1:1
├── assets/
│   ├── emma.jpg             # Avatar Giám khảo Anh-Anh (Examiner Emma)
│   ├── marcus.jpg           # Avatar Huấn luyện viên Anh-Mỹ (Coach Marcus)
│   ├── chloe.jpg            # Avatar Cô giáo đồng hành Tiểu học & THCS (Tutor Chloe)
│   └── arthur.jpg           # Avatar Giáo sư Học thuật C1-C2 (Prof. Arthur)
├── data/
│   ├── personas.js          # Cấu hình giọng nói tự nhiên & phong cách phản hồi 1:1 của 4 nhân vật AI
│   ├── grade1.js            # Dữ liệu Lớp 1 (CEFR A1 - Starters Prep)
│   ├── grade2.js            # Dữ liệu Lớp 2 (CEFR A1 - Starters)
│   ├── grade3.js            # Dữ liệu Lớp 3 (CEFR A2 - Movers Prep)
│   ├── grade4.js            # Dữ liệu Lớp 4 (CEFR A2 - Movers)
│   ├── grade5.js            # Dữ liệu Lớp 5 (CEFR B1 - Flyers)
│   ├── grade6.js            # Dữ liệu Lớp 6 (CEFR B1 - KET / THCS)
│   ├── grade7.js            # Dữ liệu Lớp 7 (CEFR B2 - PET / B1+ -> B2)
│   ├── grade8.js            # Dữ liệu Lớp 8 (CEFR B2 - B2 First)
│   ├── grade9.js            # Dữ liệu Lớp 9 (CEFR C1 - Chuyên Anh & Chuyển cấp THPT)
│   ├── grade10.js           # Dữ liệu Lớp 10 (CEFR C1 - IELTS 6.5 - 7.5)
│   ├── grade11.js           # Dữ liệu Lớp 11 (CEFR C2 - IELTS 7.5+)
│   └── grade12.js           # Dữ liệu Lớp 12 (CEFR C2 - IELTS 8.0 - 9.0 Mastery)
└── js/
    ├── speechEngine.js      # Bộ máy Âm thanh Neural TTS, Nhận diện giọng nói STT & Sóng âm Web Audio
    ├── evaluator.js         # Bộ máy Chấm điểm AI 4 tiêu chí IELTS & Gợi ý nâng cấp từ vựng Band Booster
    └── app.js               # Điều khiển trung tâm, Phòng luyện nói 1:1 & Trình quản lý file trực tiếp
```

## 2. Cách chạy ứng dụng
- Mở trực tiếp file `index.html` trên trình duyệt (khuyến nghị Google Chrome hoặc Microsoft Edge để có bộ giọng đọc **Google Natural / Microsoft Online Neural** giống người thật nhất).
- Hoặc chạy qua bất kỳ máy chủ tĩnh nào: `python3 -m http.server 8000`.
