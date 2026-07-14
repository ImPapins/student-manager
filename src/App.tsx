import React, { useState, useEffect, useMemo } from "react";
import {
  Users,
  UserPlus,
  Plus,
  Trash2,
  FolderPlus,
  Search,
  SlidersHorizontal,
  CalendarDays,
  CheckSquare,
  Square,
  Check,
  ChevronDown,
  ChevronUp,
  X,
  FileCheck,
  AlertCircle,
  Download,
  Minus,
  LogOut,
  Lock,
  User,
  Eye,
  EyeOff,
  GraduationCap
} from "lucide-react";
import { ClassGroup, Student, MainSelections } from "./types";
import { StudentCard } from "./components/StudentCard";
import { Calendar } from "./components/Calendar";
import { downloadStudentCalendarPNG } from "./utils/calendarImageGenerator";
import { 
  registerCloudUser, 
  loginCloudUser, 
  saveCloudData, 
  loadCloudData 
} from "./firebase";

const STORAGE_KEY = "studentManagerData";
const SELECTABLE_COLORS = [
  { name: "빨강", color: "#ef4444" },
  { name: "주황", color: "#f97316" },
  { name: "노랑", color: "#f59e0b" },
  { name: "연두", color: "#84cc16" },
  { name: "초록", color: "#10b981" },
  { name: "하늘", color: "#06b6d4" },
  { name: "파랑", color: "#3b82f6" },
  { name: "보라", color: "#8b5cf6" },
  { name: "분홍", color: "#ec4899" },
  { name: "갈색", color: "#783c1d" }
];

const CLASS_COLOR_PALETTE = SELECTABLE_COLORS.map(c => c.color);

const DEFAULT_CLASSES: ClassGroup[] = [
  { id: "class-morning", name: "오전반", color: "#3b82f6" },
  { id: "class-afternoon", name: "오후반", color: "#10b981" },
  { id: "class-elementary", name: "초등반", color: "#f59e0b" }
];

export default function App() {
  // --- States ---
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassGroup[]>(DEFAULT_CLASSES);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [collapsedClassGroupIds, setCollapsedClassGroupIds] = useState<Set<string>>(new Set());
  const [isStudentListCollapsed, setIsStudentListCollapsed] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<"name" | "class">("name");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Input states
  const [newStudentName, setNewStudentName] = useState<string>("");
  const [newStudentClassId, setNewStudentClassId] = useState<string>("");
  const [newClassName, setNewClassName] = useState<string>("");
  const [classSelectionFilter, setClassSelectionFilter] = useState<string>("");

  // Save states
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string>("");

  // Main Calendar state
  const [mainYear, setMainYear] = useState<number>(new Date().getFullYear());
  const [mainMonth, setMainMonth] = useState<number>(new Date().getMonth());
  const [mainSelections, setMainSelections] = useState<MainSelections>({});

  // Modal / Student Calendar state
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [modalYear, setModalYear] = useState<number>(new Date().getFullYear());
  const [modalMonth, setModalMonth] = useState<number>(new Date().getMonth());
  const [modalLessonClassId, setModalLessonClassId] = useState<string | null>(null);

  // Class Editing Modal state
  const [editingClass, setEditingClass] = useState<ClassGroup | null>(null);
  const [editingClassName, setEditingClassName] = useState<string>("");
  const [editingClassColor, setEditingClassColor] = useState<string>("");

  // Bulk PNG Download state
  const [isBulkDownloadModalOpen, setIsBulkDownloadModalOpen] = useState<boolean>(false);
  const [bulkDownloadYear, setBulkDownloadYear] = useState<number>(new Date().getFullYear());
  const [bulkDownloadMonth, setBulkDownloadMonth] = useState<number>(new Date().getMonth());
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  // --- Login System States ---
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem("studentManager_currentUser");
  });
  const [loginId, setLoginId] = useState<string>("");
  const [loginPw, setLoginPw] = useState<string>("");
  const [registerId, setRegisterId] = useState<string>("");
  const [registerPw, setRegisterPw] = useState<string>("");
  const [registerPwConfirm, setRegisterPwConfirm] = useState<string>("");
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>("");
  const [registerError, setRegisterError] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Unsaved changes tracking
  const [lastSavedState, setLastSavedState] = useState<string>("");

  const currentDynamicStateStr = useMemo(() => {
    return JSON.stringify({
      students,
      mainSelections,
      classes
    });
  }, [students, mainSelections, classes]);

  const hasUnsavedChanges = useMemo(() => {
    if (!currentUser) return false;
    if (!lastSavedState) return false;
    return currentDynamicStateStr !== lastSavedState;
  }, [currentUser, lastSavedState, currentDynamicStateStr]);

  // Alert on closing without saving
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        const msg = "변경사항이 저장되지 않았습니다. 정말 종료하시겠습니까?";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  // Set default class ID for adding lesson when opening a student's calendar modal
  useEffect(() => {
    if (activeStudentId) {
      const activeStudent = students.find((s) => s.id === activeStudentId);
      if (activeStudent) {
        setModalLessonClassId(activeStudent.classId);
      }
    } else {
      setModalLessonClassId(null);
    }
  }, [activeStudentId]);

  const [isLoadingCloud, setIsLoadingCloud] = useState<boolean>(false);
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);

  // --- Initial Loading per User ---
  useEffect(() => {
    if (!currentUser) {
      setStudents([]);
      setClasses(DEFAULT_CLASSES);
      setMainSelections({});
      setLastSavedState("");
      return;
    }

    // 1. Load locally first for instant display
    let localData: any = null;
    try {
      const userStorageKey = `studentManagerData_${currentUser}`;
      const raw = localStorage.getItem(userStorageKey);
      if (raw) {
        localData = JSON.parse(raw);
        setStudents(localData.students || []);
        setClasses(localData.classes || DEFAULT_CLASSES);
        setMainSelections(localData.mainSelections || {});
        setLastSavedState(JSON.stringify({
          students: localData.students || [],
          mainSelections: localData.mainSelections || {},
          classes: localData.classes || DEFAULT_CLASSES
        }));
      } else {
        // Try migrating legacy data
        const legacyRaw = localStorage.getItem(STORAGE_KEY);
        if (legacyRaw) {
          localData = JSON.parse(legacyRaw);
          setStudents(localData.students || []);
          setClasses(localData.classes || DEFAULT_CLASSES);
          setMainSelections(localData.mainSelections || {});
          setLastSavedState(JSON.stringify({
            students: localData.students || [],
            mainSelections: localData.mainSelections || {},
            classes: localData.classes || DEFAULT_CLASSES
          }));
        } else {
          setClasses(DEFAULT_CLASSES);
        }
      }
    } catch (e) {
      console.error("로컬 데이터 불러오기 실패", e);
    }

    // 2. Fetch from Cloud Firestore
    const fetchCloudData = async () => {
      setIsLoadingCloud(true);
      try {
        const cloudData = await loadCloudData(currentUser);
        if (cloudData) {
          setStudents(cloudData.students || []);
          setClasses(cloudData.classes || DEFAULT_CLASSES);
          setMainSelections(cloudData.mainSelections || {});
          
          const fullData = {
            students: cloudData.students || [],
            mainSelections: cloudData.mainSelections || {},
            classes: cloudData.classes || DEFAULT_CLASSES
          };
          setLastSavedState(JSON.stringify(fullData));
          
          // Sync back to local storage for offline use
          const userStorageKey = `studentManagerData_${currentUser}`;
          localStorage.setItem(userStorageKey, JSON.stringify(fullData));
        } else {
          // If no cloud data exists yet but we have local data, automatically upload it
          if (localData) {
            await saveCloudData(currentUser, {
              students: localData.students || [],
              classes: localData.classes || DEFAULT_CLASSES,
              mainSelections: localData.mainSelections || {}
            });
          }
        }
      } catch (err) {
        console.error("클라우드 데이터 동기화 실패", err);
      } finally {
        setIsLoadingCloud(false);
      }
    };

    fetchCloudData();
  }, [currentUser]);

  // --- Login & Register Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const username = loginId.trim();
    const password = loginPw.trim();

    if (!username) {
      setLoginError("아이디를 입력해 주세요.");
      return;
    }
    if (!password) {
      setLoginError("비밀번호를 입력해 주세요.");
      return;
    }

    setLoginError("로그인 중...");

    try {
      // 1. Try Cloud Firestore login first
      const loggedInUsername = await loginCloudUser(username, password);
      
      // Save credentials locally as backup
      const usersRaw = localStorage.getItem("studentManager_users") || "[]";
      const users = JSON.parse(usersRaw);
      if (!users.some((u: any) => u.username.toLowerCase() === loggedInUsername.toLowerCase())) {
        users.push({ username: loggedInUsername, password });
        localStorage.setItem("studentManager_users", JSON.stringify(users));
      }

      localStorage.setItem("studentManager_currentUser", loggedInUsername);
      setCurrentUser(loggedInUsername);
      
      // Clear inputs
      setLoginId("");
      setLoginPw("");
      setLoginError("");
    } catch (e: any) {
      // 2. Check local backup for offline access
      try {
        const usersRaw = localStorage.getItem("studentManager_users") || "[]";
        const users = JSON.parse(usersRaw);
        const user = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
        if (user && user.password === password) {
          localStorage.setItem("studentManager_currentUser", user.username);
          setCurrentUser(user.username);
          setLoginId("");
          setLoginPw("");
          setLoginError("");
          alert("네트워크 오프라인 상태입니다. 기기에 저장된 이전 로그인 정보를 기반으로 접속했습니다.");
          return;
        }
      } catch (localErr) {
        console.error("로컬 백업 확인 실패", localErr);
      }

      setLoginError(e.message || "로그인 중 오류가 발생했습니다.");
      console.error(e);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");
    const username = registerId.trim();
    const password = registerPw.trim();
    const confirm = registerPwConfirm.trim();

    if (!username) {
      setRegisterError("아이디를 입력해 주세요.");
      return;
    }
    if (username.length < 3) {
      setRegisterError("아이디는 최소 3글자 이상이어야 합니다.");
      return;
    }
    if (!password) {
      setRegisterError("비밀번호를 입력해 주세요.");
      return;
    }
    if (password.length < 4) {
      setRegisterError("비밀번호는 최소 4글자 이상이어야 합니다.");
      return;
    }
    if (password !== confirm) {
      setRegisterError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setRegisterError("가입 처리 중...");

    try {
      // 1. Try registering in Cloud Firestore
      await registerCloudUser(username, password);

      // Save credentials locally as backup
      const usersRaw = localStorage.getItem("studentManager_users") || "[]";
      const users = JSON.parse(usersRaw);
      users.push({ username, password });
      localStorage.setItem("studentManager_users", JSON.stringify(users));

      // Auto login!
      localStorage.setItem("studentManager_currentUser", username);
      setCurrentUser(username);
      
      // Clear inputs
      setRegisterId("");
      setRegisterPw("");
      setRegisterPwConfirm("");
      setRegisterError("");
    } catch (e: any) {
      setRegisterError(e.message || "회원가입 중 오류가 발생했습니다.");
      console.error(e);
    }
  };

  const handleLogout = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("저장하지 않은 변경사항이 있습니다. 정말 로그아웃 하시겠습니까?\n저장되지 않은 정보는 유실됩니다.")) {
        return;
      }
    }
    localStorage.removeItem("studentManager_currentUser");
    setCurrentUser(null);
  };

  // --- Save Handler ---
  const handleSave = async () => {
    if (!currentUser) return;
    
    setSaveStatus("saving");
    setIsSavingCloud(true);

    const dataToSave = {
      students,
      mainSelections,
      classes
    };

    // 1. Save locally first
    try {
      const userStorageKey = `studentManagerData_${currentUser}`;
      localStorage.setItem(userStorageKey, JSON.stringify(dataToSave));
    } catch (localErr) {
      console.error("로컬 저장 실패", localErr);
    }

    // 2. Save to Cloud Firestore
    try {
      await saveCloudData(currentUser, dataToSave);
      setLastSavedState(JSON.stringify(dataToSave));
      setSaveStatus("saved");
      setLastSavedTime(new Date().toLocaleString("ko-KR"));
      setTimeout(() => {
        setSaveStatus("idle");
      }, 1200);
    } catch (cloudErr) {
      console.error("클라우드 저장 실패", cloudErr);
      setLastSavedState(JSON.stringify(dataToSave));
      setSaveStatus("local-only");
      setLastSavedTime(new Date().toLocaleString("ko-KR") + " (로컬 전용)");
      alert("클라우드 저장에 실패했습니다. 네트워크를 확인해 주세요. (로컬 기기에는 안전하게 임시 저장되었습니다.)");
      setTimeout(() => {
        setSaveStatus("idle");
      }, 3000);
    } finally {
      setIsSavingCloud(false);
    }
  };

  // --- Class management ---
  const handleAddClass = () => {
    const name = newClassName.trim();
    if (!name) return;

    // Pick next color from SELECTABLE_COLORS
    const color = SELECTABLE_COLORS[classes.length % SELECTABLE_COLORS.length].color;
    const newClass: ClassGroup = {
      id: `class-${Date.now()}`,
      name,
      color
    };

    setClasses([...classes, newClass]);
    setNewClassName("");
  };

  const handleStartEditClass = (c: ClassGroup) => {
    setEditingClass(c);
    setEditingClassName(c.name);
    setEditingClassColor(c.color);
  };

  const handleSaveEditClass = () => {
    if (!editingClass) return;
    const name = editingClassName.trim();
    if (!name) {
      alert("반 이름을 입력해 주세요.");
      return;
    }

    const updatedClasses = classes.map((c) => {
      if (c.id === editingClass.id) {
        return {
          ...c,
          name,
          color: editingClassColor
        };
      }
      return c;
    });

    setClasses(updatedClasses);
    setEditingClass(null);
  };

  const handleDeleteClass = (id: string) => {
    const cls = classes.find((c) => c.id === id);
    if (!cls) return;

    if (
      window.confirm(
        `"${cls.name}" 반을 삭제하시겠습니까?\n배정된 수업과 학생의 소속 반도 함께 미지정으로 변경됩니다.`
      )
    ) {
      // Remove class
      setClasses(classes.filter((c) => c.id !== id));

      // Cleanup student classes and lessons
      setStudents(
        students.map((s) => {
          const updatedLessons = { ...s.lessons };
          let lessonsChanged = false;

          Object.keys(updatedLessons).forEach((monthKey) => {
            const dayMap = { ...updatedLessons[monthKey] };
            let dayChanged = false;

            Object.keys(dayMap).forEach((day) => {
              if (dayMap[day] === id) {
                delete dayMap[day];
                dayChanged = true;
              }
            });

            if (dayChanged) {
              lessonsChanged = true;
              if (Object.keys(dayMap).length === 0) {
                delete updatedLessons[monthKey];
              } else {
                updatedLessons[monthKey] = dayMap;
              }
            }
          });

          return {
            ...s,
            classId: s.classId === id ? null : s.classId,
            lessons: lessonsChanged ? updatedLessons : s.lessons
          };
        })
      );
    }
  };

  // --- Student Management ---
  const handleAddStudent = () => {
    const name = newStudentName.trim();
    if (!name) return;

    const classId = newStudentClassId || null;
    const newStudent: Student = {
      id: Date.now().toString(),
      name,
      classId,
      selections: {},
      lessons: {}
    };

    setStudents([...students, newStudent]);
    setNewStudentName("");
    setNewStudentClassId("");
  };

  const handleDeleteStudent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const s = students.find((student) => student.id === id);
    if (!s) return;

    if (window.confirm(`"${s.name}" 학생을 정말 삭제하시겠습니까?`)) {
      setStudents(students.filter((student) => student.id !== id));
      // Remove from selected list
      const nextSelected = new Set(selectedStudentIds);
      nextSelected.delete(id);
      setSelectedStudentIds(nextSelected);
    }
  };

  const handleStudentClassChange = (id: string, classId: string | null) => {
    setStudents(
      students.map((s) => {
        if (s.id !== id) return s;

        const updatedLessons = { ...s.lessons };
        if (classId) {
          // Update all existing lessons to the new class ID so the calendar shows the correct new class color
          Object.keys(updatedLessons).forEach((mKey) => {
            const dayMap = { ...updatedLessons[mKey] };
            Object.keys(dayMap).forEach((day) => {
              dayMap[day] = classId;
            });
            updatedLessons[mKey] = dayMap;
          });
        } else {
          // Clear lessons if the student is unassigned from any class
          Object.keys(updatedLessons).forEach((mKey) => {
            delete updatedLessons[mKey];
          });
        }

        return {
          ...s,
          classId,
          lessons: updatedLessons,
        };
      })
    );
  };

  const handleUpdateStudentBaseDate = (id: string, baseDate: string) => {
    setStudents(
      students.map((s) => (s.id === id ? { ...s, baseDate: baseDate || undefined } : s))
    );
  };

  const handleBulkDownloadStart = async () => {
    setIsDownloading(true);
    let count = 0;
    const list = Array.from(selectedStudentIds)
      .map((id) => students.find((s) => s.id === id))
      .filter((s): s is Student => !!s);

    for (const student of list) {
      downloadStudentCalendarPNG(student, bulkDownloadYear, bulkDownloadMonth, classes);
      count++;
      // Stagger downloads slightly (e.g., 200ms) to ensure browsers process them cleanly
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    setIsDownloading(false);
    setIsBulkDownloadModalOpen(false);
  };

  const handleToggleSelectStudent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSelected = new Set(selectedStudentIds);
    if (nextSelected.has(id)) {
      nextSelected.delete(id);
    } else {
      nextSelected.add(id);
    }
    setSelectedStudentIds(nextSelected);
  };

  const handleBulkSelectAll = () => {
    const visible = getVisibleStudents();
    const nextSelected = new Set(selectedStudentIds);
    visible.forEach((s) => nextSelected.add(s.id));
    setSelectedStudentIds(nextSelected);
  };

  const handleBulkClearAll = () => {
    setSelectedStudentIds(new Set());
  };

  const handleBulkSelectClass = () => {
    if (!classSelectionFilter) return;
    const visible = getVisibleStudents();
    const nextSelected = new Set(selectedStudentIds);
    visible.forEach((s) => {
      if (
        (classSelectionFilter === "__none__" && s.classId === null) ||
        s.classId === classSelectionFilter
      ) {
        nextSelected.add(s.id);
      }
    });
    setSelectedStudentIds(nextSelected);
  };

  const handleBulkDelete = () => {
    const count = selectedStudentIds.size;
    if (count === 0) return;

    if (window.confirm(`선택한 학생 ${count}명을 모두 삭제하시겠습니까?`)) {
      setStudents(students.filter((s) => !selectedStudentIds.has(s.id)));
      setSelectedStudentIds(new Set());
    }
  };

  // --- Filtering & Sorting Students ---
  const getVisibleStudents = (): Student[] => {
    const query = searchQuery.trim().toLowerCase();
    return query
      ? students.filter((s) => s.name.toLowerCase().includes(query))
      : students;
  };

  const sortedStudents = useMemo(() => {
    const list = getVisibleStudents();
    if (sortMode === "class") {
      const classOrderIndex = (classId: string | null) => {
        if (!classId) return classes.length;
        const idx = classes.findIndex((c) => c.id === classId);
        return idx === -1 ? classes.length : idx;
      };

      return [...list].sort((a, b) => {
        const diff = classOrderIndex(a.classId) - classOrderIndex(b.classId);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, "ko");
      });
    } else {
      return [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
    }
  }, [students, classes, sortMode, searchQuery]);

  const studentGroupsByClass = useMemo(() => {
    if (sortMode !== "class") return [];

    const visible = getVisibleStudents();
    const groups: {
      id: string | null;
      name: string;
      color: string | null;
      studentsList: Student[];
    }[] = classes.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      studentsList: []
    }));

    const unassignedGroup = {
      id: null,
      name: "반 미지정",
      color: null,
      studentsList: [] as Student[]
    };

    visible.forEach((s) => {
      const targetGroup = s.classId
        ? groups.find((g) => g.id === s.classId)
        : null;
      if (targetGroup) {
        targetGroup.studentsList.push(s);
      } else {
        unassignedGroup.studentsList.push(s);
      }
    });

    groups.push(unassignedGroup);
    return groups.filter((g) => g.studentsList.length > 0);
  }, [students, classes, sortMode, searchQuery]);

  // --- Calendar Date Change Handlers ---
  const handleMainDateChange = (year: number, month: number) => {
    setMainYear(year);
    setMainMonth(month);
  };

  const handleModalDateChange = (year: number, month: number) => {
    setModalYear(year);
    setModalMonth(month);
  };

  // --- Get Days by Weekday ---
  const getDaysByWeekday = (year: number, month: number, dow: number): number[] => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(year, month, d).getDay() === dow) {
        result.push(d);
      }
    }
    return result;
  };

  // --- Main Calendar Selections ---
  const handleToggleMainDay = (day: number) => {
    const key = `${mainYear}-${mainMonth}`;
    const current = mainSelections[key] || [];
    let next: number[];

    if (current.includes(day)) {
      next = current.filter((d) => d !== day);
    } else {
      next = [...current, day];
    }

    const updated = { ...mainSelections };
    if (next.length === 0) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    setMainSelections(updated);
  };

  const handleToggleMainWeekday = (dow: number) => {
    const key = `${mainYear}-${mainMonth}`;
    const targetDays = getDaysByWeekday(mainYear, mainMonth, dow);
    const current = mainSelections[key] || [];
    const allSelected = targetDays.every((d) => current.includes(d));

    let next: number[];
    if (allSelected) {
      next = current.filter((d) => !targetDays.includes(d));
    } else {
      next = [...current];
      targetDays.forEach((d) => {
        if (!next.includes(d)) next.push(d);
      });
    }

    const updated = { ...mainSelections };
    if (next.length === 0) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    setMainSelections(updated);
  };

  const handleToggleMainDays = (targetDays: number[]) => {
    const key = `${mainYear}-${mainMonth}`;
    const current = mainSelections[key] || [];
    const allSelected = targetDays.every((d) => current.includes(d));

    let next: number[];
    if (allSelected) {
      next = current.filter((d) => !targetDays.includes(d));
    } else {
      next = [...current];
      targetDays.forEach((d) => {
        if (!next.includes(d)) next.push(d);
      });
    }

    const updated = { ...mainSelections };
    if (next.length === 0) {
      delete updated[key];
    } else {
      updated[key] = next;
    }
    setMainSelections(updated);
  };

  const handleClearMainSelection = () => {
    const key = `${mainYear}-${mainMonth}`;
    const updated = { ...mainSelections };
    delete updated[key];
    setMainSelections(updated);
  };

  // --- Student Calendar Selections ---
  const handleToggleStudentDay = (day: number) => {
    if (!activeStudentId) return;
    const key = `${modalYear}-${modalMonth}`;

    setStudents(
      students.map((s) => {
        if (s.id !== activeStudentId) return s;
        const currentSelections = s.selections || {};
        const currentDays = currentSelections[key] || [];
        let nextDays: number[];

        if (currentDays.includes(day)) {
          nextDays = currentDays.filter((d) => d !== day);
        } else {
          nextDays = [...currentDays, day];
        }

        const nextSelections = { ...currentSelections };
        if (nextDays.length === 0) {
          delete nextSelections[key];
        } else {
          nextSelections[key] = nextDays;
        }

        return { ...s, selections: nextSelections };
      })
    );
  };

  const handleToggleStudentWeekday = (dow: number) => {
    if (!activeStudentId) return;
    const key = `${modalYear}-${modalMonth}`;
    const targetDays = getDaysByWeekday(modalYear, modalMonth, dow);

    setStudents(
      students.map((s) => {
        if (s.id !== activeStudentId) return s;
        const currentSelections = s.selections || {};
        const currentDays = currentSelections[key] || [];
        const allSelected = targetDays.every((d) => currentDays.includes(d));

        let nextDays: number[];
        if (allSelected) {
          nextDays = currentDays.filter((d) => !targetDays.includes(d));
        } else {
          nextDays = [...currentDays];
          targetDays.forEach((d) => {
            if (!nextDays.includes(d)) nextDays.push(d);
          });
        }

        const nextSelections = { ...currentSelections };
        if (nextDays.length === 0) {
          delete nextSelections[key];
        } else {
          nextSelections[key] = nextDays;
        }

        return { ...s, selections: nextSelections };
      })
    );
  };

  const handleToggleStudentDays = (targetDays: number[]) => {
    if (!activeStudentId) return;
    const key = `${modalYear}-${modalMonth}`;

    setStudents(
      students.map((s) => {
        if (s.id !== activeStudentId) return s;
        const currentSelections = s.selections || {};
        const currentDays = currentSelections[key] || [];
        const allSelected = targetDays.every((d) => currentDays.includes(d));

        let nextDays: number[];
        if (allSelected) {
          nextDays = currentDays.filter((d) => !targetDays.includes(d));
        } else {
          nextDays = [...currentDays];
          targetDays.forEach((d) => {
            if (!nextDays.includes(d)) nextDays.push(d);
          });
        }

        const nextSelections = { ...currentSelections };
        if (nextDays.length === 0) {
          delete nextSelections[key];
        } else {
          nextSelections[key] = nextDays;
        }

        return { ...s, selections: nextSelections };
      })
    );
  };

  const handleClearStudentSelection = () => {
    if (!activeStudentId) return;
    const key = `${modalYear}-${modalMonth}`;

    setStudents(
      students.map((s) => {
        if (s.id !== activeStudentId) return s;
        const nextSelections = { ...s.selections };
        delete nextSelections[key];
        return { ...s, selections: nextSelections };
      })
    );
  };

  // --- Add/Remove Lessons logic ---
  const handleAddLessonsMain = () => {
    if (selectedStudentIds.size === 0) {
      alert("먼저 학생 목록에서 체크박스로 학생을 선택해 주세요.");
      return;
    }
    const key = `${mainYear}-${mainMonth}`;
    const days = mainSelections[key] || [];
    if (days.length === 0) {
      alert("먼저 메인 달력에서 날짜를 선택해 주세요.");
      return;
    }

    let appliedCount = 0;
    const nextStudents = students.map((s) => {
      if (!selectedStudentIds.has(s.id)) return s;
      if (!s.classId) return s; // Must have a class assigned

      appliedCount++;
      const nextLessons = { ...s.lessons };
      const nextDayMap = { ...(nextLessons[key] || {}) };
      days.forEach((day) => {
        if (s.classId) nextDayMap[String(day)] = s.classId;
      });

      nextLessons[key] = nextDayMap;
      return { ...s, lessons: nextLessons };
    });

    if (appliedCount === 0) {
      alert("선택한 학생 중 반이 지정된 학생이 없습니다.");
      return;
    }

    setStudents(nextStudents);
    // Clear selections
    const updatedSelections = { ...mainSelections };
    delete updatedSelections[key];
    setMainSelections(updatedSelections);
  };

  const handleRemoveLessonsMain = () => {
    if (selectedStudentIds.size === 0) {
      alert("먼저 학생 목록에서 체크박스로 학생을 선택해 주세요.");
      return;
    }
    const key = `${mainYear}-${mainMonth}`;
    const days = mainSelections[key] || [];
    if (days.length === 0) {
      alert("먼저 메인 달력에서 날짜를 선택해 주세요.");
      return;
    }

    setStudents(
      students.map((s) => {
        if (!selectedStudentIds.has(s.id)) return s;
        const nextLessons = { ...s.lessons };
        const nextDayMap = { ...(nextLessons[key] || {}) };
        days.forEach((day) => {
          delete nextDayMap[String(day)];
        });

        if (Object.keys(nextDayMap).length === 0) {
          delete nextLessons[key];
        } else {
          nextLessons[key] = nextDayMap;
        }

        return { ...s, lessons: nextLessons };
      })
    );

    // Clear selections
    const updatedSelections = { ...mainSelections };
    delete updatedSelections[key];
    setMainSelections(updatedSelections);
  };

  const handleAddLessonsStudent = (classIdOverride?: string | null) => {
    if (!activeStudentId) return;
    const s = students.find((student) => student.id === activeStudentId);
    if (!s) return;

    const targetClassId = classIdOverride !== undefined ? classIdOverride : s.classId;

    if (!targetClassId) {
      alert("배정할 반이 지정되지 않았습니다.");
      return;
    }

    const key = `${modalYear}-${modalMonth}`;
    const selections = s.selections || {};
    const days = selections[key] || [];
    if (days.length === 0) {
      alert("먼저 달력에서 날짜를 선택해 주세요.");
      return;
    }

    setStudents(
      students.map((student) => {
        if (student.id !== activeStudentId) return student;

        const nextLessons = { ...student.lessons };
        const nextDayMap = { ...(nextLessons[key] || {}) };
        days.forEach((day) => {
          nextDayMap[String(day)] = targetClassId;
        });

        nextLessons[key] = nextDayMap;

        // Clear selection for this month
        const nextSelections = { ...student.selections };
        delete nextSelections[key];

        return { ...student, lessons: nextLessons, selections: nextSelections };
      })
    );
  };

  const handleRemoveLessonsStudent = () => {
    if (!activeStudentId) return;
    const s = students.find((student) => student.id === activeStudentId);
    if (!s) return;

    const key = `${modalYear}-${modalMonth}`;
    const selections = s.selections || {};
    const days = selections[key] || [];
    if (days.length === 0) {
      alert("먼저 달력에서 날짜를 선택해 주세요.");
      return;
    }

    setStudents(
      students.map((student) => {
        if (student.id !== activeStudentId) return student;

        const nextLessons = { ...student.lessons };
        const nextDayMap = { ...(nextLessons[key] || {}) };
        days.forEach((day) => {
          delete nextDayMap[String(day)];
        });

        if (Object.keys(nextDayMap).length === 0) {
          delete nextLessons[key];
        } else {
          nextLessons[key] = nextDayMap;
        }

        // Clear selection for this month
        const nextSelections = { ...student.selections };
        delete nextSelections[key];

        return { ...student, lessons: nextLessons, selections: nextSelections };
      })
    );
  };

  const handleAddUnavailablesStudent = () => {
    if (!activeStudentId) return;
    const s = students.find((student) => student.id === activeStudentId);
    if (!s) return;

    const key = `${modalYear}-${modalMonth}`;
    const selections = s.selections || {};
    const days = selections[key] || [];
    if (days.length === 0) {
      alert("먼저 달력에서 날짜를 선택해 주세요.");
      return;
    }

    setStudents(
      students.map((student) => {
        if (student.id !== activeStudentId) return student;

        const nextUnavailables = { ...student.unavailables };
        const currentDays = nextUnavailables[key] || [];
        const merged = Array.from(new Set([...currentDays, ...days])).sort((a, b) => a - b);
        nextUnavailables[key] = merged;

        // Clear selection for this month
        const nextSelections = { ...student.selections };
        delete nextSelections[key];

        return { ...student, unavailables: nextUnavailables, selections: nextSelections };
      })
    );
  };

  const handleRemoveUnavailablesStudent = () => {
    if (!activeStudentId) return;
    const s = students.find((student) => student.id === activeStudentId);
    if (!s) return;

    const key = `${modalYear}-${modalMonth}`;
    const selections = s.selections || {};
    const days = selections[key] || [];
    if (days.length === 0) {
      alert("먼저 달력에서 날짜를 선택해 주세요.");
      return;
    }

    setStudents(
      students.map((student) => {
        if (student.id !== activeStudentId) return student;

        const nextUnavailables = { ...student.unavailables };
        const currentDays = nextUnavailables[key] || [];
        const filtered = currentDays.filter((d) => !days.includes(d));

        if (filtered.length === 0) {
          delete nextUnavailables[key];
        } else {
          nextUnavailables[key] = filtered;
        }

        // Clear selection for this month
        const nextSelections = { ...student.selections };
        delete nextSelections[key];

        return { ...student, unavailables: nextUnavailables, selections: nextSelections };
      })
    );
  };

  // --- Today's Lesson Summary aggregation ---
  const todayLessonSummary = useMemo(() => {
    const today = new Date();
    const key = `${today.getFullYear()}-${today.getMonth()}`;
    const todayDate = today.getDate();

    const byClass: { [classId: string]: { name: string; color: string; students: { id: string; name: string }[] } } = {};

    students.forEach((s) => {
      if (!s.lessons || !s.lessons[key]) return;
      const dayLessonClassId = s.lessons[key][todayDate];
      if (!dayLessonClassId) return;

      const cls = classes.find((c) => c.id === dayLessonClassId);
      if (!cls) return;

      if (!byClass[cls.id]) {
        byClass[cls.id] = { name: cls.name, color: cls.color, students: [] };
      }
      byClass[cls.id].students.push({ id: s.id, name: s.name });
    });

    return Object.values(byClass);
  }, [students, classes]);

  const activeStudent = useMemo(() => {
    return students.find((s) => s.id === activeStudentId) || null;
  }, [students, activeStudentId]);

  const modalSelectionsCount = useMemo(() => {
    if (!activeStudent) return 0;
    const key = `${modalYear}-${modalMonth}`;
    const selections = activeStudent.selections || {};
    return (selections[key] || []).length;
  }, [activeStudent, modalYear, modalMonth]);

  const mainSelectionsCount = useMemo(() => {
    const key = `${mainYear}-${mainMonth}`;
    return (mainSelections[key] || []).length;
  }, [mainSelections, mainYear, mainMonth]);

  const toggleClassGroupCollapse = (key: string) => {
    const next = new Set(collapsedClassGroupIds);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setCollapsedClassGroupIds(next);
  };

  const handleScrollToMainCalendar = () => {
    const element = document.getElementById("main-calendar-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 md:p-8 antialiased">
        <div className="w-full max-w-sm bg-white border border-slate-200/80 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Header Banner */}
          <div className="bg-indigo-600 px-6 py-8 text-center text-white relative">
            <div className="absolute top-3 right-3 opacity-15">
              <GraduationCap className="w-24 h-24 animate-pulse" />
            </div>
            <div className="mx-auto w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center shadow-inner mb-4">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight mb-1">지금, 수학 교습소</h1>
            <p className="text-[11px] text-indigo-100 font-medium">학생 일정 배정 및 수업 관리 시스템</p>
          </div>

          {/* Form Area */}
          <div className="p-6">
            {!isRegisterMode ? (
              // LOGIN FORM
              <form onSubmit={handleLogin} className="space-y-4">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">로그인</h2>
                
                {loginError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">아이디</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="아이디를 입력해 주세요"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={loginPw}
                      onChange={(e) => setLoginPw(e.target.value)}
                      placeholder="비밀번호를 입력해 주세요"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center"
                >
                  로그인하기
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(true);
                      setLoginError("");
                      setLoginId("");
                      setLoginPw("");
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-500 hover:underline"
                  >
                    처음이신가요? 회원가입하기
                  </button>
                </div>
              </form>
            ) : (
              // REGISTER FORM
              <form onSubmit={handleRegister} className="space-y-4">
                <h2 className="text-base font-bold text-slate-800 tracking-tight">회원가입</h2>
                
                {registerError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold animate-in fade-in duration-150">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{registerError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">아이디</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={registerId}
                      onChange={(e) => setRegisterId(e.target.value)}
                      placeholder="생성할 아이디 (최소 3자)"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">비밀번호</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={registerPw}
                      onChange={(e) => setRegisterPw(e.target.value)}
                      placeholder="비밀번호 (최소 4자)"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">비밀번호 확인</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={registerPwConfirm}
                      onChange={(e) => setRegisterPwConfirm(e.target.value)}
                      placeholder="비밀번호 재입력"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-sm outline-none transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm hover:shadow transition-all cursor-pointer flex items-center justify-center"
                >
                  회원가입 완료 및 로그인
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegisterMode(false);
                      setRegisterError("");
                      setRegisterId("");
                      setRegisterPw("");
                      setRegisterPwConfirm("");
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
                  >
                    이미 계정이 있으신가요? 로그인하기
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-center">
            <span className="text-[9px] font-bold text-slate-400 tracking-wider">SECURE CLOUD SYNC SYSTEM (FIREBASE)</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 shadow-xs backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-inner shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 id="app-title" className="text-sm xs:text-base font-extrabold tracking-tight text-slate-900 leading-tight">지금, 수학 교습소</h1>
                {isLoadingCloud && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-500 bg-indigo-50 border border-indigo-100 px-1 py-0.5 rounded animate-pulse">
                    <span className="w-1 h-1 bg-indigo-500 rounded-full animate-ping" />
                    동기화 중
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50/85 px-1.5 py-0.5 rounded-md border border-indigo-100/50">
                  {currentUser} 선생님
                </span>
                <span className="text-[9px] text-emerald-600 font-bold bg-emerald-50/50 px-1 py-0.5 rounded border border-emerald-100/30">
                  클라우드 연동됨
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end text-right hidden md:flex mr-1">
              {lastSavedTime && (
                <p className="text-[9px] text-gray-400 font-semibold">
                  최근 저장: {lastSavedTime}
                </p>
              )}
            </div>
            
            <button
              id="saveBtn"
              type="button"
              disabled={saveStatus === "saving"}
              onClick={handleSave}
              className={`font-semibold text-xs px-3.5 py-2 rounded-xl shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-1.5 border ${
                saveStatus === "saved"
                  ? "bg-emerald-500 hover:bg-emerald-600 border-emerald-600 text-white"
                  : saveStatus === "saving"
                  ? "bg-amber-500 border-amber-600 text-white cursor-wait"
                  : saveStatus === "local-only"
                  ? "bg-rose-500 border-rose-600 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 border-indigo-700 text-white hover:shadow"
              }`}
            >
              <span>
                {saveStatus === "saved" 
                  ? "저장됨 ✓" 
                  : saveStatus === "saving" 
                  ? "저장 중..." 
                  : saveStatus === "local-only"
                  ? "로컬 저장됨"
                  : "저장"}
              </span>
              {hasUnsavedChanges && saveStatus !== "saved" && saveStatus !== "saving" && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
              )}
            </button>
            
            <button
              id="logoutBtn"
              type="button"
              onClick={handleLogout}
              className="p-2 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-500 hover:text-rose-500 rounded-xl transition-colors cursor-pointer shrink-0"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-24">
        {/* Section 4: Class Management */}
        <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-500 mb-4 flex items-center gap-1.5 uppercase tracking-wider">
            <FolderPlus className="w-4 h-4 text-indigo-500" />
            반 관리
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              id="class-name-input"
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="추가할 반 이름을 입력해 주세요"
              onKeyDown={(e) => e.key === "Enter" && handleAddClass()}
              className="flex-1 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3.5 text-sm bg-white outline-none transition-colors"
            />
            <button
              id="add-class-btn"
              type="button"
              onClick={handleAddClass}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer shrink-0"
            >
              추가
            </button>
          </div>

          <div id="class-chips-list" className="flex flex-wrap gap-2">
            {classes.length === 0 ? (
              <div className="w-full text-center py-4 text-slate-400 text-xs font-medium">
                등록된 반이 없습니다. 위에서 반을 추가해 보세요.
              </div>
            ) : (
              classes.map((c) => (
                <div
                  key={c.id}
                  id={`class-chip-${c.id}`}
                  onClick={() => handleStartEditClass(c)}
                  className="flex items-center gap-1.5 border border-slate-200 rounded-full py-1.5 pl-3.5 pr-1.5 bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-300 transition-all cursor-pointer group"
                  title="클릭하여 반 이름 및 색상 수정"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-xs font-bold text-slate-700">{c.name}</span>
                  <span className="text-[9px] text-indigo-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity ml-1 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                    수정
                  </span>
                  <button
                    id={`delete-class-btn-${c.id}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClass(c.id);
                    }}
                    className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    title="반 삭제"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Row 1: Add Student */}
        <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
            <UserPlus className="w-4 h-4 text-indigo-500" />
            학생 등록
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="student-name-input"
              type="text"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              placeholder="학생 이름을 입력해 주세요"
              onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
              className="flex-1 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3.5 text-sm bg-white outline-none transition-colors"
            />
            <div className="flex gap-2">
              <select
                id="student-class-input"
                value={newStudentClassId}
                onChange={(e) => setNewStudentClassId(e.target.value)}
                className="border border-slate-200 rounded-xl py-2.5 px-3 text-sm bg-white text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-indigo-500"
              >
                <option value="">반 미지정</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                id="add-student-btn"
                type="button"
                onClick={handleAddStudent}
                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                추가
              </button>
            </div>
          </div>
        </section>

        {/* Row 2: Search & Filter */}
        <section className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <h2 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
            <Search className="w-4 h-4 text-indigo-500" />
            학생 검색 및 정렬
          </h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="student-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="검색할 학생의 이름을 입력하세요..."
                className="w-full border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 pl-10 pr-3.5 text-sm bg-white outline-none transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
              <select
                id="student-sort-input"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as "name" | "class")}
                className="w-full sm:w-auto border border-slate-200 rounded-xl py-2.5 px-3 text-sm bg-white text-slate-700 font-medium cursor-pointer focus:outline-none focus:border-indigo-500"
              >
                <option value="name">가나다순</option>
                <option value="class">반 순</option>
              </select>
            </div>
          </div>
        </section>

        {/* Row 3: Student Grid & List Controls */}
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs">
            <button
              id="toggle-student-list-collapse"
              type="button"
              onClick={() => setIsStudentListCollapsed(!isStudentListCollapsed)}
              className="w-full sm:w-auto text-xs font-semibold px-3 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer text-center"
            >
              {isStudentListCollapsed ? "학생 목록 펼치기" : "학생 목록 접기"}
            </button>

            <div className="flex flex-col xs:flex-row xs:items-center gap-2.5 w-full sm:w-auto">
              <div className="grid grid-cols-2 gap-1.5 w-full xs:w-auto xs:flex xs:items-center xs:border-r xs:border-slate-200 xs:pr-2.5">
                <button
                  id="bulk-select-all-btn"
                  type="button"
                  onClick={handleBulkSelectAll}
                  className="text-xs font-semibold px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl transition-colors cursor-pointer text-center"
                >
                  전체 선택
                </button>
                <button
                  id="bulk-clear-all-btn"
                  type="button"
                  onClick={handleBulkClearAll}
                  className="text-xs font-semibold px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl transition-colors cursor-pointer text-center"
                >
                  선택 해제
                </button>
              </div>

              <div className="flex items-center gap-1.5 w-full xs:w-auto">
                <select
                  id="class-selection-filter"
                  value={classSelectionFilter}
                  onChange={(e) => setClassSelectionFilter(e.target.value)}
                  className="flex-1 xs:flex-initial text-xs font-semibold border border-slate-200 rounded-xl py-2.5 px-2.5 bg-white text-slate-700 cursor-pointer focus:outline-none focus:border-indigo-500 min-w-0"
                >
                  <option value="">반 선택...</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__none__">반 미지정</option>
                </select>
                <button
                  id="bulk-select-class-btn"
                  type="button"
                  onClick={handleBulkSelectClass}
                  className="text-xs font-semibold px-3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer shrink-0"
                >
                  이 반 선택
                </button>
              </div>
            </div>
          </div>

          {/* Student Grid Area */}
          {!isStudentListCollapsed && (
            <div id="students-grid-container" className="space-y-4">
              {students.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl py-12 text-center text-slate-400 text-sm font-medium">
                  아직 등록된 학생이 없습니다. 위에서 등록해 보세요!
                </div>
              ) : sortedStudents.length === 0 ? (
                <div className="bg-white border border-slate-200/80 rounded-2xl py-12 text-center text-slate-400 text-sm font-medium">
                  검색 결과가 없습니다.
                </div>
              ) : sortMode === "class" ? (
                /* Sorted by Class Groups */
                <div className="space-y-4">
                  {studentGroupsByClass.map((group) => {
                    const groupKey = group.id || "__unassigned__";
                    const isCollapsed = collapsedClassGroupIds.has(groupKey);

                    return (
                      <div
                        key={groupKey}
                        id={`class-group-${groupKey}`}
                        className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs"
                      >
                        {/* Group Header */}
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                          <button
                            id={`group-toggle-btn-${groupKey}`}
                            type="button"
                            onClick={() => toggleClassGroupCollapse(groupKey)}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            {group.color && (
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: group.color }}
                              />
                            )}
                            <span className="font-bold text-slate-800 text-sm">
                              {group.name}
                            </span>
                            <span className="text-xs text-slate-400 font-medium">
                              {group.studentsList.length}명
                            </span>
                          </div>
                        </div>

                        {/* Collapsible Student Grid */}
                        {!isCollapsed && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {group.studentsList.map((s) => (
                              <StudentCard
                                key={s.id}
                                student={s}
                                classes={classes}
                                isSelected={selectedStudentIds.has(s.id)}
                                onToggleSelect={handleToggleSelectStudent}
                                onDelete={handleDeleteStudent}
                                onClassChange={handleStudentClassChange}
                                onClickCard={setActiveStudentId}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Standard Name Sorted Grid */
                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {sortedStudents.map((s) => (
                    <StudentCard
                      key={s.id}
                      student={s}
                      classes={classes}
                      isSelected={selectedStudentIds.has(s.id)}
                      onToggleSelect={handleToggleSelectStudent}
                      onDelete={handleDeleteStudent}
                      onClassChange={handleStudentClassChange}
                      onClickCard={setActiveStudentId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Floating Bulk Action Bar */}
          {selectedStudentIds.size > 0 && (
            <div
              id="bulk-action-bar"
              className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col gap-3 shadow-xl z-30 animate-in fade-in slide-in-from-bottom-5 duration-200"
            >
              <div className="flex items-center justify-between gap-2 text-white border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                  <span className="text-sm font-semibold">
                    {selectedStudentIds.size}명 선택됨
                    {mainSelectionsCount > 0 && (
                      <span className="text-indigo-300 font-bold ml-1.5 bg-indigo-950/50 px-2 py-0.5 rounded-md border border-indigo-800 text-[11px]">
                        {mainSelectionsCount}개 날짜 선택됨
                      </span>
                    )}
                  </span>
                </div>
                {mainSelectionsCount > 0 && (
                  <span className="text-[10px] text-indigo-300 font-bold hidden xs:inline animate-pulse">
                    수업 추가/제거 버튼을 눌러 배정하세요
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 xs:flex xs:flex-wrap xs:items-center gap-1.5 w-full">
                <button
                  id="bulk-action-download"
                  type="button"
                  onClick={() => {
                    setBulkDownloadYear(mainYear);
                    setBulkDownloadMonth(mainMonth);
                    setIsBulkDownloadModalOpen(true);
                  }}
                  className="text-xs font-bold px-2.5 py-2.5 sm:px-3.5 sm:py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-100" />
                  달력 다운로드
                </button>

                {mainSelectionsCount > 0 ? (
                  <>
                    <button
                      id="bulk-action-add-lessons"
                      type="button"
                      onClick={handleAddLessonsMain}
                      className="text-xs font-bold px-2.5 py-2.5 sm:px-3.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center text-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      수업 추가
                    </button>
                    <button
                      id="bulk-action-remove-lessons"
                      type="button"
                      onClick={handleRemoveLessonsMain}
                      className="text-xs font-bold px-2.5 py-2.5 sm:px-3.5 sm:py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center text-center gap-1"
                    >
                      <Minus className="w-3.5 h-3.5" />
                      수업 제거
                    </button>
                  </>
                ) : (
                  <button
                    id="bulk-action-scroll-calendar"
                    type="button"
                    onClick={handleScrollToMainCalendar}
                    className="text-xs font-bold px-2.5 py-2.5 sm:px-3.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center text-center gap-1"
                  >
                    <CalendarDays className="w-3.5 h-3.5" />
                    수업 배정 (달력)
                  </button>
                )}

                <button
                  id="bulk-action-delete"
                  type="button"
                  onClick={handleBulkDelete}
                  className="text-xs font-bold px-2.5 py-2.5 sm:px-3.5 sm:py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer flex items-center justify-center text-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  삭제
                </button>
                <button
                  id="bulk-action-clear"
                  type="button"
                  onClick={handleBulkClearAll}
                  className="text-xs font-bold px-2 py-2.5 sm:px-3 sm:py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors cursor-pointer flex items-center justify-center text-center"
                >
                  선택 취소
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Section 5: Main Calendar Panel */}
        <section
          id="main-calendar-section"
          className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider border-b border-slate-100 pb-2">
            <CalendarDays className="w-4 h-4 text-indigo-500" />
            메인 달력
          </h2>

          <Calendar
            mode="main"
            students={students}
            classes={classes}
            selectedDays={mainSelections[`${mainYear}-${mainMonth}`] || []}
            onToggleDay={handleToggleMainDay}
            onToggleWeekday={handleToggleMainWeekday}
            onToggleDays={handleToggleMainDays}
            onClearSelection={handleClearMainSelection}
            year={mainYear}
            month={mainMonth}
            onDateChange={handleMainDateChange}
          />

          {/* Today's Lesson Summary */}
          <div
            id="today-lesson-summary"
            className="p-4 bg-slate-50 border border-slate-150 rounded-xl"
          >
            <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5" />
              오늘 수업 요약
            </h3>

            {todayLessonSummary.length === 0 ? (
              <p className="text-xs font-medium text-gray-400">오늘 예정된 수업이 없습니다.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {todayLessonSummary.map((clsInfo) => (
                  <div
                    key={clsInfo.name}
                    className="bg-white border border-slate-200/60 p-3 rounded-lg shadow-2xs flex flex-col gap-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: clsInfo.color }}
                      />
                      <span className="font-bold text-slate-800 text-xs">
                        {clsInfo.name} ({clsInfo.students.length}명)
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {clsInfo.students.map((stud) => (
                        <button
                          key={stud.id}
                          type="button"
                          onClick={() => {
                            setActiveStudentId(stud.id);
                            const today = new Date();
                            setModalYear(today.getFullYear());
                            setModalMonth(today.getMonth());
                          }}
                          className="text-[10px] bg-indigo-50/40 hover:bg-indigo-100/75 border border-indigo-100 hover:border-indigo-200 px-2 py-0.5 rounded-md font-bold text-indigo-700 transition-all cursor-pointer flex items-center gap-0.5"
                          title="클릭하여 학생 달력 열기"
                        >
                          <span>{stud.name}</span>
                          <span className="text-[9px] text-indigo-400">🗓️</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Main Selection Bar Actions */}
          {mainSelectionsCount > 0 && selectedStudentIds.size === 0 && (
            <div
              id="main-selection-bar"
              className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-150"
            >
              <span className="text-xs font-bold text-indigo-700">
                {mainSelectionsCount}개 날짜 선택됨
              </span>
              <div className="flex items-center gap-2">
                <button
                  id="main-add-lesson-btn"
                  type="button"
                  onClick={handleAddLessonsMain}
                  className="text-xs font-bold px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  수업 추가
                </button>
                <button
                  id="main-remove-lesson-btn"
                  type="button"
                  onClick={handleRemoveLessonsMain}
                  className="text-xs font-bold px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer"
                >
                  수업 제거
                </button>
                <button
                  id="main-clear-selection-btn"
                  type="button"
                  onClick={handleClearMainSelection}
                  className="text-xs font-bold px-3 py-1.5 border border-slate-200 hover:bg-white text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Student Calendar Modal */}
      {activeStudentId && activeStudent && (
        <div
          id="student-calendar-modal"
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => setActiveStudentId(null)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-2xl p-5 border border-slate-100 relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center font-bold text-indigo-600">
                  {activeStudent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {activeStudent.name}
                  </h3>
                  <span className="text-[10px] font-bold text-gray-500">
                    소속 반:{" "}
                    {classes.find((c) => c.id === activeStudent.classId)?.name ||
                      "반 미지정"}
                  </span>
                </div>
              </div>
              <button
                id="modal-close-btn"
                type="button"
                onClick={() => setActiveStudentId(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto py-3 pr-1.5 space-y-4 min-h-0">
              {/* Modal Calendar */}
              {activeStudent.classId && (
                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-3 flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-indigo-500" />
                    수업 회차 세기 기준일 (선택)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="student-base-date-input"
                      type="date"
                      value={activeStudent.baseDate || ""}
                      onChange={(e) => handleUpdateStudentBaseDate(activeStudent.id, e.target.value)}
                      className="flex-1 border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg py-1.5 px-3 text-xs bg-white outline-none transition-colors"
                    />
                    {activeStudent.baseDate && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStudentBaseDate(activeStudent.id, "")}
                        className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-500 transition-colors cursor-pointer bg-white"
                      >
                        초기화
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium leading-normal">
                    지정된 기준일 이후의 수업들에 대해서만 몇 번째 수업인지 회차 번호를 세어 표시합니다. (이전 날짜는 빈 칸으로 표시)
                  </p>
                </div>
              )}

              <Calendar
                mode="student"
                student={activeStudent}
                students={students}
                classes={classes}
                selectedDays={
                  (activeStudent.selections &&
                    activeStudent.selections[`${modalYear}-${modalMonth}`]) ||
                  []
                }
                onToggleDay={handleToggleStudentDay}
                onToggleWeekday={handleToggleStudentWeekday}
                onToggleDays={handleToggleStudentDays}
                onClearSelection={handleClearStudentSelection}
                year={modalYear}
                month={modalMonth}
                onDateChange={handleModalDateChange}
              />

              {/* Helper Hint */}
              {!activeStudent.classId && (
                <div className="flex items-start gap-1.5 bg-amber-50 text-amber-800 p-2.5 rounded-xl border border-amber-100 text-[11px] leading-relaxed font-semibold">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                  <span>
                    이 학생은 현재 소속 반이 없어 수업 배정이 불가능합니다.
                    배정 전에 소속 반을 선택해 주세요.
                  </span>
                </div>
              )}

              {/* Download Calendar as PNG */}
              <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5">
                <button
                  id="modal-download-png-btn"
                  type="button"
                  onClick={() => downloadStudentCalendarPNG(activeStudent, modalYear, modalMonth, classes)}
                  className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  수업 달력 이미지 다운로드 (.png)
                </button>
                <p className="text-[10px] text-slate-400 text-center font-medium">
                  현재 화면에 표시된 {modalYear}년 {modalMonth + 1}월 달력 이미지(PNG)가 기기에 다운로드됩니다.
                </p>
              </div>

              {/* Modal Selection Actions */}
              {modalSelectionsCount > 0 && (
                <div
                  id="modal-selection-bar"
                  className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-700">
                      {modalSelectionsCount}개 날짜 선택됨
                    </span>
                    <button
                      id="modal-clear-selection-btn"
                      type="button"
                      onClick={handleClearStudentSelection}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline transition-colors cursor-pointer"
                    >
                      선택 취소
                    </button>
                  </div>

                  {/* Lesson Class Selector */}
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-100 flex flex-col gap-1 shadow-2xs">
                    <label className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      수업 추가 시 지정할 반 선택
                    </label>
                    <select
                      id="modal-lesson-class-select"
                      value={modalLessonClassId || ""}
                      onChange={(e) => setModalLessonClassId(e.target.value || null)}
                      className="w-full text-xs border border-slate-200 rounded-lg py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold cursor-pointer focus:outline-none transition-colors"
                    >
                      <option value="">반 선택 (미지정)</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-indigo-100/50">
                    <div className="flex items-center gap-1.5">
                      <button
                        id="modal-add-lesson-btn"
                        type="button"
                        onClick={() => handleAddLessonsStudent(modalLessonClassId)}
                        disabled={!modalLessonClassId}
                        className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer flex-1 text-center justify-center ${
                          modalLessonClassId
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        수업 추가
                      </button>
                      <button
                        id="modal-remove-lesson-btn"
                        type="button"
                        onClick={handleRemoveLessonsStudent}
                        className="text-xs font-bold px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer flex-1 text-center justify-center"
                      >
                        수업 제거
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        id="modal-add-unavailable-btn"
                        type="button"
                        onClick={handleAddUnavailablesStudent}
                        className="text-xs font-bold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors cursor-pointer flex-1 text-center justify-center shadow-xs"
                      >
                        🚫 불가일 등록
                      </button>
                      <button
                        id="modal-remove-unavailable-btn"
                        type="button"
                        onClick={handleRemoveUnavailablesStudent}
                        className="text-xs font-bold px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer flex-1 text-center justify-center shadow-xs"
                      >
                        불가일 해제
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Calendar Download Modal */}
      {isBulkDownloadModalOpen && (
        <div
          id="bulk-download-modal"
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => !isDownloading && setIsBulkDownloadModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-100 relative space-y-4 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center font-bold text-emerald-600">
                  <Download className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    선택 학생 달력 일괄 다운로드
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    선택된 {selectedStudentIds.size}명의 수업 일정을 일괄 출력합니다.
                  </p>
                </div>
              </div>
              {!isDownloading && (
                <button
                  id="bulk-download-close-btn"
                  type="button"
                  onClick={() => setIsBulkDownloadModalOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Selected Students Preview */}
            <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                다운로드 대상 학생 ({selectedStudentIds.size}명)
              </div>
              <div className="max-h-24 overflow-y-auto text-xs font-semibold text-slate-600 space-y-1 pr-1">
                {Array.from(selectedStudentIds)
                  .map((id) => students.find((s) => s.id === id)?.name)
                  .filter(Boolean)
                  .join(", ")}
              </div>
            </div>

            {/* Target Year / Month Dropdowns */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                출력 대상 월 선택
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <select
                    id="bulk-download-year-select"
                    value={bulkDownloadYear}
                    disabled={isDownloading}
                    onChange={(e) => setBulkDownloadYear(parseInt(e.target.value, 10))}
                    className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs bg-white text-slate-700 font-bold cursor-pointer focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                      <option key={y} value={y}>
                        {y}년
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <select
                    id="bulk-download-month-select"
                    value={bulkDownloadMonth}
                    disabled={isDownloading}
                    onChange={(e) => setBulkDownloadMonth(parseInt(e.target.value, 10))}
                    className="w-full border border-slate-200 rounded-xl py-2 px-3 text-xs bg-white text-slate-700 font-bold cursor-pointer focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  >
                    {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>
                        {m + 1}월
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDownloading}
                onClick={() => setIsBulkDownloadModalOpen(false)}
                className="flex-1 py-2 px-3 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isDownloading}
                onClick={handleBulkDownloadStart}
                className="flex-1 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-600 text-white py-2 px-3 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-sm"
              >
                {isDownloading ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    다운로드 중...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    일괄 다운로드
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Class Edit Modal */}
      {editingClass && (
        <div
          id="class-edit-modal"
          className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200"
          onClick={() => setEditingClass(null)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-100 relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-1.5">
                <FolderPlus className="w-5 h-5 text-indigo-500" />
                반 정보 수정
              </h3>
              <button
                id="class-modal-close-btn"
                type="button"
                onClick={() => setEditingClass(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="space-y-4">
              {/* Class Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">반 이름</label>
                <input
                  id="editing-class-name-input"
                  type="text"
                  value={editingClassName}
                  onChange={(e) => setEditingClassName(e.target.value)}
                  placeholder="반 이름을 입력하세요"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveEditClass()}
                  className="w-full border border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2 px-3.5 text-xs bg-white outline-none transition-colors font-bold text-slate-800"
                />
              </div>

              {/* Class Color Grid */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500">반 색상 선택</label>
                <div className="grid grid-cols-5 gap-2.5 p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                  {SELECTABLE_COLORS.map((cOption) => {
                    const isSelected = editingClassColor === cOption.color;
                    return (
                      <button
                        key={cOption.name}
                        type="button"
                        onClick={() => setEditingClassColor(cOption.color)}
                        className="flex flex-col items-center gap-1 p-1 rounded-lg hover:bg-white transition-colors cursor-pointer"
                        title={cOption.name}
                      >
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                            isSelected ? "ring-2 ring-indigo-500 ring-offset-2 scale-110 shadow-sm" : "hover:scale-105"
                          }`}
                          style={{ backgroundColor: cOption.color }}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3.5px]" />}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 mt-0.5">{cOption.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 mt-5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`"${editingClass.name}" 반을 삭제하시겠습니까?\n배정된 수업과 학생의 소속 반도 함께 미지정으로 변경됩니다.`)) {
                    handleDeleteClass(editingClass.id);
                    setEditingClass(null);
                  }
                }}
                className="py-2.5 px-3.5 border border-rose-100 hover:bg-rose-50 hover:border-rose-200 text-rose-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={() => setEditingClass(null)}
                className="flex-1 py-2.5 px-3.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEditClass}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3.5 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
