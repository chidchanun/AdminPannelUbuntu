const loginErrors = {
  missing: "Please enter your Ubuntu username and password.",
  invalid: "Username or password is incorrect.",
  platform: "Ubuntu user login works when this app runs on Ubuntu/Linux Server.",
  pam: "PAM authentication is not configured on this server.",
};

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const errorMessage = loginErrors[params?.error] ?? null;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#2c001e] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(233,84,32,0.38),transparent_28%),linear-gradient(135deg,rgba(119,41,83,0.72),rgba(44,0,30,0.96)_54%,rgba(17,17,17,0.96))]" />
      <div className="absolute inset-x-0 top-0 h-8 bg-[#300a24]/95 shadow-lg shadow-black/20" />

      <form
        action="/api/login"
        method="post"
        className="relative z-10 w-full max-w-[420px] rounded-lg border border-white/12 bg-[#f7f7f7] p-7 text-[#2d2d2d] shadow-2xl shadow-black/35 sm:p-8"
      >
        <div className="mb-7 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#e95420] text-lg font-bold text-white shadow-lg shadow-[#e95420]/35">
            UA
          </div>
          <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#e95420]">
            Ubuntu Admin Panel
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-[#2c001e]">
            Login
          </h1>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-md border border-[#e95420]/30 bg-[#fff1ea] px-4 py-3 text-sm font-semibold text-[#9d2f0d]">
            {errorMessage}
          </div>
        ) : null}

        <label className="block text-sm font-semibold text-[#3d3d3d]" htmlFor="username">
          Ubuntu username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          placeholder="username"
          autoComplete="username"
          className="mt-2 h-12 w-full rounded-md border border-[#d7d3d7] bg-white px-4 text-base text-[#1f1f1f] outline-none transition focus:border-[#e95420] focus:ring-4 focus:ring-[#e95420]/15"
        />

        <label
          className="mt-5 block text-sm font-semibold text-[#3d3d3d]"
          htmlFor="password"
        >
          Ubuntu password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="password"
          autoComplete="current-password"
          className="mt-2 h-12 w-full rounded-md border border-[#d7d3d7] bg-white px-4 text-base text-[#1f1f1f] outline-none transition focus:border-[#e95420] focus:ring-4 focus:ring-[#e95420]/15"
        />

        <button
          type="submit"
          className="cursor-pointer mt-7 h-12 w-full rounded-md bg-[#e95420] px-5 text-base font-bold text-white shadow-lg shadow-[#e95420]/25 transition hover:bg-[#c34113] focus:outline-none focus:ring-4 focus:ring-[#e95420]/30"
        >
          Login
        </button>
      </form>
    </main>
  );
}
