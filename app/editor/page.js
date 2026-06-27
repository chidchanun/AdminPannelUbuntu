import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import EditorClient from "./editor-client";

export default async function EditorPage({ searchParams }) {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  const params = await searchParams;

  return <EditorClient initialPath={params?.path || ""} username={session.username} />;
}
