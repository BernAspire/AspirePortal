import { Suspense } from "react";

import { signOut } from "../(auth)/actions";

import { CentreWordmark, ProfileCard, ProfileSkeleton, StudentShell } from "./_components/shell";
import { getShellProfile } from "./_data";

export default function StudentLayout({ children }: LayoutProps<"/student">) {
  return (
    <StudentShell
      wordmarkSlot={
        <Suspense fallback={<span className="font-display text-[19px] font-bold">Portal</span>}>
          <Wordmark />
        </Suspense>
      }
      profileSlot={
        <Suspense fallback={<ProfileSkeleton />}>
          <Profile />
        </Suspense>
      }
      signOutSlot={
        <form action={signOut} className="px-0">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center rounded-[10px] px-3 text-left text-sm text-[#3D4146] outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Sign out
          </button>
        </form>
      }
    >
      {children}
    </StudentShell>
  );
}

async function Wordmark() {
  const profile = await getShellProfile();
  return <CentreWordmark name={profile.centreName} />;
}

async function Profile() {
  return <ProfileCard profile={await getShellProfile()} />;
}
