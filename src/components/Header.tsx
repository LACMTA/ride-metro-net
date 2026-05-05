import Column from "./Column";
import MetroLockup from "./MetroLockup";

export default function Header() {
  return (
    <header className="flex h-16 items-center bg-black">
      <Column wide>
        <MetroLockup className="text-background-white h-10 shrink-0 grow-0" />
      </Column>
    </header>
  );
}
