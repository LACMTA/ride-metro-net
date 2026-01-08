import { atom } from "nanostores";
import type { ConciseAlert } from "../pages/api/alerts";

export const alerts = atom<ConciseAlert[]>([]);
