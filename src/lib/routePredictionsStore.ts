import { atom } from "nanostores";
import type { RoutePredictions } from "../pages/api/predictions";

export const routePredictions = atom<RoutePredictions[]>([]);
