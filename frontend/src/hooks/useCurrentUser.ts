import { useEffect, useState } from "react";

// The CSFAQ project does not yet have a User/Auth module. The Discussion
// Forum still needs a stable "authorId" to attribute questions/replies and
// to check "only the discussion creator may accept an answer". Until a real
// auth module exists, we generate and persist a lightweight local identity.
const STORAGE_KEY = "csfaq_local_user";

function generateId() {
  return `user_${Math.random().toString(36).slice(2, 10)}`;
}

export function useCurrentUser() {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      setUserId(existing);
    } else {
      const id = generateId();
      window.localStorage.setItem(STORAGE_KEY, id);
      setUserId(id);
    }
  }, []);

  return userId;
}
