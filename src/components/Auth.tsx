import { useEffect } from "react";
import { User, AppTab } from "../types";

interface AuthProps {
  onUserChange: (user: User | null) => void;
  onTabChange: (tab: AppTab) => void;
  isDeveloper: boolean;
}

export default function Auth({ onUserChange }: AuthProps) {
  useEffect(() => {
    // Always set user to null until OAuth is configured
    onUserChange(null);
  }, []);

  // Render nothing — add OAuth UI later
  return null;
}
