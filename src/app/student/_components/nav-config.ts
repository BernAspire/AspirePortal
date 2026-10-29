import { STUDENT_HOME_PATH } from "@/lib/auth/routing";

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
    items: [{ label: "Learn" }, { label: "Practice" }, { label: "Mock Exams" }, { label: "Smart Revision" }],
  },
  {
    label: "Classes",
    items: [
      { label: "My Classes" },
      { label: "Class Notes" },
      { label: "Homework" },
      { label: "Tutorials" },
      { label: "Calendar" },
      { label: "Attendance" },
    ],
  },
  {
    label: "Progress",
    items: [{ label: "Progress" }, { label: "Monthly Feedback" }, { label: "Rewards" }],
  },
];

export const FOOTER_ITEMS: readonly NavItem[] = [{ label: "Settings" }, { label: "Notifications" }];
