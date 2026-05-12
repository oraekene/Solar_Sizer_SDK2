declare module "framer-motion" {
  import { ComponentType, ReactNode } from "react";

  interface MotionProps {
    [key: string]: any;
    children?: ReactNode;
  }

  export const motion: {
    div: ComponentType<MotionProps>;
    span: ComponentType<MotionProps>;
    button: ComponentType<MotionProps>;
    [key: string]: ComponentType<MotionProps>;
  };

  interface AnimatePresenceProps {
    children?: ReactNode;
    mode?: "wait" | "sync" | "popLayout";
    initial?: boolean;
    onExitComplete?: () => void;
  }

  export const AnimatePresence: ComponentType<AnimatePresenceProps>;
}
