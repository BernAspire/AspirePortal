import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { signOut } from "../actions";

export const metadata: Metadata = { title: "No access yet" };

export default function NoAccessPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Nothing to show yet</h1>
        </CardTitle>
        <CardDescription>
          Your account isn&apos;t linked to a student portal. If you think this is wrong, please
          contact your centre. Portals for parents and staff are coming later.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
