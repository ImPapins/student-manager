import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";
import { Student, ClassGroup } from "../types";

interface CalendarProps {
  mode: "main" | "student";
  student?: Student; // for student mode
  students: Student[]; // all students (needed for main mode to aggregate)
  classes: ClassGroup[];
  selectedDays: number[];
  onToggleDay: (day: number) => void;
  onToggleWeekday: (dow: number) => void;
  onToggleDays: (days: number[]) => void;
  onClearSelection: () => void;
  year: number;
  month: number;
  onDateChange: (year: number, month: number) => void;
}

export const Calendar: React.FC<CalendarProps> = ({
  mode,
  student,
  students,
  classes,
  selectedDays,
  onToggleDay,
  onToggleWeekday,
  onToggleDays,
  onClearSelection,
  year,
  month,
  onDateChange,
}) => {
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const arr = [];
    for (let y = currentYear - 5; y <= currentYear + 5; y++) {
      arr.push(y);
    }
    return arr;
  }, []);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i);
  }, []);

  const handlePrevMonth = () => {
    if (month === 0) {
      onDateChange(year - 1, 11);
    } else {
      onDateChange(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onDateChange(year + 1, 0);
    } else {
      onDateChange(year, month + 1);
    }
  };

  const monthKey = `${year}-${month}`;

  // Aggregate lessons for this year/month
  const aggregatedLessons = useMemo(() => {
    const map: { [day: string]: { classId: string; studentName?: string }[] } = {};

    if (mode === "student") {
      if (!student || !student.lessons) return map;
      const studentLessons = student.lessons[monthKey] || {};
      Object.entries(studentLessons).forEach(([day, classId]) => {
        map[day] = [{ classId: classId as string }];
      });
    } else {
      // Main mode: aggregate from all students
      students.forEach((s) => {
        if (!s.lessons) return;
        const studentLessons = s.lessons[monthKey] || {};
        Object.entries(studentLessons).forEach(([day, classId]) => {
          if (!map[day]) map[day] = [];
          const exists = map[day].some(
            (item) => item.classId === classId && item.studentName === s.name
          );
          if (!exists) {
            map[day].push({ classId: classId as string, studentName: s.name });
          }
        });
      });
    }
    return map;
  }, [mode, student, students, monthKey]);

  const lessonCounts = useMemo(() => {
    if (mode !== "student" || !student || !student.lessons || !student.baseDate) {
      return {};
    }

    const base = student.baseDate;
    const dates: string[] = [];

    Object.entries(student.lessons).forEach(([mKey, dayMap]) => {
      const [yStr, mStr] = mKey.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);

      Object.keys(dayMap).forEach((dayStr) => {
        const d = parseInt(dayStr, 10);
        const formatted = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        dates.push(formatted);
      });
    });

    dates.sort();

    const validDates = dates.filter((d) => d >= base);

    const map: { [dateStr: string]: string } = {};
    validDates.forEach((dateStr, idx) => {
      map[dateStr] = `${idx + 1}회차`;
    });

    return map;
  }, [mode, student]);

  const daysInMonth = useMemo(() => {
    return new Date(year, month + 1, 0).getDate();
  }, [year, month]);

  const firstDayIndex = useMemo(() => {
    return new Date(year, month, 1).getDay();
  }, [year, month]);

  const weeks = useMemo(() => {
    const result: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Padding at the start
    for (let i = 0; i < firstDayIndex; i++) {
      currentWeek.push(null);
    }

    // Fill days
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        result.push(currentWeek);
        currentWeek = [];
      }
    }

    // Final padding if needed
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      result.push(currentWeek);
    }

    return result;
  }, [firstDayIndex, daysInMonth]);

  const isToday = (day: number) => {
    const today = new Date();
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  // Build gradient style for days with multiple classes scheduled
  const getDayStyle = (day: number): React.CSSProperties => {
    const isTodayDate = isToday(day);
    const dayLessons = aggregatedLessons[String(day)];
    
    let backgroundStyle: string | undefined = undefined;
    let boxShadowStyle: string | undefined = undefined;

    if (dayLessons && dayLessons.length > 0) {
      const lessonClasses = dayLessons
        .map((item) => classes.find((c) => c.id === item.classId))
        .filter((c): c is ClassGroup => !!c);

      const uniqueColors = Array.from(new Set(lessonClasses.map((lc) => lc.color)));

      if (uniqueColors.length === 1) {
        const color = uniqueColors[0];
        backgroundStyle = `${color}18`;
        boxShadowStyle = `inset 0 0 0 2px ${color}`;
      } else if (uniqueColors.length > 1) {
        const equalSegment = 100 / uniqueColors.length;
        const stops = uniqueColors
          .map(
            (color, index) =>
              `${color}18 ${index * equalSegment}% ${(index + 1) * equalSegment}%`
          )
          .join(", ");
        backgroundStyle = `linear-gradient(135deg, ${stops})`;
        boxShadowStyle = `inset 0 0 0 2px ${uniqueColors[0]}`;
      }
    }

    if (isTodayDate) {
      // Prioritize red border for today (2.5px width to make it stand out beautifully)
      boxShadowStyle = "inset 0 0 0 2.5px #ef4444";
    }

    return {
      background: backgroundStyle,
      boxShadow: boxShadowStyle,
    };
  };

  // Group day lessons text nicely
  const getDayTooltipText = (day: number) => {
    const dayLessons = aggregatedLessons[String(day)];
    if (!dayLessons || dayLessons.length === 0) return "";

    // Group students by class
    const byClass: { [classId: string]: { name: string; students: string[] } } = {};
    dayLessons.forEach((item) => {
      const cls = classes.find((c) => c.id === item.classId);
      const className = cls ? cls.name : "미지정";
      if (!byClass[item.classId]) {
        byClass[item.classId] = { name: className, students: [] };
      }
      if (item.studentName) {
        byClass[item.classId].students.push(item.studentName);
      }
    });

    return Object.values(byClass)
      .map((item) => {
        return item.students.length > 0
          ? `${item.name}: ${item.students.join(", ")}`
          : item.name;
      })
      .join("\n");
  };

  const getDayDisplayLines = (day: number) => {
    const dayLessons = aggregatedLessons[String(day)];
    if (!dayLessons || dayLessons.length === 0) return [];

    const byClass: { [classId: string]: { name: string; students: string[] } } = {};
    dayLessons.forEach((item) => {
      const cls = classes.find((c) => c.id === item.classId);
      const className = cls ? cls.name : "미지정";
      if (!byClass[item.classId]) {
        byClass[item.classId] = { name: className, students: [] };
      }
      if (item.studentName) {
        byClass[item.classId].students.push(item.studentName);
      }
    });

    return Object.values(byClass).map((item) => {
      return item.students.length > 0
        ? { 
            name: item.name, 
            text: `${item.name}: ${item.students.join(", ")}`,
            shortText: item.students.join(", ")
          }
        : { 
            name: item.name, 
            text: item.name,
            shortText: item.name
          };
    });
  };

  const dows = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="w-full">
      {/* Calendar Controls */}
      <div className="flex items-center justify-between mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
        <button
          id={`${mode}-cal-prev`}
          type="button"
          onClick={handlePrevMonth}
          className="p-1.5 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-white text-gray-600 hover:text-indigo-600 transition-all cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <select
            id={`${mode}-cal-year`}
            value={year}
            onChange={(e) => onDateChange(parseInt(e.target.value, 10), month)}
            className="text-sm font-semibold border border-gray-200 rounded-lg py-1 px-2.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            id={`${mode}-cal-month`}
            value={month}
            onChange={(e) => onDateChange(year, parseInt(e.target.value, 10))}
            className="text-sm font-semibold border border-gray-200 rounded-lg py-1 px-2.5 bg-white text-gray-700 cursor-pointer focus:outline-none focus:border-indigo-500"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {m + 1}월
              </option>
            ))}
          </select>
        </div>

        <button
          id={`${mode}-cal-next`}
          type="button"
          onClick={handleNextMonth}
          className="p-1.5 rounded-lg border border-gray-200 hover:border-indigo-500 hover:bg-white text-gray-600 hover:text-indigo-600 transition-all cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div
        className="grid gap-1.5 text-center"
        style={{ gridTemplateColumns: "36px repeat(7, minmax(0, 1fr))" }}
      >
        {/* Empty placeholder replacing Week column header */}
        <div className="w-full" />

        {/* Days of Week Header with borders */}
        {dows.map((dow, index) => (
          <button
            key={dow}
            id={`${mode}-dow-btn-${index}`}
            type="button"
            onClick={() => onToggleWeekday(index)}
            className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
              index === 0
                ? "text-rose-500 border-rose-200 bg-rose-50/10 hover:bg-rose-50/40 hover:border-rose-400"
                : index === 6
                ? "text-indigo-500 border-indigo-200 bg-indigo-50/10 hover:bg-indigo-50/40 hover:border-indigo-400"
                : "text-gray-500 border-slate-200 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-400"
            }`}
          >
            {dow}
          </button>
        ))}

        {/* Calendar Weeks & Days */}
        {weeks.map((week, weekIdx) => {
          const validDays = week.filter((d): d is number => d !== null);
          return (
            <React.Fragment key={`week-row-${weekIdx}`}>
              {/* Week Button - styled like weekday button, taller & narrower */}
              <button
                id={`${mode}-week-btn-${weekIdx}`}
                type="button"
                onClick={() => onToggleDays(validDays)}
                className="h-full py-3 text-[11px] font-bold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-400 rounded-lg transition-all cursor-pointer flex items-center justify-center bg-slate-50/20"
              >
                {weekIdx + 1}주
              </button>

              {/* Day cells */}
              {week.map((day, dayIdx) => {
                if (day === null) {
                  return (
                    <div
                      key={`empty-${weekIdx}-${dayIdx}`}
                      className="aspect-square flex items-center justify-center text-slate-200 text-xs select-none"
                    >
                      -
                    </div>
                  );
                }

                const isSelected = selectedDays.includes(day);
                const isTodayDate = isToday(day);
                const dayStyle = getDayStyle(day);
                const tooltip = getDayTooltipText(day);
                const displayLines = getDayDisplayLines(day);

                const formattedDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const isStudentMode = mode === "student";
                const isUnavailable = isStudentMode && !!student?.unavailables?.[monthKey]?.includes(day);
                const hasLessonCount = isStudentMode && !!student?.baseDate;
                const lessonCountText = hasLessonCount ? lessonCounts[formattedDateStr] : undefined;
                const shouldShowLines = isStudentMode ? (hasLessonCount && !!lessonCountText) : displayLines.length > 0;

                return (
                  <button
                    key={`day-${day}`}
                    id={`${mode}-day-btn-${day}`}
                    type="button"
                    onClick={() => onToggleDay(day)}
                    style={isSelected ? undefined : dayStyle}
                    title={tooltip}
                    className={`relative aspect-auto min-h-[52px] xs:min-h-[58px] sm:aspect-square w-full flex flex-col items-center justify-between rounded-lg p-1 select-none transition-all cursor-pointer ${
                      isSelected
                        ? "bg-indigo-600 text-white font-bold ring-2 ring-indigo-300 shadow-md"
                        : isUnavailable
                        ? "bg-rose-50/60 border-rose-200 text-rose-700 hover:bg-rose-100/60"
                        : "bg-white border border-gray-100 text-gray-800 hover:bg-gray-50"
                    } ${isTodayDate && !isSelected ? "font-extrabold text-red-600" : ""}`}
                  >
                    <span className="text-xs font-bold leading-none">{day}</span>

                    {/* Lesson lines / Lesson count / Unavailability */}
                    {!isSelected && (shouldShowLines || isUnavailable) && (
                      <div className="w-full flex flex-col gap-0.5 mt-1 overflow-hidden">
                        {hasLessonCount && !!lessonCountText && (
                          <span className="text-[8px] xs:text-[9px] leading-none text-indigo-600 font-bold truncate w-full text-center py-0.5 px-0.5 block bg-indigo-50 rounded-sm border border-indigo-100 tracking-tighter xs:tracking-normal">
                            {lessonCountText}
                          </span>
                        )}
                        {!hasLessonCount && shouldShowLines && (
                          <>
                            {displayLines.slice(0, 2).map((line, idx) => (
                              <div key={idx} className="w-full">
                                {/* Desktop/Tablet view: show Class Name + Student Name */}
                                <span
                                  className="hidden sm:block text-[8px] leading-tight text-gray-500 truncate w-full text-center px-0.5 font-medium bg-slate-100/60 rounded-sm"
                                >
                                  {line.text}
                                </span>
                                {/* Mobile view: show only Student Name for perfect fit */}
                                <span
                                  className="block sm:hidden text-[8px] xs:text-[9px] leading-tight text-indigo-950 truncate w-full text-center px-0.5 font-bold bg-slate-100/80 rounded-sm tracking-tighter"
                                >
                                  {line.shortText || line.text}
                                </span>
                              </div>
                            ))}
                            {displayLines.length > 2 && (
                              <span className="text-[7px] text-gray-400 font-bold leading-none">
                                +{displayLines.length - 2}
                              </span>
                            )}
                          </>
                        )}
                        {isUnavailable && (
                          <span className="text-[8px] xs:text-[9px] leading-none text-rose-600 font-bold truncate w-full text-center py-0.5 px-0.5 block bg-rose-100/70 border border-rose-200 rounded-sm tracking-tighter xs:tracking-normal">
                            🚫 불가일
                          </span>
                        )}
                      </div>
                    )}

                    {/* Selected overlay mark */}
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white/95 mt-1 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
