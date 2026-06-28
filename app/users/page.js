import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/access-control";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import UsersClient from "./users-client";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  if (!isAdminUser(session.username)) {
    redirect("/dashboard");
  }

  return <UsersClient username={session.username} />;
}
