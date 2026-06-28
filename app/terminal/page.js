import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/access-control";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import TerminalClient from "./terminal-client";

export default async function TerminalPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  if (!isAdminUser(session.username)) {
    redirect("/dashboard");
  }

  return <TerminalClient username={session.username} />;
}
