import { Tab, TabList } from "@headlessui/react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

export function StyledTab({ children, className = "" }: Props) {
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

export function StyledTabList({ children, className = "" }: Props) {
  return <TabList className="flex gap-2">{children}</TabList>;
}

export function StyledTabPanelWrapper({ children, className = "" }: Props) {
  return (
    <div className={`bg-background-gray pt-3 pb-10 ${className}`}>
      {children}
    </div>
  );
}
