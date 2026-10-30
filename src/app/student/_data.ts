import "server-only";

import { cache } from "react";

import { STUDENT_HOME_PATH } from "@/lib/auth/routing";
import { requirePortal } from "@/lib/auth/session";
import { getLevelName } from "@/modules/academics";
import { getMyStudent } from "@/modules/crm";
import { getMyRewards, levelFor, XP_PER_LEVEL } from "@/modules/engagement";
import { getActiveEntitlements } from "@/modules/programmes";

import type { SidebarProfile } from "./_components/profile-card";
import { overallValidity } from "./home-model";

/** What the portal shell shows about the signed-in student. One fetch per request. */
export const getShellProfile = cache(async (): Promise<SidebarProfile> => {
  const { centre } = await requirePortal("student", STUDENT_HOME_PATH);
  const student = await getMyStudent(centre.centreId);
  if (!student) {
    return {
      centreName: centre.centreName,
      fullName: "Student",
      initials: "?",
      levelName: null,
      clientCode: "—",
      validity: null,
    };
  }
  const [levelName, entitlements, rewards] = await Promise.all([
    getLevelName(student.levelId),
    getActiveEntitlements(centre.centreId, student.id),
    // The sidebar still renders if rewards can't be loaded.
    getMyRewards(centre.centreId).catch(() => null),
  ]);
  const level = rewards ? levelFor(rewards.totalXp) : null;
  return {
    centreName: centre.centreName,
    fullName: student.fullName,
    initials: student.initials,
    levelName,
    clientCode: student.clientCode,
    validity: overallValidity(entitlements),
    rewards:
      rewards && level
        ? {
            level: level.level,
            inLevel: level.inLevel,
            target: level.toNext === null ? null : XP_PER_LEVEL,
            percent: level.percent,
            streak: rewards.currentStreak,
          }
        : null,
  };
});
