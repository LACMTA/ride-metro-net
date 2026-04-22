interface Props {
  name: string;
  /** GTFS route_color — hex string without the leading '#' (e.g. "0072BC") */
  color: string;
  /** GTFS route_text_color — hex string without the leading '#' (e.g. "FFFFFF") */
  textColor: string;
  /** When true, renders as a busway badge with no border radius */
  busway?: boolean;
}

export default function RailBadge({
  name,
  color,
  textColor,
  busway = false,
}: Props) {
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center text-xl font-bold${busway ? "" : "rounded-full"}`}
      style={{ backgroundColor: `#${color}`, color: `#${textColor}` }}
      aria-label={`${name} "line" ${busway ? "busway" : "train"}`}
    >
      {name}
    </span>
  );
}
