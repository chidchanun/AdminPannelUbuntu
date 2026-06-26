import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionValue, SESSION_COOKIE } from "@/lib/auth-session";

const navigationItems = [
  "Overview",
  "Users",
  "Permissions",
  "Settings",
  "Audit log",
];

const quickActions = [
  {
    title: "Manage users",
    description: "Add, disable, and review administrator accounts.",
    action: "Open users",
  },
  {
    title: "Access rules",
    description: "Define which roles can use each admin module.",
    action: "Edit rules",
  },
  {
    title: "Security policy",
    description: "Prepare password, session, and sign-in requirements.",
    action: "Review policy",
  },
];

const modules = [
  {
    name: "User administration",
    detail: "Create admin accounts and assign responsibilities.",
    status: "Ready",
  },
  {
    name: "Role permissions",
    detail: "Group access by owner, operator, and viewer roles.",
    status: "Draft",
  },
  {
    name: "System settings",
    detail: "Central place for panel configuration and server options.",
    status: "Ready",
  },
  {
    name: "Audit activity",
    detail: "Track important admin actions after each sign in.",
    status: "Planned",
  },
];

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const session = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-[#1c1b22] text-white">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/10 bg-[#111111] px-5 py-6 lg:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-3 px-2">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-[#e95420] font-bold shadow-lg shadow-[#e95420]/20">
                UA
              </div>
              <div>
                <p className="text-sm text-white/54">Ubuntu</p>
                <p className="font-bold">Admin Panel</p>
              </div>
            </div>

            <nav className="mt-9 grid gap-1">
              {navigationItems.map((item, index) => (
                <a
                  className={`rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                    index === 0
                      ? "bg-[#e95420] text-white shadow-lg shadow-[#e95420]/20"
                      : "text-white/66 hover:bg-white/8 hover:text-white"
                  }`}
                  href="#"
                  key={item}
                >
                  {item}
                </a>
              ))}
            </nav>

            <div className="mt-auto rounded-lg border border-white/10 bg-white/[0.04] p-4">
              <p className="text-sm font-semibold text-[#ffb088]">Signed in as</p>
              <p className="mt-1 truncate text-base font-bold">{session.username}</p>
              <p className="mt-2 text-sm leading-6 text-white/56">
                Authenticated with Ubuntu Server credentials.
              </p>
            </div>
          </div>
        </aside>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(233,84,32,0.20),transparent_30%),linear-gradient(135deg,rgba(44,0,30,0.58),rgba(17,17,17,0.98)_56%)]" />

          <div className="relative z-10 px-5 py-5 sm:px-8 lg:px-10">
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ffb088]">
                  Dashboard
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-normal text-white">
                  Welcome, {session.username}
                </h1>
              </div>

              <form action="/api/logout" method="post">
                <button
                  type="submit"
                  className="h-10 rounded-md border border-white/14 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Logout
                </button>
              </form>
            </header>

            <div className="grid gap-6 py-7 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-6">
                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-6 shadow-2xl shadow-black/20">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e95420]">
                        Control center
                      </p>
                      <h2 className="mt-3 text-2xl font-bold tracking-normal">
                        Admin workspace is ready
                      </h2>
                    </div>
                    <span className="rounded-full bg-[#e95420]/18 px-3 py-1 text-sm font-bold text-[#ffb088]">
                      PAM session
                    </span>
                  </div>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-white/66">
                    This dashboard is prepared for user management, permissions,
                    settings, and audit workflows. The login session is tied to
                    your Ubuntu Server account.
                  </p>
                </section>

                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-normal">Quick actions</h2>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {quickActions.map((item) => (
                      <article
                        className="rounded-lg border border-white/10 bg-white/[0.05] p-5 transition hover:border-[#e95420]/60 hover:bg-white/[0.07]"
                        key={item.title}
                      >
                        <h3 className="text-base font-bold">{item.title}</h3>
                        <p className="mt-2 min-h-16 text-sm leading-6 text-white/60">
                          {item.description}
                        </p>
                        <button
                          className="mt-4 h-9 rounded-md bg-[#e95420] px-3 text-sm font-bold text-white transition hover:bg-[#c34113]"
                          type="button"
                        >
                          {item.action}
                        </button>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-[#111111]/70 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold tracking-normal">Admin modules</h2>
                    <button
                      className="rounded-md border border-white/12 px-3 py-2 text-sm font-semibold text-white/76 transition hover:bg-white/10 hover:text-white"
                      type="button"
                    >
                      Configure
                    </button>
                  </div>

                  <div className="grid gap-3">
                    {modules.map((module) => (
                      <div
                        className="grid gap-3 rounded-md border border-white/10 bg-white/[0.04] p-4 sm:grid-cols-[1fr_auto] sm:items-center"
                        key={module.name}
                      >
                        <div>
                          <p className="font-bold text-white">{module.name}</p>
                          <p className="mt-1 text-sm leading-6 text-white/58">
                            {module.detail}
                          </p>
                        </div>
                        <span className="w-fit rounded-full border border-white/12 px-3 py-1 text-sm font-semibold text-white/70">
                          {module.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="grid gap-6">
                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Account</h2>
                  <div className="mt-4 rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">Ubuntu user</p>
                    <p className="mt-1 text-lg font-bold">{session.username}</p>
                  </div>
                  <div className="mt-3 rounded-md bg-black/20 p-4">
                    <p className="text-sm text-white/54">Authentication</p>
                    <p className="mt-1 font-semibold text-[#ffb088]">PAM verified</p>
                  </div>
                </section>

                <section className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
                  <h2 className="text-xl font-bold tracking-normal">Next steps</h2>
                  <div className="mt-4 grid gap-3 text-sm leading-6 text-white/64">
                    <p>Connect user management to Ubuntu groups.</p>
                    <p>Add role checks before each protected admin module.</p>
                    <p>Write audit events when admins change settings.</p>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
