import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";
import ServicesClient from "./services-client";

export default async function ServicesPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return <ServicesClient username={session.username} />;
}
