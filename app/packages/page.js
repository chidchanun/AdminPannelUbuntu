import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import PackagesClient from "./packages-client";

export default async function PackagesPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return <PackagesClient username={session.username} />;
}
