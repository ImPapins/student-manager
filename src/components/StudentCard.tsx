import React from "react";
import { Trash2, Calendar, CheckSquare, Square } from "lucide-react";
import { Student, ClassGroup } from "../types";

interface StudentCardProps {
  student: Student;
  classes: ClassGroup[];
  isSelected: boolean;
  onToggleSelect: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClassChange: (id: string, classId: string | null) => void;
  onClickCard: (id: string) => void;
}

export const StudentCard: React.FC<StudentCardProps> = ({
  student,
  classes,
  isSelected,
  onToggleSelect,
  onDelete,
  onClassChange,
  onClickCard,
}) => {
  const studentClass = classes.find((c) => c.id === student.classId);

  return (
    <div
      id={`student-card-${student.id}`}
      onClick={() => onClickCard(student.id)}
      style={studentClass ? { borderTop: `4px solid ${studentClass.color}` } : undefined}
      className={`relative group bg-white border border-gray-200 rounded-xl p-3 sm:p-4 flex flex-col justify-between aspect-auto min-h-[175px] sm:min-h-[190px] text-center cursor-pointer transition-all duration-200 hover:border-indigo-500 hover:shadow-md ${
        isSelected
          ? "border-indigo-500 bg-indigo-50/50 shadow-sm"
          : ""
      }`}
    >
      {/* Checkbox */}
      <button
        id={`toggle-select-${student.id}`}
        type="button"
        onClick={(e) => onToggleSelect(student.id, e)}
        className="absolute top-2.5 left-2.5 text-gray-400 hover:text-indigo-600 transition-colors z-10 p-0.5"
      >
        {isSelected ? (
          <CheckSquare className="w-8 h-8 text-indigo-600 fill-indigo-100" />
        ) : (
          <Square className="w-8 h-8 text-gray-400 hover:text-gray-500" />
        )}
      </button>

      {/* Delete Button */}
      <button
        id={`delete-student-${student.id}`}
        type="button"
        onClick={(e) => onDelete(student.id, e)}
        className="absolute top-2.5 right-2.5 text-gray-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all z-10 p-1"
        title="학생 삭제"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Profile info */}
      <div className="flex-1 flex flex-col items-center justify-center mt-7">
        <span className="font-bold text-slate-800 text-lg sm:text-2xl tracking-tight leading-none mb-1">{student.name}</span>
      </div>

      {/* Class Dropdown */}
      <div className="mt-3 relative z-10" onClick={(e) => e.stopPropagation()}>
        <select
          id={`class-select-${student.id}`}
          value={student.classId || ""}
          onChange={(e) => onClassChange(student.id, e.target.value || null)}
          className="w-full text-xs border border-gray-200 rounded-md py-1.5 px-2 bg-white text-gray-600 font-medium cursor-pointer focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
        >
          <option value="">반 미지정</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Hint */}
      <div className="mt-2 text-[10px] text-gray-400 font-medium flex items-center justify-center gap-1">
        <Calendar className="w-3 h-3 text-indigo-400" />
        <span>눌러서 달력 보기</span>
      </div>
    </div>
  );
};
