import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

import { rewardsRow, type Rewards } from "./schema";

/** The signed-in student's XP, streaks and badges (derived in the database), or null. */
export const getMyRewards = cache(async (centreId: string): Promise<Rewards | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_rewards", { p_centre: centreId });
  if (error) throw new Error("Could not load your rewards.");
  if (data === null) return null;
  return rewardsRow.parse(data);
});
