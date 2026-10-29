import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Aspire Portal</h1>
        <p className="text-muted-foreground">
          Lessons, practice and progress for students, families and staff.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>
            Sign-in for students and families is being built. Check back shortly.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Questions? Contact your centre.
        </CardContent>
      </Card>
    </main>
  );
}
