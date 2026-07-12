import { Student, ClassGroup } from "../types";

/**
 * Draws a rounded rectangle path on the canvas context.
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Generates and downloads a student's calendar as a high-resolution PNG image.
 */
export function downloadStudentCalendarPNG(
  student: Student,
  year: number,
  month: number, // 0-indexed
  classes: ClassGroup[]
) {
  // 1. Calculate calendar grid details
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0: Sun, 6: Sat
  const totalCells = firstDayIndex + daysInMonth;
  const numRows = Math.ceil(totalCells / 7);

  // 2. Set high-resolution Canvas dimensions
  const width = 1000;
  const rowHeight = 120;
  const gridStartY = 240;
  const height = gridStartY + numRows * rowHeight + 40;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Enable high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // --- Style Declarations ---
  const fontFamily = "Pretendard, Inter, system-ui, -apple-system, sans-serif";

  // A. Background (pure white card style with a subtle outer border)
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Add elegant soft outer border
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, width - 12, height - 12);

  // B. Draw Top Header Title ("2026년 7월 수업 달력")
  const formattedMonth = String(month + 1).padStart(2, "0");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `bold 42px ${fontFamily}`;
  ctx.fillStyle = "#0f172a"; // Deep slate
  ctx.fillText(`${year}년 ${formattedMonth}월 수업 달력`, width / 2, 70);

  // C. Draw Student Metadata Sub-header
  ctx.font = `500 18px ${fontFamily}`;
  ctx.fillStyle = "#475569"; // Slate gray
  ctx.fillText(`학생명: ${student.name}`, width / 2, 125);

  // Draw elegant divider line
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, 160);
  ctx.lineTo(width - 60, 160);
  ctx.stroke();

  // D. Draw Weekdays Row
  const colWidth = (width - 120) / 7;
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  ctx.font = `bold 16px ${fontFamily}`;

  weekdays.forEach((dayName, i) => {
    const x = 60 + i * colWidth + colWidth / 2;
    if (i === 0) {
      ctx.fillStyle = "#ef4444"; // Red for Sunday
    } else if (i === 6) {
      ctx.fillStyle = "#3b82f6"; // Blue for Saturday
    } else {
      ctx.fillStyle = "#475569"; // Slate for weekdays
    }
    ctx.fillText(dayName, x, 195);
  });

  // Draw weekday underline
  ctx.strokeStyle = "#f1f5f9";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 215);
  ctx.lineTo(width - 60, 215);
  ctx.stroke();

  // E. Draw Calendar Grid
  const monthKey = `${year}-${month}`;
  const studentLessons = student.lessons?.[monthKey] || {};

  for (let cellIdx = 0; cellIdx < numRows * 7; cellIdx++) {
    const row = Math.floor(cellIdx / 7);
    const col = cellIdx % 7;
    const day = cellIdx - firstDayIndex + 1;

    const x = 60 + col * colWidth;
    const y = gridStartY + row * rowHeight;

    // Draw grid border for cells that are within the month
    if (day >= 1 && day <= daysInMonth) {
      const cellX = x + 4;
      const cellY = y + 4;
      const cellW = colWidth - 8;
      const cellH = rowHeight - 8;

      const hasLesson = studentLessons[String(day)];
      const lessonClass = hasLesson ? classes.find((c) => c.id === hasLesson) : null;

      if (lessonClass) {
        // Scheduled Lesson Day - Draw styled container
        // Draw low-opacity filled rounded rect background
        ctx.fillStyle = `${lessonClass.color}15`; // 8% opacity for delicate background
        drawRoundedRect(ctx, cellX, cellY, cellW, cellH, 12);
        ctx.fill();

        // Draw solid colored border
        ctx.strokeStyle = lessonClass.color;
        ctx.lineWidth = 3;
        drawRoundedRect(ctx, cellX, cellY, cellW, cellH, 12);
        ctx.stroke();

        // Draw Day Number (centered slightly higher)
        ctx.font = `bold 22px ${fontFamily}`;
        ctx.fillStyle = "#0f172a";
        ctx.fillText(String(day), cellX + cellW / 2, cellY + 38);

        // Draw class name text label at the bottom (excluding lesson counts)
        ctx.font = `bold 12px ${fontFamily}`;
        ctx.fillStyle = lessonClass.color;
        ctx.fillText(lessonClass.name, cellX + cellW / 2, cellY + cellH - 24);
      } else {
        // Plain Day (no lessons)
        // Subtly outline the day box to make it look like a calendar grid
        ctx.strokeStyle = "#f8fafc";
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, cellX, cellY, cellW, cellH, 12);
        ctx.stroke();

        ctx.font = `bold 18px ${fontFamily}`;
        if (col === 0) {
          ctx.fillStyle = "#fca5a5"; // Sunday muted red
        } else if (col === 6) {
          ctx.fillStyle = "#93c5fd"; // Saturday muted blue
        } else {
          ctx.fillStyle = "#64748b"; // Standard slate
        }
        ctx.fillText(String(day), cellX + cellW / 2, cellY + cellH / 2);
      }
    }
  }

  // 3. Trigger Client-Side Download
  try {
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `${year}년 ${formattedMonth}월 수업 (${student.name}).png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error("PNG 생성 및 다운로드 중 오류가 발생했습니다:", err);
  }
}
