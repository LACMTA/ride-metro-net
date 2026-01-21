interface Props {
  name: string;
}

export default function BusPill({ name }: Props) {
  return (
    <span className="text-background-white bg-bus-local rounded-lg px-2.5 py-0.5 text-xl font-bold">
      {name}
    </span>
  );
}
