interface Props {
  name: string;
  /** GTFS route_color — hex string without the leading '#' (e.g. "0072BC") */
  color: string;
  /** GTFS route_text_color — hex string without the leading '#' (e.g. "FFFFFF") */
  textColor: string;
}

export default function RailBadge({ name, color, textColor }: Props) {
  return (
    <span
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl font-bold"
      style={{ backgroundColor: `#${color}`, color: `#${textColor}` }}
      aria-label={`${name} line train`}
    >
      {name}
    </span>
  );
}
