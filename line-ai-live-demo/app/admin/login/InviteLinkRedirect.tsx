"use client";

import { useEffect } from "react";

export function InviteLinkRedirect() {
  useEffect(() => {
    if (window.location.hash.includes("access_token=")) {
      window.location.replace(`/admin/activate${window.location.hash}`);
    }
  }, []);

  return null;
}
