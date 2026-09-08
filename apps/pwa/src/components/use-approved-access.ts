import { useEffect, useState } from "react";

import type { AccessService } from "../application";

export function useApprovedAccess(userId: string | undefined, service: Pick<AccessService, "hasApprovedAccess"> | null): boolean | undefined {
  const [result, setResult] = useState<{ userId: string; approved: boolean } | null>(null);

  // Auth emits new user objects on refocus/token refresh. Only an account change
  // should restart this gate and unmount the conversation held beneath it.
  useEffect(() => {
    let active = true;
    setResult(null);
    if (userId && service) {
      void service.hasApprovedAccess(userId)
        .then((approved) => { if (active) setResult({ userId, approved }); })
        .catch(() => { if (active) setResult({ userId, approved: false }); });
    }
    return () => { active = false; };
  }, [userId, service]);

  return result?.userId === userId ? result?.approved : undefined;
}
