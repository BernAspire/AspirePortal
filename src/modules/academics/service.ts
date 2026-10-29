export interface Course {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "suspended" | "archived";
  readonly subjectId: string;
}

export interface Subject {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly sort: number;
}

export interface StudentCourse {
  readonly courseId: string;
  readonly isCurrent: boolean;
}
