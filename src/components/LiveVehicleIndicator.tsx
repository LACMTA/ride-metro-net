import { useStore } from "@nanostores/preact";
import { liveVehicles } from "../lib/liveVehicleStore";

interface Props {
  stop_id: string;
  trip_id: string;
}

export default function LiveVehicleIndicator({ stop_id, trip_id }: Props) {
  const $liveVehicles = useStore(liveVehicles);
  const vehicle = $liveVehicles.find(
    (vehicle) => vehicle.trip_id === trip_id && vehicle.stop_id === stop_id,
  );
  return vehicle ? <span>🚆</span> : "";
}
