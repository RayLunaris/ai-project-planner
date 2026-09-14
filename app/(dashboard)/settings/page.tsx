import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalAccessTokens } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { TokenManager } from "@/components/settings/token-manager";

export const metadata = {
  title: "Settings — AI Project Planner",
  description: "Kelola personal access token dan pengaturan akun",
};

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const tokens = await db
    .select({
      id: personalAccessTokens.id,
      label: personalAccessTokens.label,
      createdAt: personalAccessTokens.createdAt,
      lastUsedAt: personalAccessTokens.lastUsedAt,
    })
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, session.user.id))
    .orderBy(desc(personalAccessTokens.createdAt));

  // Serialize dates for client component
  const serializedTokens = tokens.map((t) => ({
    ...t,
    createdAt: t.createdAt?.toISOString() ?? null,
    lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <DashboardHeader user={session.user} />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="pb-6 border-b border-border/40 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola token akses dan pengaturan akun Anda.
          </p>
        </div>

        <TokenManager initialTokens={serializedTokens} />
      </main>
    </div>
  );
}
