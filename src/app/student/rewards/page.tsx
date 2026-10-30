import type { Metadata } from "next";
import { Suspense } from "react";

import { requirePortal } from "@/lib/auth/session";
import { formatSingapore, singaporeDate } from "@/lib/time";
import { badgesFor, getMyRewards, LEVEL_NAMES, levelFor, streakDays, xpLabel } from "@/modules/engagement";

import { ClassesSkeleton, EmptyState } from "../_components/class-ui";
import { REWARDS_PATH } from "../_components/nav-config";

import { RewardsView } from "./rewards-view";

export const metadata: Metadata = { title: "Rewards" };

export default function RewardsPage() {
  return (
    <Suspense fallback={<ClassesSkeleton label="your rewards" />}>
      <Rewards />
    </Suspense>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

async function Rewards() {
  const { centre } = await requirePortal("student", REWARDS_PATH);
  const rewards = await getMyRewards(centre.centreId);
  if (!rewards) {
    return <EmptyState title="No rewards yet">Your student record isn&apos;t set up. Please contact {centre.centreName}.</EmptyState>;
  }
  const level = levelFor(rewards.totalXp);
  return (
    <RewardsView
      level={level.level}
      levelName={level.name}
      inLevel={level.inLevel}
      toNext={level.toNext}
      nextLevel={level.nextName ? { code: `L${level.level + 1}`, name: level.nextName } : null}
      percent={level.percent}
      levels={LEVEL_NAMES}
      recent={rewards.recent.map((r) => ({ label: xpLabel(r.reason, r.note), when: formatSingapore(r.at, "d MMM yyyy, HH:mm"), xp: r.amount }))}
      badges={badgesFor(rewards)}
      streak={{
        current: rewards.currentStreak,
        best: rewards.bestStreak,
        activeToday: rewards.activeToday,
        days: streakDays(rewards.activeDays, singaporeDate()).map((d) => ({ ...d, label: dayLabel(d.date) })),
      }}
    />
  );
}
