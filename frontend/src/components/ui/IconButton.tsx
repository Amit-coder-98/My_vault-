import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import { timing } from "../../animations/config";

interface Props extends HTMLMotionProps<"button"> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}

export function IconButton({
  icon: Icon,
  label,
  active,
  className = "",
  onClick,
  disabled,
  ...props
}: Props) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      className={`icon-button ${active ? "is-active" : ""} ${className}`}
      whileTap={{ scale: 0.93 }}
      transition={{ duration: timing.micro }}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      <Icon size={19} strokeWidth={1.65} aria-hidden="true" />
    </motion.button>
  );
}
