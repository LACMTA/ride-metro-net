import { useStore } from "@nanostores/react";
import { accessibilityAlertStops } from "../lib/alertStatusStore";
import { CardLinkListItem } from "./Card";

/**
 * Renders a list of rail/busway stops that currently have an active
 * accessibility alert, each linking to the corresponding stop page.
 */
export default function AccessibilityAlertStopList() {
  const stops = useStore(accessibilityAlertStops);

  if (stops.length === 0) {
    return <p className="p-4">No active accessibility alerts.</p>;
  }

  return (
    <>
      {stops.map((stop) => (
        <CardLinkListItem key={stop.stopId} href={`/stops/${stop.stopId}`}>
          <span className="font-bold">{stop.stopName}</span>
        </CardLinkListItem>
      ))}
    </>
  );
}
