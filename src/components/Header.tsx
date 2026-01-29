import MetroIcon from "./MetroIcon";

export default function Header() {
  return (
    <header className="flex h-16 items-center justify-center bg-black align-middle">
      <MetroIcon className="text-background-white h-8/12 shrink-0" />
    </header>
  );
}
