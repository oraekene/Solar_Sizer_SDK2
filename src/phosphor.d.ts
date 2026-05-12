declare module "@phosphor-icons/react" {
  import { FC, SVGProps } from "react";
  interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number;
    weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
    color?: string;
    className?: string;
  }
  export const Sun: FC<IconProps>;
  export const Battery: FC<IconProps>;
  export const Lightning: FC<IconProps>;
  export const MapPin: FC<IconProps>;
  export const Plus: FC<IconProps>;
  export const Trash: FC<IconProps>;
  export const Calculator: FC<IconProps>;
  export const CaretRight: FC<IconProps>;
  export const CaretLeft: FC<IconProps>;
  export const Info: FC<IconProps>;
  export const WarningCircle: FC<IconProps>;
  export const CheckCircle: FC<IconProps>;
  export const List: FC<IconProps>;
  export const X: FC<IconProps>;
  export const Database: FC<IconProps>;
  export const Terminal: FC<IconProps>;
  export const ArrowLeft: FC<IconProps>;
  export const SquaresFour: FC<IconProps>;
  export const Gear: FC<IconProps>;
  export const ShieldCheck: FC<IconProps>;
  export const ArrowSquareOut: FC<IconProps>;
  export const Cpu: FC<IconProps>;
  export const Stack: FC<IconProps>;
  export const ChartLine: FC<IconProps>;
  export const WifiHigh: FC<IconProps>;
  export const Percent: FC<IconProps>;
  export const UserCircle: FC<IconProps>;
  export const FloppyDisk: FC<IconProps>;
  export const FolderOpen: FC<IconProps>;
  export const Copy: FC<IconProps>;
  export const Download: FC<IconProps>;
  export const Upload: FC<IconProps>;
  export const Scales: FC<IconProps>;
  export const Clock: FC<IconProps>;
  export const ArrowClockwise: FC<IconProps>;
}
