import { Tab, TabList } from "@headlessui/react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

interface TabProps extends Props {
  badge?: string | number;
  badgeAlert?: boolean;
}

export function StyledTab({
  children,
  className = "",
  badge,
  badgeAlert,
}: TabProps) {
  const hasBadge = typeof badge !== "undefined";
  return (
    <Tab
      className={({ selected }) =>
        `cursor-pointer rounded-t-sm px-5 py-2 font-bold transition-colors ${
          selected ? "bg-background-gray" : "bg-gray-500"
        } ${hasBadge && "pr-4"} ${className}`
      }
    >
      {children}
      {hasBadge && (
        <span
          className={`ml-2 inline-block rounded-sm px-1.5 text-black ${badgeAlert ? "bg-alert" : "bg-gray-300"}`}
        >
          {badge}
        </span>
      )}
    </Tab>
  );
}

export function StyledTabList({ children, className = "" }: Props) {
  return <TabList className={`flex gap-2 ${className}`}>{children}</TabList>;
}

export function StyledTabPanelWrapper({ children, className = "" }: Props) {
  return (
    <div className={`bg-background-gray pt-3 pb-10 ${className}`}>
      {children}
    </div>
  );
}
