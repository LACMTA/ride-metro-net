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
      className={`cursor-pointer rounded-sm border-2 border-black px-5 py-2 font-bold transition-colors ${
        selected
          ? "bg-black text-white"
          : "bg-white text-black hover:bg-gray-100"
      } ${className}`}
    >
      {children}
    </button>
  );
}
