interface Props {
  name: string;
}

export default function BusBadge({ name }: Props) {
  return (
    <span
      className="text-background-white bg-bus-local inline-flex h-8 items-center justify-center rounded-lg px-3 text-xl font-bold"
      aria-label={`line ${name} bus`}
    >
      {name}
    </span>
  );
}
