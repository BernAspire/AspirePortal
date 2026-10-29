import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { getMyStudent } from "@/modules/crm";
import { getBookedSessions } from "@/modules/scheduling";

import { ClassesSkeleton } from "../_components/class-ui";
import { ATTENDANCE_PATH } from "../_components/nav-config";

import { AttendanceView } from "./attendance-view";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="your attendance" />}>
      <Attendance />
    </Suspense>
  );
}

async function Attendance() {
  const { centre } = await requirePortal("student", ATTENDANCE_PATH);
  const student = await getMyStudent(centre.centreId);
  const now = new Date();
  const sessions = student ? await getBookedSessions(centre.centreId, student.id, undefined, now.toISOString()) : [];
  return <AttendanceView sessions={sessions} now={now} />;
}
