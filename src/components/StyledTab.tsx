import { Tab } from "@headlessui/react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export default function StyledTab({ children, className = "" }: Props) {
  return (
    <Tab
      className={({ selected }) =>
        `cursor-pointer rounded-sm border-2 border-black px-5 py-2 font-bold transition-colors ${
          selected
            ? "bg-black text-white"
            : "bg-white text-black hover:bg-gray-100"
        } ${className}`
      }
    >
      {children}
    </Tab>
  );
}
