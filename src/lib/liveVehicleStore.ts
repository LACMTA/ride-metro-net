import { atom } from "nanostores";

export type LiveVehicleType = {
  trip_id: string;
  stop_id: string;
  status: string;
  direction_id: number;
};

export const liveVehicles = atom<LiveVehicleType[]>([]);
