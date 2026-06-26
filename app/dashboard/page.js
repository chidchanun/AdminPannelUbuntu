import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] px-6 py-8 text-white sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-5xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
              Ubuntu Admin Panel
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">
              ยินดีต้อนรับ, {session.username}
            </h1>
          </div>

          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-white/14 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              ออกจากระบบ
            </button>
          </form>
        </header>

        <section className="grid flex-1 items-center py-12">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-black/20">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e95420]">
              Authenticated by PAM
            </p>
            <h2 className="mt-4 text-4xl font-bold tracking-normal">
              Login สำเร็จด้วยบัญชี Ubuntu Server
            </h2>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-white/68">
              หน้านี้เป็นจุดเริ่มต้นสำหรับต่อยอด dashboard จริง เช่น จัดการผู้ใช้
              สิทธิ์การเข้าถึง และการตั้งค่าของ admin panel
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
