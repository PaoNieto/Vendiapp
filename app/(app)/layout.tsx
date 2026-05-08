import { BottomNav } from "@/components/app/bottom-nav";
import { Sidebar } from "@/components/app/sidebar";
import { FREE_PLAN_CREDITS } from "@/lib/constants";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: reemplazar con query a Supabase cuando lleguen las keys
  // const supabase = await createClient();
  // const { data: profile } = await supabase.from("profiles").select("credits_remaining").single();
  const creditsRemaining = FREE_PLAN_CREDITS;

  return (
    <div className="flex min-h-dvh">
      <Sidebar creditsRemaining={creditsRemaining} />
      <div className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</div>
      <BottomNav />
    </div>
  );
}
