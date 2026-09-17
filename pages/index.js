import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? router.replace("/dashboard") : router.replace("/login")))
      .catch(() => router.replace("/login"));
  }, [router]);

  return null;
}
