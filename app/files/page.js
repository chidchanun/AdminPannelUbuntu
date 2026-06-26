import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import FilesClient from "./files-client";

export default async function FilesPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return <FilesClient username={session.username} />;
}
