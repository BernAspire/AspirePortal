export interface Course {
  readonly id: string;
  readonly name: string;
  readonly status: "active" | "suspended" | "archived";
}

export interface StudentCourse {
  readonly courseId: string;
  readonly isCurrent: boolean;
}
