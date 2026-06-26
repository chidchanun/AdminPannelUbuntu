import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return <DashboardClient username={session.username} />;
}
