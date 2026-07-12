export interface ClassGroup {
  id: string;
  name: string;
  color: string;
}

export interface Student {
  id: string;
  name: string;
  classId: string | null;
  selections?: { [monthKey: string]: number[] }; // Selected days in the calendar (for modal)
  lessons?: { [monthKey: string]: { [day: string]: string } }; // monthKey ("YYYY-M") -> day -> classId
  baseDate?: string; // Base date for lesson counting (e.g., "YYYY-MM-DD")
}

export interface MainSelections {
  [monthKey: string]: number[]; // Selected days on the main calendar
}
