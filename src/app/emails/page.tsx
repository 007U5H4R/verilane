import { Suspense } from "react";
import { EmailsView } from "@/components/emails/EmailsView";
import { RowSkeleton } from "@/components/states/RowSkeleton";

export default function EmailsPage() {
  return (
    <Suspense fallback={<RowSkeleton label="Loading email conversations" />}>
      <EmailsView />
    </Suspense>
  );
}
