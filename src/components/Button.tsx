import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
}

export default function Button({
  children,
  selected = false,
  className = "",
  onClick,
}: Props) {
  return (
    <button
      onClick={onClick}
      className={`bg-blue cursor-pointer rounded-sm px-5 py-2 text-white ${className}`}
    >
      {children}
    </button>
  );
}
