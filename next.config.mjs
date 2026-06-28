/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.1.50", "chidchanun.online"],
  serverExternalPackages: ["authenticate-pam"],
};

export default nextConfig;
