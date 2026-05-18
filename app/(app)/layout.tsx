import { BottomNav } from "@/components/app/bottom-nav";
import { Sidebar } from "@/components/app/sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const plan = "Pro";

  return (
    <div className="flex min-h-dvh">
      <Sidebar plan={plan} />
      <div className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
