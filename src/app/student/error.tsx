"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle>
          <h1 className="text-lg">Something went wrong</h1>
        </CardTitle>
        <CardDescription>
          We couldn&apos;t load this page. Please try again. If it keeps happening, contact your
          centre.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={reset}>Try again</Button>
      </CardContent>
    </Card>
  );
}
