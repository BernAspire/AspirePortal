import { STUDENT_HOME_PATH } from "@/lib/auth/routing";

export const LEARN_PATH = `${STUDENT_HOME_PATH}/learn`;
export const PRACTICE_PATH = `${STUDENT_HOME_PATH}/practice`;
export const MY_CLASSES_PATH = `${STUDENT_HOME_PATH}/classes`;
export const TUTORIALS_PATH = `${STUDENT_HOME_PATH}/tutorials`;
export const CALENDAR_PATH = `${STUDENT_HOME_PATH}/calendar`;
export const ATTENDANCE_PATH = `${STUDENT_HOME_PATH}/attendance`;

/**
 * The student portal's navigation, matching the Aspire Online design.
 * Items without an `href` are not built yet and show as "Soon".
 */
export interface NavItem {
  readonly label: string;
  readonly href?: string;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const HOME_ITEM: NavItem = { label: "Home", href: STUDENT_HOME_PATH };

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Learn",
    items: [{ label: "Learn", href: LEARN_PATH }, { label: "Practice", href: PRACTICE_PATH }, { label: "Mock Exams" }, { label: "Smart Revision" }],
  },
  {
    label: "Classes",
    items: [
      { label: "My Classes", href: MY_CLASSES_PATH },
      { label: "Class Notes" },
      { label: "Homework" },
      { label: "Tutorials", href: TUTORIALS_PATH },
      { label: "Calendar", href: CALENDAR_PATH },
      { label: "Attendance", href: ATTENDANCE_PATH },
    ],
  },
  {
    label: "Progress",
    items: [{ label: "Progress" }, { label: "Monthly Feedback" }, { label: "Rewards" }],
  },
];

export const FOOTER_ITEMS: readonly NavItem[] = [{ label: "Settings" }, { label: "Notifications" }];
