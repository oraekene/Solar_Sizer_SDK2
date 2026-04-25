import { useEffect } from 'react';
import { AppTab, User } from '../types';

interface AuthProps {
  onUserChange: (user: User | null) => void;
  onTabChange: (tab: AppTab) => void;
  isDeveloper: boolean;
}

export default function Auth({ onUserChange }: AuthProps) {
  useEffect(() => {
    // This deployment intentionally keeps auth disabled.
    onUserChange(null);
  }, [onUserChange]);

  // Render nothing while auth remains out of scope.
  return null;
}
