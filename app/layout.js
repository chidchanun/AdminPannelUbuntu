import "./globals.css";
import "@xterm/xterm/css/xterm.css";
export const metadata = {
  title: "Ubuntu Admin Panel",
  description: "Secure login for Ubuntu server administration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#1c1b22]">{children}</body>
    </html>
  );
}
