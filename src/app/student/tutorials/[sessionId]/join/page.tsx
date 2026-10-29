import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { formatSingapore } from "@/lib/time";
import { getMyStudent } from "@/modules/crm";
import { getBookedSession, getJoinUrl, JOIN_OPENS_MINUTES, joinState } from "@/modules/scheduling";

import { Card, ClassesSkeleton } from "../../../_components/class-ui";
import { TUTORIALS_PATH } from "../../../_components/nav-config";

export const metadata: Metadata = { title: "Join tutorial" };

export default function JoinPage({ params }: PageProps<"/student/tutorials/[sessionId]/join">) {
  return (
    <Suspense fallback={<ClassesSkeleton label="the tutorial" />}>
      <Join params={params} />
    </Suspense>
  );
}

/**
 * Sends the student to the meeting link. The database decides (session_join_url):
 * booked, programme active today, and within the join window. The link itself is
 * never written into the page.
 */
async function Join({ params }: { params: PageProps<"/student/tutorials/[sessionId]/join">["params"] }) {
  const { sessionId } = await params;
  const { centre } = await requirePortal("student", TUTORIALS_PATH);
  const url = await getJoinUrl(sessionId);
  if (url) redirect(url);

  const student = await getMyStudent(centre.centreId);
  const session = student ? await getBookedSession(centre.centreId, student.id, sessionId) : null;
  const state = session ? joinState(session) : null;
  const message = !session
    ? "We couldn't find this tutorial in your timetable."
    : state === "cancelled"
      ? "This tutorial was cancelled by the centre."
      : state === "ended"
        ? "This tutorial has ended."
        : state === "upcoming"
          ? `You can join from ${formatSingapore(new Date(new Date(session.startsAt).getTime() - JOIN_OPENS_MINUTES * 60_000), "h:mm aaa 'on' EEE d MMM")}.`
          : `Your programme for this course isn't active, so the link isn't available. Please contact ${centre.centreName}.`;

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-3 p-6 text-center">
      <h1 className="font-display text-lg font-semibold">{session ? session.courseName : "Tutorial"}</h1>
      <p className="text-sm text-[#3D4146]">{message}</p>
      <Link href={TUTORIALS_PATH} className="text-sm font-semibold underline underline-offset-4">
        Back to Tutorials
      </Link>
    </Card>
  );
}
