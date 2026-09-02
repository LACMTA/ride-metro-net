import Column from "./Column";
import MetroLockup from "./MetroLockup";

export default function Header() {
  return (
    <header className="flex h-16 items-center bg-black">
      <Column wide>
        <a href="https://www.metro.net/">
          <MetroLockup className="text-background-white inline h-10 shrink-0 grow-0" />
        </a>
      </Column>
    </header>
  );
}
