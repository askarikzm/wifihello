// Simple layout for admin login - bypasses the admin auth check
export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
