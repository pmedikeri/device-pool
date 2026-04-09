"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DevicesPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return <div className="text-text-muted text-sm py-12 text-center">Redirecting...</div>;
}
