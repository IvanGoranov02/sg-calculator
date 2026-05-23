import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AdminForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Admin access denied</h1>
      <p className="text-sm text-muted-foreground">
        Your account is not in ADMIN_EMAILS. Contact the site owner if you need access.
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        Back to app
      </Button>
    </div>
  );
}
